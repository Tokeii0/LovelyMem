/**
 * Profile管理工具
 * 用于管理Volatility2的Profile信息，包括存储、加载和UI更新
 */

export class ProfileManager {
  /**
   * 尝试从localStorage加载并应用Profile信息到vol2-profile下拉框
   * 优先使用 settings.json 中用户手动保存的 profile，否则使用自动检测的 suggested_profile
   */
  public static tryApplyStoredProfileInfo(): boolean {
    try {
      const stored = localStorage.getItem('detected_profile_info');
      if (!stored) {
        return false;
      }

      const profileData = JSON.parse(stored);

      // 检查数据是否过期（24小时）
      const age = Date.now() - (profileData.timestamp || 0);
      const maxAge = 24 * 60 * 60 * 1000; // 24小时
      
      if (age > maxAge) {
        localStorage.removeItem('detected_profile_info');
        return false;
      }

      // 尝试应用到UI - suggested_profile 已在用户手动选择时同步更新
      return this.applyProfileInfoToUI(profileData.profile_list, profileData.suggested_profile);
    } catch (error) {
      console.error('加载Profile信息失败:', error);
      return false;
    }
  }

  /**
   * 异步版本：尝试从localStorage加载并应用Profile信息，优先使用settings.json中保存的值
   */
  public static async tryApplyStoredProfileInfoAsync(): Promise<boolean> {
    try {
      const stored = localStorage.getItem('detected_profile_info');
      if (!stored) {
        return false;
      }

      const profileData = JSON.parse(stored);

      // 检查数据是否过期（24小时）
      const age = Date.now() - (profileData.timestamp || 0);
      const maxAge = 24 * 60 * 60 * 1000; // 24小时
      
      if (age > maxAge) {
        localStorage.removeItem('detected_profile_info');
        return false;
      }

      // 从 settings.json 读取用户手动保存的 profile
      let savedProfile: string | undefined;
      try {
        const { loadAppSettings } = await import('../core/settingsHelper');
        const settings = await loadAppSettings();
        savedProfile = settings.volatility2_profile;
      } catch (e) {
        // 静默失败，降级使用 suggested_profile
      }

      // 优先使用 settings.json 中保存的值
      const activeProfile = savedProfile || profileData.suggested_profile;
      return this.applyProfileInfoToUI(profileData.profile_list, activeProfile);
    } catch (error) {
      console.error('加载Profile信息失败:', error);
      return false;
    }
  }

  /**
   * 应用Profile信息到UI下拉框
   */
  private static applyProfileInfoToUI(profileList: string[], suggestedProfile?: string): boolean {
    const selectElement = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (!selectElement) {
      return false;
    }

    // 清空现有选项
    selectElement.innerHTML = '';

    // 添加新的profile选项
    profileList.forEach((profile, index) => {
      const option = document.createElement('option');
      option.value = profile;
      option.textContent = profile;
      
      // 优先使用 suggestedProfile（已是用户手动选择或自动检测的值）
      if (suggestedProfile && profile === suggestedProfile) {
        option.selected = true;
      } else if (!suggestedProfile && index === 0) {
        // 如果没有建议的profile，选中第一个
        option.selected = true;
      }
      
      selectElement.appendChild(option);
    });

    return true;
  }

  /**
   * 监听DOM变化，当vol2-profile元素出现时自动应用Profile信息
   */
  public static startAutoApplyWatcher(): void {
    // 使用MutationObserver监听DOM变化
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // 检查是否有新增的节点包含vol2-profile
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // 检查新增的元素或其子元素是否包含vol2-profile
              const vol2Select = element.querySelector('#vol2-profile') || 
                                (element.id === 'vol2-profile' ? element : null);
              
              if (vol2Select) {
                // 延迟一点确保元素完全渲染，使用异步版本优先读取 settings.json
                setTimeout(async () => {
                  const applied = await this.tryApplyStoredProfileInfoAsync();
                  // 如果第一次没有成功，再延迟重试一次
                  if (!applied) {
                    setTimeout(async () => {
                      await this.tryApplyStoredProfileInfoAsync();
                    }, 500);
                  }
                }, 100);
              }
            }
          });
        }
      });
    });

    // 开始观察整个document的变化
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * 手动检查并应用Profile信息（可由UI切换事件调用）
   */
  public static checkAndApplyProfileInfo(): void {
    // 首先检查是否有存储的数据
    const stored = localStorage.getItem('detected_profile_info');
    if (!stored) {
      return;
    }
    
    // 检查当前页面是否有vol2-profile元素
    const selectElement = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (!selectElement) {
      return;
    }
    
    this.tryApplyStoredProfileInfo();
  }

  /**
   * 存储Profile信息到localStorage
   */
  public static storeDetectedProfileInfo(profileList: string[], suggestedProfile?: string): void {
    try {
      const profileData = {
        profile_list: profileList,
        suggested_profile: suggestedProfile,
        timestamp: Date.now()
      };
      
      localStorage.setItem('detected_profile_info', JSON.stringify(profileData));
      //console.log('💾 Profile信息已存储:', profileData);
    } catch (error) {
      console.error('❌ 存储Profile信息失败:', error);
    }
  }

  /**
   * 清除存储的Profile信息
   */
  public static clearStoredProfileInfo(): void {
    try {
      localStorage.removeItem('detected_profile_info');
      //console.log('🧹 已清除存储的Profile信息');
    } catch (error) {
      console.error('❌ 清除Profile信息失败:', error);
    }
  }
}

// 自动启动监听器
ProfileManager.startAutoApplyWatcher(); 
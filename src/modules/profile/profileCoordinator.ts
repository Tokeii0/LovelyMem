/**
 * Profile 协调器
 * 集中管理所有 Profile 检测逻辑和 UI 更新
 */

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { StateManager } from '../core/stateManager';
import { ModernUIRenderer } from '../ui/modernUIRenderer';
import { CommandWindowManager } from '../ui/commandWindowManager';

export class ProfileCoordinator {
  constructor(
    private stateManager: StateManager,
    private modernUIRenderer: ModernUIRenderer,
    private commandWindowManager: CommandWindowManager,
    private onRender: () => void
  ) {}

  /**
   * 初始化 Profile 检测事件监听器
   */
  async initialize(): Promise<void> {
    try {
      // 监听检测失败事件
      await listen('profile_detection_failed', (event: any) => {
        console.log('🚫 收到Profile检测失败事件:', event.payload);
        const failureData = event.payload;
        this.handleDetectionFailed(failureData);
      });

      // 监听检测成功事件
      await listen('profile_detection_success', (event: any) => {
        console.log('✅ 收到Profile检测成功事件:', event.payload);
        const successData = event.payload;
        this.handleDetectionSuccess(successData);
      });

      // 监听 Windows 10 profile 检测事件
      await listen('windows_10_profile_detected', async (event: any) => {
        console.log('🔍 收到Windows 10 Profile检测事件:', event.payload);
        const profileData = event.payload;
        await this.handleWindows10ProfileDetected(profileData);
      });

      // 监听 Windows 10 profile 准备就绪事件
      await listen('windows_10_profile_ready', async (event: any) => {
        console.log('✅ 收到Windows 10 Profile准备就绪事件:', event.payload);
        const profileData = event.payload;
        await this.handleWindows10ProfileReady(profileData);
      });

      console.log('🎧 Profile检测事件监听器已启动');
    } catch (error) {
      console.error('❌ 启动Profile检测事件监听器失败:', error);
    }
  }

  /**
   * 处理检测失败
   */
  private handleDetectionFailed(failureData: any): void {
    // 禁用Volatility2区域
    this.disableVolatility2Area(failureData.reason, failureData.message);

    // 显示提示信息
    this.stateManager.addCommandOutput(`⚠️ ${failureData.message}`);
    this.commandWindowManager.updateCommandWindowDisplay();

    // 恢复重新检测按钮状态
    this.restoreRetryProfileButton();
  }

  /**
   * 处理检测成功
   */
  private handleDetectionSuccess(successData: any): void {
    // 重新启用Volatility2区域
    this.enableVolatility2Area(successData);

    // 显示成功信息
    this.stateManager.addCommandOutput(`✅ Profile检测成功: ${successData.suggested_profile || '已检测到可用Profile'}`);
    this.commandWindowManager.updateCommandWindowDisplay();
  }

  /**
   * 禁用Volatility2区域
   */
  private disableVolatility2Area(reason: string, message: string): void {
    console.log(`🚫 禁用Volatility2区域: ${reason} - ${message}`);

    // 设置Volatility2区域为禁用状态
    this.stateManager.setVolatility2Disabled(true, message);

    // 如果当前在Volatility2区域（索引2），切换到MemProcFS V2区域
    if (this.stateManager.getSelectedAvatar() === 2) {
      this.stateManager.setSelectedAvatar(0);
    }

    // 只更新侧边栏禁用状态，不做全量重渲染（避免破坏 V2 工作区布局）
    this.modernUIRenderer.updateState(this.stateManager.getState());
    this.updateSidebarDisabledState(2, true);  // Vol2 V2
    this.updateSidebarDisabledState(5, true);  // Vol2 手动版本
  }

  /**
   * 重新启用Volatility2区域
   */
  private enableVolatility2Area(profileData: any): void {
    console.log(`✅ 重新启用Volatility2区域:`, profileData);

    // 设置Volatility2区域为启用状态
    this.stateManager.setVolatility2Disabled(false);

    // 存储Profile信息到localStorage，包含 timestamp
    if (profileData.profile_list && profileData.profile_list.length > 0) {
      const profileInfo = {
        detected_os: profileData.detected_os,
        suggested_profile: profileData.suggested_profile,
        profile_list: profileData.profile_list,
        timestamp: Date.now()
      };
      localStorage.setItem('detected_profile_info', JSON.stringify(profileInfo));
      console.log('📂 Profile信息已存储到localStorage');

      // 同步保存到 settings.json，确保右键菜单等读取 settings 的地方能拿到最新 profile
      const profileToSave = profileData.suggested_profile || profileData.profile_list[0];
      if (profileToSave) {
        invoke('save_volatility2_profile', { profile: profileToSave }).catch(err => {
          console.error('❌ 保存检测到的 Profile 到 settings.json 失败:', err);
        });
        console.log('💾 检测到的 Profile 已保存到 settings.json:', profileToSave);
      }

      // 立即尝试应用到 vol2-profile 下拉框
      this.applyProfileToSelect(profileData.profile_list, profileData.suggested_profile);
    }

    // 只更新侧边栏启用状态，不做全量重渲染（避免破坏 V2 工作区布局）
    this.modernUIRenderer.updateState(this.stateManager.getState());
    this.updateSidebarDisabledState(2, false);  // Vol2 V2
    this.updateSidebarDisabledState(5, false);  // Vol2 手动版本

    // 延迟尝试应用 Profile 到下拉框
    setTimeout(() => {
      if (profileData.profile_list && profileData.profile_list.length > 0) {
        this.applyProfileToSelect(profileData.profile_list, profileData.suggested_profile);
      }
    }, 100);
  }

  /**
   * 应用 Profile 到 vol2-profile 下拉框
   */
  private applyProfileToSelect(profileList: string[], suggestedProfile?: string): void {
    const selectElement = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (!selectElement) {
      console.log('🔍 vol2-profile 下拉框不存在，用户可能不在 Volatility2 区域');
      return;
    }

    console.log('✅ 找到 vol2-profile 下拉框，应用 Profile 列表:', profileList);

    // 清空现有选项
    selectElement.innerHTML = '';

    // 添加新的 profile 选项
    profileList.forEach((profile, index) => {
      const option = document.createElement('option');
      option.value = profile;
      option.textContent = profile;

      // 如果是建议的 profile，设为选中状态
      if (suggestedProfile && profile === suggestedProfile) {
        option.selected = true;
      } else if (!suggestedProfile && index === 0) {
        option.selected = true;
      }

      selectElement.appendChild(option);
    });

    console.log('✅ Profile 选项已应用到下拉框，选中:', suggestedProfile || profileList[0]);
  }

  /**
   * 更新侧边栏中指定区域的禁用状态（仅 DOM 操作，不做全量重渲染）
   */
  private updateSidebarDisabledState(areaIndex: number, disabled: boolean): void {
    const areaSections = document.querySelectorAll('.area-section');
    const targetSection = areaSections[areaIndex] as HTMLElement;
    if (targetSection) {
      targetSection.setAttribute('data-disabled', disabled.toString());
      if (disabled) {
        targetSection.classList.add('disabled');
        targetSection.style.opacity = '0.5';
        targetSection.style.pointerEvents = 'none';
      } else {
        targetSection.classList.remove('disabled');
        targetSection.style.opacity = '';
        targetSection.style.pointerEvents = '';
      }
    }
  }

  /**
   * 恢复重新检测按钮状态
   */
  private restoreRetryProfileButton(): void {
    const retryBtn = document.querySelector('.retry-profile-btn') as HTMLButtonElement;
    if (retryBtn) {
      retryBtn.disabled = false;
      retryBtn.textContent = '🔄 重新检测 Profile';
    }
  }

  /**
   * 处理 Windows 10 Profile 检测
   */
  private async handleWindows10ProfileDetected(profileData: any): Promise<void> {
    console.log('Windows 10 Profile 数据:', profileData);

    // 存储到 localStorage
    localStorage.setItem('windows_10_profile_data', JSON.stringify(profileData));

    // 应用 Windows 10 Profile 到 UI
    this.applyWindows10ProfileToUI(profileData);

    // 显示成功消息
    this.stateManager.addCommandOutput(`✅ Windows 10 Profile 检测成功`);
    this.commandWindowManager.updateCommandWindowDisplay();
  }

  /**
   * 处理 Windows 10 Profile 准备就绪
   */
  private async handleWindows10ProfileReady(profileData: any): Promise<void> {
    console.log('Windows 10 Profile 准备就绪:', profileData);

    // 显示就绪消息
    this.stateManager.addCommandOutput(`✅ Windows 10 Profile 准备就绪，可以开始使用`);
    this.commandWindowManager.updateCommandWindowDisplay();

    // 不做全量重渲染，避免破坏 V2 工作区布局
  }

  /**
   * 应用 Windows 10 Profile 到 UI
   */
  private applyWindows10ProfileToUI(profileData: any): void {
    // 更新配置选择器显示
    const profileSelector = document.querySelector('.profile-selector');
    if (profileSelector) {
      profileSelector.textContent = `Windows 10 Profile (${profileData.build || 'Unknown'})`;
    }

    // 更新渲染器状态（不做全量重渲染）
    this.modernUIRenderer.updateState(this.stateManager.getState());
  }

  /**
   * 处理 Profile 事件
   */
  handleProfileEvents(commandData: any): void {
    // 如果是检测完成事件
    if (commandData.status === 'completed' && commandData.output) {
      this.handleProfileDetectionComplete(commandData);
    }
  }

  /**
   * 处理 Profile 检测完成
   */
  private handleProfileDetectionComplete(commandData: any): void {
    console.log('Profile检测完成，处理结果...');

    // 尝试从输出中解析Profile信息
    try {
      // 检查是否包含建议的Profile
      if (commandData.output.includes('建议使用Profile')) {
        // 提取Profile信息
        const profileMatch = commandData.output.match(/建议使用Profile[：:]\s*(\S+)/);
        if (profileMatch && profileMatch[1]) {
          const suggestedProfile = profileMatch[1];

          // 更新配置选择状态
          this.updateConfigSelectorState(suggestedProfile);

          // 显示提示信息
          this.stateManager.addCommandOutput(`✅ 检测到建议Profile: ${suggestedProfile}`);
        }
      }

      // 检查是否是Windows 10
      if (commandData.output.includes('Windows 10') || commandData.output.includes('Win10')) {
        console.log('检测到Windows 10，等待Profile准备就绪...');
      }
    } catch (error) {
      console.error('解析Profile信息失败:', error);
    }
  }

  /**
   * 更新配置选择状态
   */
  private updateConfigSelectorState(suggestedProfile: string): void {
    // 存储建议的Profile
    localStorage.setItem('suggested_profile', suggestedProfile);

    // 重新渲染UI
    this.modernUIRenderer.updateState(this.stateManager.getState());
  }
}

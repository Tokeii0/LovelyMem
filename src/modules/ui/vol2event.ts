/**
 * Volatility2 事件处理器
 * 专门处理所有 Volatility2 相关功能的事件
 */

import { LovelymemApp } from '../core/app';
import { loadAppSettings } from '../core/settingsHelper';

export class Vol2EventHandler {
  private app: LovelymemApp;

  constructor(app: LovelymemApp) {
    this.app = app;
  }

  /**
   * 处理 Volatility2 功能点击事件
   */
  handleVol2Feature(feature: string): void {
    // 移除 vol2- 前缀，获取实际功能名
    const actualFeature = feature.replace(/^vol2-/, '');
    //console.log(`🔍 DEBUG: 启动Volatility2 ${actualFeature}功能`);

    // 所有的功能都通过统一的 handleVolatility2Feature 方法处理
    this.app.featureHandlers.handleVolatility2Feature(actualFeature);
  }

  /**
   * 检查是否是 Volatility2 功能
   */
  static isVol2Feature(feature: string): boolean {
    return feature.startsWith('vol2-') || feature.startsWith('vol2v2-');
  }

  /**
   * 获取所有支持的 Volatility2 功能列表
   */
  static getSupportedFeatures(): string[] {
    return [
      // 现有功能
      'vol2-pslist', 'vol2-imageinfo', 'vol2-psscan', 'vol2-netscan', 
      'vol2-filescan', 'vol2-hashdump', 'vol2-memdump', 'vol2-malfind',
      
      // 进程相关功能
      'vol2-psxview', 'vol2-handles', 'vol2-privs', 'vol2-cmdline', 
      'vol2-cmdscan', 'vol2-consoles', 'vol2-envars', 'vol2-dlllist',
      
      // 内存管理相关功能
      'vol2-vadinfo', 'vol2-modules', 'vol2-unloadedmodules', 'vol2-ssdt', 
      'vol2-timers', 'vol2-gditimers', 'vol2-driverscan', 'vol2-driverirp', 'vol2-bigpools',
      
      // 文件系统相关功能
      'vol2-mftparser', 'vol2-shellbags',
      
      // 注册表相关功能
      'vol2-printkey', 'vol2-dumpregistry', 'vol2-shimcache', 'vol2-auditpol',
      
      // 服务相关功能
      'vol2-svcscan',
      
      // 浏览器历史功能
      'vol2-userassist', 'vol2-iehistory', 'vol2-chromehistory', 'vol2-firefoxhistory',
      
      // 加密和安全功能
      'vol2-truecryptsummary','vol2-mimikatz','vol2-truecryptmaster','vol2-truecryptpassphrase',
      
      // 窗口和GUI功能
      'vol2-windows', 'vol2-wintree', 'vol2-deskscan', 'vol2-session', 
      'vol2-clipboard', 'vol2-editbox',
      
      // 系统信息功能
      'vol2-verinfo', 'vol2-shutdowntime', 'vol2-atoms', 'vol2-atomscan', 'vol2-vboxinfo', 'vol2-callbacks',
      
      // 恶意代码检测功能
      'vol2-apihooks', 'vol2-mutantscan', 'vol2-eventhooks', 'vol2-messagehooks', 'vol2-symlinkscan',
      
      // 时间线功能
      'vol2-timeliner'
    ];
  }

  /**
   * 绑定 Profile 选择器事件
   */
  bindProfileEvents(): void {
    // 使用事件委托的方式监听 vol2-profile 选择器变化
    document.removeEventListener('change', this.handleDocumentChange);
    document.removeEventListener('input', this.handleDocumentChange);

    document.addEventListener('change', this.handleDocumentChange);
    document.addEventListener('input', this.handleDocumentChange);

    // 检查当前是否有 vol2-profile 元素并尝试加载保存的值
    const vol2ProfileSelect = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (vol2ProfileSelect && vol2ProfileSelect.options.length > 0 && !vol2ProfileSelect.value) {
      this.loadSavedProfileValue(vol2ProfileSelect);
    }
  }

  /**
   * 处理文档级别的 change/input 事件（事件委托）
   */
  private handleDocumentChange = (e: Event): void => {
    const target = e.target as HTMLElement;
    if (target.id === 'vol2-profile' && target.tagName === 'SELECT') {
      this.handleVol2ProfileChange(e);
    }
  };

  /**
   * 处理 vol2-profile 选择变化
   */
  private handleVol2ProfileChange = async (e: Event): Promise<void> => {
    if (!e.isTrusted) return;

    const target = e.target as HTMLSelectElement;
    const selectedProfile = target.value;

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_volatility2_profile', { profile: selectedProfile });

      // 同步更新 localStorage 中的 suggested_profile，防止 MutationObserver 覆盖用户手动选择
      try {
        const stored = localStorage.getItem('detected_profile_info');
        if (stored) {
          const profileData = JSON.parse(stored);
          profileData.suggested_profile = selectedProfile;
          localStorage.setItem('detected_profile_info', JSON.stringify(profileData));
        }
      } catch (syncError) {
        console.warn('同步 localStorage Profile 失败:', syncError);
      }
    } catch (error) {
      console.error('❌ 保存 Volatility2 Profile 失败:', error);
    }
  };

  /**
   * 加载保存的 Profile 值到选择器
   */
  private async loadSavedProfileValue(selectElement: HTMLSelectElement): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const settings = await loadAppSettings();
      const savedProfile = settings.volatility2_profile;

      if (savedProfile) {
        // 检查保存的 profile 是否在选项中
        let found = false;
        for (let i = 0; i < selectElement.options.length; i++) {
          if (selectElement.options[i].value === savedProfile) {
            selectElement.selectedIndex = i;
            found = true;
            break;
          }
        }
        
        if (!found) {
          // 如果没找到完全匹配的，尝试模糊匹配
          for (let i = 0; i < selectElement.options.length; i++) {
            if (selectElement.options[i].value.includes(savedProfile) || savedProfile.includes(selectElement.options[i].value)) {
              selectElement.selectedIndex = i;
              break;
            }
          }
        }
      }
    } catch (error) {
      console.error('加载保存的 Profile 失败:', error);
    }
  }
}
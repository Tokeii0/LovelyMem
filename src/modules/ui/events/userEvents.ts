import { LovelymemApp } from '../../core/app';
import { StateManager } from '../../core/stateManager';
import { IconParkHelper } from '../../utils/iconparkHelper';
import { watermarkManager } from '../watermarkManager';
import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../core/settingsHelper';
import { getAppVersion } from '../../core/appVersion';
import { MessageManager } from '../../utils/message';

export class UserEvents {
  private app: LovelymemApp;
  private stateManager: StateManager;
  private updateStatus: (text: string) => void;
  private isMenuToggling: boolean = false;

  constructor(
    app: LovelymemApp,
    stateManager: StateManager,
    updateStatus: (text: string) => void
  ) {
    this.app = app;
    this.stateManager = stateManager;
    this.updateStatus = updateStatus;
  }

  /**
   * 绑定用户相关事件
   */
  bindUserEvents(): void {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.handleLogin());
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    // 用户信息点击事件
    if (userInfo) {
      userInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleUserInfoClick();
      });
    }
  }

  /**
   * 处理登录
   */
  private async handleLogin(): Promise<void> {
    try {
      console.log('👤 用户点击登录');
      this.updateStatus('正在登录...');
      // 模拟登录成功
      setTimeout(() => {
        this.updateUserUI(true, 'Admin User');
        this.updateStatus('登录成功');
      }, 1000);
    } catch (error) {
      console.error('登录失败:', error);
      this.updateStatus('登录失败');
    }
  }

  /**
   * 处理登出
   */
  private async handleLogout(): Promise<void> {
    try {
      console.log('👤 用户点击登出');
      this.updateStatus('正在登出...');
      setTimeout(() => {
        this.updateUserUI(false);
        this.updateStatus('已登出');
      }, 500);
    } catch (error) {
      console.error('登出失败:', error);
      this.updateStatus('登出失败');
    }
  }

  /**
   * 更新用户界面
   */
  private updateUserUI(isLoggedIn: boolean, username?: string): void {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const userNameDisplay = document.getElementById('user-name-display');

    if (isLoggedIn) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (userInfo) userInfo.style.display = 'flex';
      if (userNameDisplay && username) userNameDisplay.textContent = username;
    } else {
      if (loginBtn) loginBtn.style.display = 'flex';
      if (userInfo) userInfo.style.display = 'none';
    }
  }

  /**
   * 处理用户信息点击
   */
  private handleUserInfoClick(): void {
    if (this.isMenuToggling) return;
    
    this.isMenuToggling = true;
    setTimeout(() => {
      this.isMenuToggling = false;
    }, 300);
    
    this.toggleUserMenu();
  }

  /**
   * 切换用户菜单
   */
  private toggleUserMenu(): void {
    const existingMenus = document.querySelectorAll('.user-menu');
    if (existingMenus.length > 0) {
      existingMenus.forEach((menu) => menu.remove());
      return;
    }
    
    const userMenuIcon = document.querySelector('.user-menu-icon');
    if (!userMenuIcon) return;

    const menu = document.createElement('div');
    menu.className = 'user-menu';
    
    menu.innerHTML = `
        <div class="user-menu-item" data-action="settings">
          <span class="menu-icon">${IconParkHelper.getSvgString('setting', { size: 16 })}</span>
          <span class="menu-text">应用设置</span>
        </div>
        <div class="user-menu-item submenu-parent" data-submenu="watermark-settings">
          <span class="menu-icon">${IconParkHelper.getSvgString('drop', { size: 16 })}</span>
          <span class="menu-text">水印设置</span>
          <span class="submenu-arrow">${IconParkHelper.getSvgString('right', { size: 12 })}</span>
        </div>
        <div class="user-menu-separator"></div>
        <div class="user-menu-item" data-action="about">
          <span class="menu-icon">${IconParkHelper.getSvgString('info', { size: 16 })}</span>
          <span class="menu-text">关于软件</span>
        </div>
      `;

    const iconRect = userMenuIcon.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.zIndex = '10000';

    document.body.appendChild(menu);

    const menuRect = menu.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    let top = iconRect.bottom + 8;
    let right = windowWidth - iconRect.right;

    if (top + menuRect.height > windowHeight - 10) {
      top = iconRect.top - menuRect.height - 8;
    }

    if (right + menuRect.width > windowWidth - 10) {
      right = windowWidth - iconRect.left - menuRect.width;
    }

    top = Math.max(10, Math.min(top, windowHeight - menuRect.height - 10));
    right = Math.max(10, Math.min(right, windowWidth - menuRect.width - 10));

    menu.style.top = `${top}px`;
    menu.style.right = `${right}px`;

    menu.addEventListener('click', (e) => {
      const menuItem = (e.target as HTMLElement).closest('.user-menu-item');
      if (menuItem) {
        const action = menuItem.getAttribute('data-action');
        const submenu = menuItem.getAttribute('data-submenu');

        if (submenu) {
          this.showSubmenu(menuItem as HTMLElement, submenu, menu as HTMLElement);
          return;
        }

        if (action) {
          this.handleUserMenuAction(action);
          menu.remove();
        }
      }
    });

    setTimeout(() => {
      document.addEventListener('click', (e) => {
        if (!menu.contains(e.target as Node) && !userMenuIcon.contains(e.target as Node)) {
          menu.remove();
        }
      }, { once: true });
    }, 0);
  }

  /**
   * 显示二级菜单
   */
  private showSubmenu(parentItem: HTMLElement, submenuType: string, parentMenu: HTMLElement): void {
    const existingSubmenu = document.querySelector('.user-submenu');
    if (existingSubmenu) {
      existingSubmenu.remove();
    }

    const submenu = document.createElement('div');
    submenu.className = 'user-submenu';

    let submenuContent = '';
    if (submenuType === 'watermark-settings') {
      submenuContent = `
        <div class="user-menu-item" data-action="toggle-watermark">
          <span class="menu-icon">${IconParkHelper.getSvgString('drop', { size: 16 })}</span>
          <span class="menu-text">水印开关</span>
        </div>
        <div class="user-menu-item" data-action="customize-watermark">
          <span class="menu-icon">${IconParkHelper.getSvgString('edit', { size: 16 })}</span>
          <span class="menu-text">自定义水印</span>
        </div>
      `;
    }

    submenu.innerHTML = submenuContent;

    const parentRect = parentItem.getBoundingClientRect();
    const parentMenuRect = parentMenu.getBoundingClientRect();

    document.body.appendChild(submenu);

    const submenuRect = submenu.getBoundingClientRect();

    let left = parentMenuRect.right + 5;
    let top = parentRect.top;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (left + submenuRect.width > windowWidth) {
      left = parentMenuRect.left - submenuRect.width - 5;
    }

    if (top + submenuRect.height > windowHeight) {
      top = windowHeight - submenuRect.height - 10;
    }

    submenu.style.left = `${left}px`;
    submenu.style.top = `${top}px`;

    submenu.addEventListener('click', (e) => {
      const menuItem = (e.target as HTMLElement).closest('.user-menu-item');
      if (menuItem) {
        const action = menuItem.getAttribute('data-action');
        if (action) {
          this.handleUserMenuAction(action);
          parentMenu.remove();
          submenu.remove();
        }
      }
    });

    parentItem.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!submenu.matches(':hover') && !parentItem.matches(':hover')) {
          submenu.remove();
        }
      }, 100);
    });

    submenu.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!submenu.matches(':hover') && !parentItem.matches(':hover')) {
          submenu.remove();
        }
      }, 100);
    });
  }

  /**
   * 处理用户菜单操作
   */
  private handleUserMenuAction(action: string | null): void {
    switch (action) {
      case 'open-theme-editor':
        this.app.openThemeEditor();
        break;
      case 'settings':
        this.app.showSettingsDialog();
        break;
      case 'about':
        this.showAboutDialog();
        break;
      case 'toggle-watermark':
        this.handleToggleWatermark();
        break;
      case 'customize-watermark':
        this.handleCustomizeWatermark();
        break;
    }
  }

  private async showAboutDialog(): Promise<void> {
    const ver = await getAppVersion();
    MessageManager.showInfo(`Lovelymem V2 ${ver} | By: Tokeii`);
  }

  private async handleToggleWatermark(): Promise<void> {
    try {
      // 加载当前设置
      const settings = await loadAppSettings();

      const watermarkConfig: any = settings.watermark_config
        ? { ...settings.watermark_config }
        : { enabled: true, custom_text: '', opacity: 0.1, font_size: 20, density: 1.0 };

      // 切换开关
      watermarkConfig.enabled = !watermarkConfig.enabled;

      settings.watermark_config = watermarkConfig;

      await invoke('save_settings_command', { settings });

      // 更新水印管理器配置
      watermarkManager.setConfig(watermarkConfig);

      // 更新水印显示
      if (watermarkConfig.enabled) {
        watermarkManager.addWatermark('Lovelymem V2');
        this.updateStatus('水印已开启');
      } else {
        watermarkManager.removeWatermark();
        this.updateStatus('水印已关闭');
      }

      console.log('✅ 水印开关已切换:', watermarkConfig.enabled);
    } catch (error) {
      console.error('❌ 切换水印开关失败:', error);
      this.updateStatus('切换水印开关失败');
    }
  }

  private async handleCustomizeWatermark(): Promise<void> {
    try {
      // 加载当前设置
      const settings = await loadAppSettings();

      const watermarkConfig: any = settings.watermark_config
        ? { ...settings.watermark_config }
        : { enabled: true, custom_text: '', opacity: 0.1, font_size: 20, density: 1.0 };

      // 显示自定义对话框
      this.showWatermarkCustomizeDialog(watermarkConfig);

    } catch (error) {
      console.error('❌ 自定义水印失败:', error);
      this.updateStatus('自定义水印失败');
    }
  }

  /**
   * 显示水印自定义对话框
   */
  private showWatermarkCustomizeDialog(currentConfig: any): void {
    const dialog = document.createElement('div');
    dialog.className = 'watermark-customize-dialog';
    dialog.innerHTML = `
      <div class="watermark-customize-overlay"></div>
      <div class="watermark-customize-content">
        <div class="watermark-customize-header">
          <span class="watermark-customize-icon">💧</span>
          <h3>自定义水印</h3>
        </div>
        <div class="watermark-customize-body">
          <div class="watermark-form-group">
            <label>自定义文本</label>
            <input type="text" class="watermark-custom-text"
                   value="${currentConfig.custom_text || ''}"
                   placeholder="留空则使用默认水印">
          </div>
          <div class="watermark-form-group">
            <label class="opacity-label">透明度 (${currentConfig.opacity || 0.1})</label>
            <input type="range" class="watermark-opacity"
                   min="0.05" max="0.3" step="0.05"
                   value="${currentConfig.opacity || 0.1}">
          </div>
          <div class="watermark-form-group">
            <label class="font-size-label">字体大小 (${currentConfig.font_size || 20}px)</label>
            <input type="range" class="watermark-font-size"
                   min="12" max="40" step="2"
                   value="${currentConfig.font_size || 20}">
          </div>
          <div class="watermark-form-group">
            <label class="density-label">密集程度 (${currentConfig.density || 1.0})</label>
            <input type="range" class="watermark-density"
                   min="0.5" max="2.0" step="0.1"
                   value="${currentConfig.density || 1.0}">
            <div class="watermark-density-hint">0.5=稀疏 | 1.0=默认 | 2.0=密集</div>
          </div>
        </div>
        <div class="watermark-customize-footer">
          <button class="watermark-cancel-btn">取消</button>
          <button class="watermark-save-btn">保存</button>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .watermark-customize-dialog {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10000;
      }

      .watermark-customize-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
      }

      .watermark-customize-content {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--bg-primary, white);
        border-radius: 12px;
        padding: 24px;
        min-width: 400px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      }

      .watermark-customize-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
      }

      .watermark-customize-icon {
        font-size: 32px;
      }

      .watermark-customize-header h3 {
        margin: 0;
        font-size: 20px;
        color: var(--text-primary, #1e293b);
      }

      .watermark-customize-body {
        margin-bottom: 20px;
      }

      .watermark-form-group {
        margin-bottom: 16px;
      }

      .watermark-form-group label {
        display: block;
        margin-bottom: 8px;
        color: var(--text-secondary, #475569);
        font-size: 14px;
        font-weight: 500;
      }

      .watermark-custom-text {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--border-primary, #e2e8f0);
        border-radius: 8px;
        font-size: 14px;
        transition: all 0.2s ease;
        background: var(--bg-secondary, white);
        color: var(--text-primary, #1e293b);
        box-sizing: border-box;
      }

      .watermark-custom-text:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      .watermark-opacity,
      .watermark-font-size,
      .watermark-density {
        width: 100%;
        height: 6px;
        border-radius: 3px;
        background: var(--bg-tertiary, #e2e8f0);
        outline: none;
        -webkit-appearance: none;
      }

      .watermark-opacity::-webkit-slider-thumb,
      .watermark-font-size::-webkit-slider-thumb,
      .watermark-density::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      .watermark-density-hint {
        margin-top: 6px;
        font-size: 12px;
        color: var(--text-tertiary, #94a3b8);
        text-align: center;
      }

      .watermark-customize-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .watermark-cancel-btn,
      .watermark-save-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
      }

      .watermark-cancel-btn {
        background: var(--bg-tertiary, #f1f5f9);
        color: var(--text-secondary, #64748b);
      }

      .watermark-cancel-btn:hover {
        background: var(--bg-hover, #e2e8f0);
      }

      .watermark-save-btn {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
      }

      .watermark-save-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
    `;
    dialog.appendChild(style);

    // 实时更新标签
    const opacityInput = dialog.querySelector('.watermark-opacity') as HTMLInputElement;
    const fontSizeInput = dialog.querySelector('.watermark-font-size') as HTMLInputElement;
    const densityInput = dialog.querySelector('.watermark-density') as HTMLInputElement;
    const opacityLabel = dialog.querySelector('.opacity-label') as HTMLElement;
    const fontSizeLabel = dialog.querySelector('.font-size-label') as HTMLElement;
    const densityLabel = dialog.querySelector('.density-label') as HTMLElement;

    opacityInput?.addEventListener('input', () => {
      if (opacityLabel) opacityLabel.textContent = `透明度 (${opacityInput.value})`;
    });

    fontSizeInput?.addEventListener('input', () => {
      if (fontSizeLabel) fontSizeLabel.textContent = `字体大小 (${fontSizeInput.value}px)`;
    });

    densityInput?.addEventListener('input', () => {
      if (densityLabel) densityLabel.textContent = `密集程度 (${densityInput.value})`;
    });

    // 保存按钮
    const saveBtn = dialog.querySelector('.watermark-save-btn');
    saveBtn?.addEventListener('click', async () => {
      try {
        const customText = (dialog.querySelector('.watermark-custom-text') as HTMLInputElement).value;
        const opacity = parseFloat((dialog.querySelector('.watermark-opacity') as HTMLInputElement).value);
        const fontSize = parseInt((dialog.querySelector('.watermark-font-size') as HTMLInputElement).value);
        const density = parseFloat((dialog.querySelector('.watermark-density') as HTMLInputElement).value);

        const newConfig = {
          enabled: currentConfig.enabled,
          custom_text: customText,
          opacity: opacity,
          font_size: fontSize,
          density: density
        };

        const settings = await loadAppSettings();
        settings.watermark_config = newConfig;
        await invoke('save_settings_command', { settings });

        // 更新水印管理器配置
        watermarkManager.setConfig(newConfig);

        // 更新水印显示
        if (newConfig.enabled) {
          watermarkManager.removeWatermark();
          watermarkManager.addWatermark('Lovelymem V2');
        }

        this.updateStatus('水印配置已保存');
        dialog.remove();
        console.log('✅ 水印配置已保存:', newConfig);
      } catch (error) {
        console.error('❌ 保存水印配置失败:', error);
        this.updateStatus('保存水印配置失败');
      }
    });

    // 取消按钮
    const cancelBtn = dialog.querySelector('.watermark-cancel-btn');
    cancelBtn?.addEventListener('click', () => {
      dialog.remove();
    });

    // 点击遮罩关闭
    const overlay = dialog.querySelector('.watermark-customize-overlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        dialog.remove();
      }
    });

    document.body.appendChild(dialog);
  }
}


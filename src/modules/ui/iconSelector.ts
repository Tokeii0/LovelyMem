import { invoke } from '@tauri-apps/api/core';
import { MessageManager } from '../utils/message';
import { translate } from '../../i18n';

export interface IconCategory {
  name: string;
  icons: string[];
}

export class IconSelector {
  private overlay: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private currentAreaName: string = '';
  private onIconSelected: ((icon: string) => void) | null = null;

  // 预定义的图标分类
  private iconCategories: IconCategory[] = [
    {
      name: '系统工具',
      icons: ['🖥️', '⚙️', '🔧', '🛠️', '⚡', '🔌', '💻', '📱', '🖨️', '⌨️', '🖱️', '💾', '💿', '📀']
    },
    {
      name: '分析工具',
      icons: ['🔍', '📊', '📈', '📉', '🧠', '🔬', '🧪', '📋', '📄', '📝', '📑', '📊', '🗂️', '📁']
    },
    {
      name: '安全防护',
      icons: ['🛡️', '🔒', '🔐', '🔑', '🚨', '⚠️', '🚫', '🔴', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪']
    },
    {
      name: '网络通信',
      icons: ['🌐', '📡', '📶', '📞', '📧', '💬', '🔗', '🌍', '🌎', '🌏', '📮', '📬', '📭', '📫']
    },
    {
      name: '文件操作',
      icons: ['📂', '📁', '🗃️', '🗄️', '📋', '📄', '📃', '📑', '📜', '📰', '📓', '📔', '📕', '📗']
    },
    {
      name: '内存取证',
      icons: ['🧠', '💾', '🔍', '🕵️', '🔬', '📊', '⚡', '🎯', '🔧', '⚙️', '🛠️', '📋', '📈', '💻']
    },
    {
      name: '表情符号',
      icons: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌']
    },
    {
      name: '其他符号',
      icons: ['⭐', '✨', '💫', '🌟', '💥', '💢', '💯', '🔥', '❄️', '⚡', '🌈', '☀️', '🌙', '⭐']
    }
  ];

  /**
   * 显示图标选择器
   */
  public show(areaName: string, currentIcon: string, onSelected: (icon: string) => void): void {
    this.currentAreaName = areaName;
    this.onIconSelected = onSelected;
    this.createModal(currentIcon);
    this.showModal();
  }

  /**
   * 隐藏图标选择器
   */
  public hide(): void {
    this.hideModal();
  }

  /**
   * 创建模态框
   */
  private createModal(currentIcon: string): void {
    // 创建遮罩层
    this.overlay = document.createElement('div');
    this.overlay.className = 'icon-selector-overlay';

    // 创建模态框
    this.modal = document.createElement('div');
    this.modal.className = 'icon-selector-modal';

    this.modal.innerHTML = `
      <div class="icon-selector-header">
        <h3>选择图标 - ${this.currentAreaName}</h3>
        <button class="icon-selector-close" type="button">×</button>
      </div>
      <div class="icon-selector-tabs">
        <button type="button" class="tab-btn active" data-tab="emoji">Emoji 图标</button>
        <button type="button" class="tab-btn" data-tab="local">本地文件</button>
      </div>
      <div class="icon-selector-content">
        <div class="current-icon-preview">
          <span class="current-icon-label">当前图标:</span>
          <span class="current-icon-display">${this.renderCurrentIcon(currentIcon)}</span>
        </div>

        <!-- Emoji 标签页 -->
        <div class="tab-content active" data-tab="emoji">
          <div class="icon-categories">
            ${this.renderIconCategories()}
          </div>
          <div class="custom-icon-input">
            <label for="custom-icon">自定义图标:</label>
            <input type="text" id="custom-icon" placeholder="输入自定义图标或emoji" maxlength="4">
            <button type="button" class="use-custom-icon-btn">使用</button>
          </div>
        </div>

        <!-- 本地文件标签页 -->
        <div class="tab-content" data-tab="local">
          <div class="local-icon-section">
            <div class="local-icon-input-group">
              <label for="local-icon-path">选择本地图标文件:</label>
              <div class="local-icon-input-wrapper">
                <input type="text" id="local-icon-path" placeholder="选择图标文件 (PNG, JPG, SVG, ICO)" readonly>
                <button type="button" class="browse-local-icon-btn">浏览</button>
              </div>
            </div>
            <div class="local-icon-preview-section">
              <p class="local-icon-preview-label">预览:</p>
              <div class="local-icon-preview-container" id="local-icon-preview">
                <span style="color: var(--text-secondary);">未选择</span>
              </div>
            </div>
            <button type="button" class="use-local-icon-btn" disabled>使用本地图标</button>
          </div>
        </div>
      </div>
      <div class="icon-selector-footer">
        <button type="button" class="cancel-btn">取消</button>
        <button type="button" class="reset-btn">重置为默认</button>
      </div>
    `;

    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);

    this.bindEvents();
  }

  /**
   * 检查是否是文件路径
   */
  private isFilePath(str: string): boolean {
    if (!str) return false;
    // 检查是否是绝对路径（Windows 或 Unix）
    return str.startsWith('/') ||
           str.startsWith('\\') ||
           /^[a-zA-Z]:/.test(str) || // Windows 路径如 C:\...
           str.includes('\\') ||
           str.includes('/');
  }

  /**
   * 渲染当前图标
   */
  private renderCurrentIcon(currentIcon: string): string {
    if (!currentIcon || currentIcon.trim() === '') {
      return '默认';
    }

    // 如果是图片路径，显示图片
    if (this.isFilePath(currentIcon) || currentIcon.startsWith('http')) {
      return `<img src="${currentIcon}" alt="当前图标" style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">`;
    }

    // 如果是 emoji 或文字，直接显示
    return currentIcon;
  }

  /**
   * 渲染图标分类
   */
  private renderIconCategories(): string {
    return this.iconCategories.map(category => `
      <div class="icon-category">
        <h4 class="category-title">${category.name}</h4>
        <div class="icon-grid">
          ${category.icons.map(icon => `
            <button type="button" class="icon-option" data-icon="${icon}" title="${icon}">
              ${icon}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    if (!this.modal || !this.overlay) return;

    // 关闭按钮
    const closeBtn = this.modal.querySelector('.icon-selector-close');
    closeBtn?.addEventListener('click', () => this.hide());

    // 取消按钮
    const cancelBtn = this.modal.querySelector('.cancel-btn');
    cancelBtn?.addEventListener('click', () => this.hide());

    // 重置按钮
    const resetBtn = this.modal.querySelector('.reset-btn');
    resetBtn?.addEventListener('click', () => this.resetToDefault());

    // 标签页切换
    this.bindTabEvents();

    // 图标选择
    const iconOptions = this.modal.querySelectorAll('.icon-option');
    iconOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const icon = target.getAttribute('data-icon');
        if (icon) {
          this.selectIcon(icon);
        }
      });
    });

    // 自定义图标输入
    const customIconInput = this.modal.querySelector('#custom-icon') as HTMLInputElement;
    const useCustomBtn = this.modal.querySelector('.use-custom-icon-btn');

    useCustomBtn?.addEventListener('click', () => {
      const customIcon = customIconInput?.value.trim();
      if (customIcon) {
        this.selectIcon(customIcon);
      }
    });

    // 回车键使用自定义图标
    customIconInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const customIcon = customIconInput.value.trim();
        if (customIcon) {
          this.selectIcon(customIcon);
        }
      }
    });

    // 本地文件选择事件
    this.bindLocalIconEvents();

    // 点击遮罩层关闭
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    // ESC键关闭
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * 键盘事件处理
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.hide();
    }
  };

  /**
   * 绑定标签页切换事件
   */
  private bindTabEvents(): void {
    if (!this.modal) return;

    const tabBtns = this.modal.querySelectorAll('.tab-btn');
    const tabContents = this.modal.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabName = target.getAttribute('data-tab');
        if (!tabName) return;

        // 移除所有活跃状态
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // 添加活跃状态
        target.classList.add('active');
        const activeContent = this.modal?.querySelector(`.tab-content[data-tab="${tabName}"]`);
        activeContent?.classList.add('active');
      });
    });
  }

  /**
   * 绑定本地文件选择事件
   */
  private bindLocalIconEvents(): void {
    if (!this.modal) return;

    const browseBtn = this.modal.querySelector('.browse-local-icon-btn');
    const useLocalBtn = this.modal.querySelector('.use-local-icon-btn') as HTMLButtonElement;
    const localIconPath = this.modal.querySelector('#local-icon-path') as HTMLInputElement;

    browseBtn?.addEventListener('click', () => this.browseLocalIcon());

    useLocalBtn?.addEventListener('click', async () => {
      // 从 data 属性中获取完整路径
      const fullPath = localIconPath?.getAttribute('data-full-path');
      if (fullPath) {
        // 读取文件并转换为 base64
        try {
          const base64Data = await invoke('read_image_as_base64', {
            filePath: fullPath
          }) as string;

          // 保存 base64 数据而不是文件路径
          this.selectIcon(base64Data);
        } catch (error) {
          console.error('读取文件失败:', error);
          MessageManager.showError('读取文件失败，请重试');
        }
      }
    });
  }

  /**
   * 浏览本地图标文件
   */
  private async browseLocalIcon(): Promise<void> {
    try {
      const selectedPath = await invoke('select_file_path', {
        title: translate('选择图标文件'),
        filters: ['png', 'jpg', 'jpeg', 'svg', 'ico', 'gif', 'bmp']
      }) as string;

      if (selectedPath && this.modal) {
        const localIconPath = this.modal.querySelector('#local-icon-path') as HTMLInputElement;
        const localIconPreview = this.modal.querySelector('#local-icon-preview') as HTMLElement;
        const useLocalBtn = this.modal.querySelector('.use-local-icon-btn') as HTMLButtonElement;

        // 提取文件名（去掉路径）
        const fileName = selectedPath.split(/[\\\/]/).pop() || selectedPath;

        if (localIconPath) {
          // 显示文件名，但保存完整路径作为 data 属性
          localIconPath.value = fileName;
          localIconPath.setAttribute('data-full-path', selectedPath);
          localIconPath.title = selectedPath; // 鼠标悬停时显示完整路径
        }

        // 读取文件并转换为 base64 用于预览
        try {
          const base64Data = await invoke('read_image_as_base64', {
            filePath: selectedPath
          }) as string;

          // 显示预览
          if (localIconPreview) {
            // 清空容器
            localIconPreview.innerHTML = '';

            // 创建 img 元素
            const img = document.createElement('img');
            img.src = base64Data;
            img.alt = '本地图标预览';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.objectFit = 'contain';

            localIconPreview.appendChild(img);
          }
        } catch (previewError) {
          console.warn('预览图标失败:', previewError);
          // 即使预览失败，仍然允许使用该文件
          if (localIconPreview) {
            localIconPreview.innerHTML = '';
            const span = document.createElement('span');
            span.textContent = '预览加载失败，但可以继续使用';
            span.style.color = 'var(--text-secondary)';
            localIconPreview.appendChild(span);
          }
        }

        // 启用使用按钮
        if (useLocalBtn) {
          useLocalBtn.disabled = false;
        }
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      MessageManager.showError('选择文件失败，请重试');
    }
  }

  /**
   * 选择图标
   */
  private async selectIcon(icon: string): Promise<void> {
    try {
      // 保存到设置
      await invoke('set_area_icon_command', {
        areaName: this.currentAreaName,
        icon: icon
      });

      // 回调通知
      if (this.onIconSelected) {
        this.onIconSelected(icon);
      }

      this.hide();
    } catch (error) {
      console.error('保存图标失败:', error);
      MessageManager.showError('保存图标失败，请重试');
    }
  }

  /**
   * 重置为默认图标
   */
  private async resetToDefault(): Promise<void> {
    try {
      // 删除自定义图标设置
      await invoke('set_area_icon_command', {
        areaName: this.currentAreaName,
        icon: ''
      });

      // 回调通知重置
      if (this.onIconSelected) {
        this.onIconSelected('');
      }

      this.hide();
    } catch (error) {
      console.error('重置图标失败:', error);
      MessageManager.showError('重置图标失败，请重试');
    }
  }

  /**
   * 显示模态框
   */
  private showModal(): void {
    if (this.overlay) {
      this.overlay.style.display = 'flex';
      // 强制重绘后添加显示类，实现动画效果
      requestAnimationFrame(() => {
        this.overlay?.classList.add('show');
      });
    }
  }

  /**
   * 隐藏模态框
   */
  private hideModal(): void {
    if (this.overlay) {
      this.overlay.classList.remove('show');
      // 等待动画完成后移除元素
      setTimeout(() => {
        if (this.overlay) {
          document.body.removeChild(this.overlay);
          this.overlay = null;
          this.modal = null;
        }
        document.removeEventListener('keydown', this.handleKeyDown);
      }, 300);
    }
  }
}

// 导出单例实例
export const iconSelector = new IconSelector();

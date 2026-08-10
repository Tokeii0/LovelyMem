import { StateManager } from '../../core/stateManager';
import { ModernUIRenderer } from '../modernUIRenderer';

export class SidebarEvents {
  private stateManager: StateManager;
  private modernUIRenderer: ModernUIRenderer;
  private onUpdateWorkspace: () => Promise<void>;

  constructor(
    stateManager: StateManager, 
    modernUIRenderer: ModernUIRenderer,
    onUpdateWorkspace: () => Promise<void>
  ) {
    this.stateManager = stateManager;
    this.modernUIRenderer = modernUIRenderer;
    this.onUpdateWorkspace = onUpdateWorkspace;
  }

  /**
   * 恢复侧边栏状态
   */
  restoreSidebarState(): void {
    // 恢复之前保存的状态
    const savedState = localStorage.getItem('sidebar-mini');
    const sidebar = document.getElementById('modern-sidebar');

    if (savedState === 'true' && sidebar) {
      sidebar.classList.add('mini');
    }

    // 初始化选择指示器
    setTimeout(() => {
      this.initializeAreaSelectionIndicator();
    }, 100);
  }

  /**
   * 初始化区域选择指示器
   */
  initializeAreaSelectionIndicator(): void {
    const currentSelectedIndex = this.stateManager.getSelectedAvatar();
    this.updateSidebarActiveState(currentSelectedIndex);
  }

  /**
   * 更新侧边栏激活状态
   */
  updateSidebarActiveState(areaIndex: number): void {
    // 更新侧边栏中所有区域的激活状态
    const areaSections = document.querySelectorAll('.area-section');
    areaSections.forEach((section, index) => {
      if (index === areaIndex) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    // 更新选择指示器的位置
    this.updateAreaSelectionIndicator(areaIndex);
  }

  /**
   * 更新区域选择指示器的位置
   */
  private updateAreaSelectionIndicator(areaIndex: number): void {
    const areaSections = document.querySelectorAll('.area-section');
    const activeSection = areaSections[areaIndex];
    const areaSectionsContainer = document.querySelector('.area-sections') as HTMLElement;

    if (!activeSection || !areaSectionsContainer) return;

    // 计算选择指示器的位置，考虑滚动偏移
    const containerRect = areaSectionsContainer.getBoundingClientRect();
    const activeSectionRect = activeSection.getBoundingClientRect();
    const scrollTop = areaSectionsContainer.scrollTop;

    // 计算相对位置，加上滚动偏移量
    const relativeTop = activeSectionRect.top - containerRect.top + scrollTop;
    const sectionHeight = activeSectionRect.height;

    // 更新全局选择指示器
    const indicator = areaSectionsContainer;
    indicator.style.setProperty('--indicator-top', `${relativeTop}px`);
    indicator.style.setProperty('--indicator-height', `${sectionHeight}px`);

    // 更新背景色
    const areaColor = activeSection.getAttribute('data-area-color') || '#000000';
    indicator.style.setProperty('--indicator-color', areaColor);

    // 显示指示器
    this.showGlobalSelectionIndicator();
  }

  /**
   * 显示全局选择指示器
   */
  private showGlobalSelectionIndicator(): void {
    const areaSectionsContainer = document.querySelector('.area-sections') as HTMLElement;
    if (areaSectionsContainer) {
      areaSectionsContainer.classList.add('has-selection');
    }
  }

  /**
   * 处理侧边栏切换
   */
  handleSidebarToggle(): void {
    const sidebar = document.getElementById('modern-sidebar');

    if (sidebar) {
      sidebar.classList.toggle('mini');

      // 保存状态到localStorage
      const isMini = sidebar.classList.contains('mini');
      localStorage.setItem('sidebar-mini', isMini.toString());
    }
  }

  /**
   * 处理侧边栏切换并添加粒子效果
   */
  handleSidebarToggleWithEffect(button: HTMLElement): void {
    // 添加点击效果类
    button.classList.add('clicked');

    // 创建粒子效果
    this.createParticleEffect(button);

    // 执行原有的切换逻辑
    this.handleSidebarToggle();

    // 添加心跳效果
    button.classList.add('heartbeat');

    // 移除效果类
    setTimeout(() => {
      button.classList.remove('clicked');
      button.classList.remove('heartbeat');
    }, 800);
  }

  /**
   * 创建粒子效果
   */
  private createParticleEffect(button: HTMLElement): void {
    const rect = button.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // 创建多个粒子
    for (let i = 0; i < 12; i++) {
      const particle = document.createElement('div');
      particle.className = 'sidebar-particle';

      // 随机颜色
      const colors = ['#ff6b9d', '#c44569', '#f8b500', '#ffc107', '#ff8fab'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      // 随机方向和距离
      const angle = (i * 30) + Math.random() * 30; // 每个粒子间隔30度，加上随机偏移
      const distance = 50 + Math.random() * 30;
      const endX = centerX + Math.cos(angle * Math.PI / 180) * distance;
      const endY = centerY + Math.sin(angle * Math.PI / 180) * distance;

      // 设置粒子样式
      particle.style.cssText = `
        position: fixed;
        left: ${centerX}px;
        top: ${centerY}px;
        width: 6px;
        height: 6px;
        background: ${color};
        border-radius: 50%;
        pointer-events: none;
        z-index: 10000;
        box-shadow: 0 0 6px ${color};
        transition: all 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      `;

      document.body.appendChild(particle);

      // 动画粒子
      requestAnimationFrame(() => {
        particle.style.transform = `translate(-50%, -50%) translate(${endX - centerX}px, ${endY - centerY}px) scale(0)`;
        particle.style.opacity = '0';
      });

      // 清理粒子
      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
      }, 800);
    }

    // 添加额外的光环效果
    this.createRippleEffect(centerX, centerY);
  }

  /**
   * 创建涟漪效果
   */
  private createRippleEffect(x: number, y: number): void {
    const ripple = document.createElement('div');
    ripple.className = 'sidebar-ripple';

    ripple.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 107, 157, 0.6);
      border-radius: 50%;
      pointer-events: none;
      z-index: 9998;
      transform: translate(-50%, -50%) scale(0);
      opacity: 1;
      transition: all 0.6s ease-out;
    `;

    document.body.appendChild(ripple);

    // 动画涟漪
    requestAnimationFrame(() => {
      ripple.style.transform = 'translate(-50%, -50%) scale(3)';
      ripple.style.opacity = '0';
    });

    // 清理涟漪
    setTimeout(() => {
      if (ripple.parentNode) {
        ripple.parentNode.removeChild(ripple);
      }
    }, 600);
  }

  /**
   * 初始化侧边栏按钮的生动效果
   */
  initializeSidebarButtonEffects(): void {
    const button = document.querySelector('.sidebar-toggle') as HTMLElement;
    if (!button) return;

    // 随机心跳效果
    const addRandomHeartbeat = () => {
      if (Math.random() < 0.3) { // 30% 概率
        button.classList.add('heartbeat');
        setTimeout(() => {
          button.classList.remove('heartbeat');
        }, 800);
      }
    };

    // 每5-15秒随机触发一次心跳
    const scheduleNextHeartbeat = () => {
      const delay = 5000 + Math.random() * 10000; // 5-15秒
      setTimeout(() => {
        addRandomHeartbeat();
        scheduleNextHeartbeat();
      }, delay);
    };

    // 开始调度
    scheduleNextHeartbeat();
  }

  /**
   * 更新主工作区显示
   */
  async updateMainWorkspace(): Promise<void> {
    const state = this.stateManager.getState();
    
    // 确保渲染器状态是最新的
    this.modernUIRenderer.updateState(state);

    // 调用渲染器更新主工作区内容
    await this.modernUIRenderer.updateMainWorkspace();
    
    // 更新侧边栏激活状态
    this.updateSidebarActiveState(state.selectedAvatar);
  }
}

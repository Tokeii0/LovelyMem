/**
 * 主题管理器
 * 处理主题切换和用户自定义主题
 */


export class ThemeManager {

  /**
   * 切换主题
   */
  toggleTheme(): string {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme') || 'light';

    let newTheme: string;
    switch (currentTheme) {
      case 'light':
        newTheme = 'dark';
        break;
      case 'dark':
        newTheme = 'sakura';
        break;
      case 'sakura':
        newTheme = 'light';
        break;
      default:
        newTheme = 'light';
    }

    this.setTheme(newTheme);
    return newTheme;
  }

  /**
   * 设置主题
   */
  setTheme(theme: string): void {
    const body = document.body;
    body.setAttribute('data-theme', theme);
    
    // 保存到localStorage
    localStorage.setItem('theme', theme);
    
    //console.log('主题已设置为:', theme);
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): string {
    return document.body.getAttribute('data-theme') || 'light';
  }

  /**
   * 初始化主题（已弃用，由 StateManager 处理）
   */
  initializeTheme(): void {
    //console.log('⚠️ ThemeManager.initializeTheme() 已弃用，主题初始化由 StateManager 处理');
  }

} 
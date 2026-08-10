import { AppState, FileItem, ImageInfo } from './types';
import { themeLoader, ThemeName } from '../ui/themeLoader';

export class StateManager {
  private state: AppState;
  settings: any;

  constructor() {
    this.state = this.initializeState();
  }

  private initializeState(): AppState {
    return {
      currentTab: 'function',
      selectedAvatar: 0,
      files: this.generateSampleFiles(),
      commandOutput: ['[系统] Lovelymem V2 已启动'],
      currentImage: undefined,
      warnings: [],
      theme: 'light' // 默认主题，将在 initializeTheme 中从后端加载正确的主题
    };
  }

  private generateSampleFiles(): FileItem[] {
    return [
      { name: 'memory.dmp', size: '2.1 GB', modified: '2024-01-15 14:30', type: 'file' },
      { name: 'analysis.txt', size: '45 KB', modified: '2024-01-15 15:22', type: 'file' },
      { name: 'reports', size: '-', modified: '2024-01-15 16:10', type: 'folder' },
      { name: 'volatility.log', size: '128 KB', modified: '2024-01-15 16:45', type: 'file' },
      { name: 'extracted', size: '-', modified: '2024-01-15 17:00', type: 'folder' }
    ];
  }

  getState(): AppState {
    return this.state;
  }

  updateCurrentTab(tab: string): void {
    this.state.currentTab = tab;
  }

  updateSelectedModule(moduleIndex: number): void {
    this.state.selectedAvatar = moduleIndex;
  }

  setWarnings(warnings: any[]): void {
    this.state.warnings = Array.isArray(warnings) ? warnings : [];
  }

  addWarning(warning: any): void {
    if (!this.state.warnings) {
      this.state.warnings = [];
    }
    this.state.warnings.unshift(warning);
  }

  getSelectedAvatar(): number {
    return this.state.selectedAvatar;
  }

  setSelectedAvatar(avatarIndex: number): void {
    this.state.selectedAvatar = avatarIndex;
  }

  setVolatility2Disabled(disabled: boolean, message?: string): void {
    this.state.volatility2Disabled = disabled;
    this.state.volatility2DisabledMessage = message;
  }

  isVolatility2Disabled(): boolean {
    return this.state.volatility2Disabled || false;
  }

  getVolatility2DisabledMessage(): string {
    return this.state.volatility2DisabledMessage || '';
  }

  addFile(file: FileItem): void {
    this.state.files.push(file);
  }

  removeFile(fileName: string): void {
    this.state.files = this.state.files.filter(file => file.name !== fileName);
  }

  removeFileByIndex(index: number): void {
    if (index >= 0 && index < this.state.files.length) {
      this.state.files.splice(index, 1);
    }
  }

  clearFiles(): void {
    this.state.files = [];
  }

  addCommandOutput(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.state.commandOutput.push(`[${timestamp}] ${message}`);
  }

  clearCommandOutput(): void {
    this.state.commandOutput = [];
  }

  getFiles(): FileItem[] {
    return this.state.files;
  }

  getCommandOutput(): string[] {
    return this.state.commandOutput;
  }

  getCurrentTab(): string {
    return this.state.currentTab;
  }

  getSelectedModule(): number {
    return this.state.selectedAvatar;
  }

  // 导出状态用于调试
  exportState(): string {
    return JSON.stringify(this.state, null, 2);
  }

  // 从JSON恢复状态
  importState(stateJson: string): boolean {
    try {
      const newState = JSON.parse(stateJson);
      if (this.validateState(newState)) {
        this.state = newState;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to import state:', error);
      return false;
    }
  }

  private validateState(state: any): boolean {
    return (
      typeof state === 'object' &&
      typeof state.currentTab === 'string' &&
      typeof state.selectedAvatar === 'number' &&
      Array.isArray(state.files) &&
      Array.isArray(state.commandOutput)
    );
  }

  setCurrentImage(imageInfo: ImageInfo): void {
    this.state.currentImage = imageInfo;
  }

  getCurrentImage(): ImageInfo | undefined {
    return this.state.currentImage;
  }

  clearCurrentImage(): void {
    this.state.currentImage = undefined;
    this.clearMemProcFSProcessId(); // 清除镜像时也清除进程ID
  }

  setMemProcFSProcessId(processId: number): void {
    this.state.memProcFSProcessId = processId;
  }

  getMemProcFSProcessId(): number | undefined {
    return this.state.memProcFSProcessId;
  }

  clearMemProcFSProcessId(): void {
    this.state.memProcFSProcessId = undefined;
  }

  addCommandHistory(command: { id?: number; name: string; command: string; status: 'pending' | 'running' | 'completed' | 'error'; time?: string; processId?: number; output?: string; error?: string }): void {
    if (!this.state.commandHistory) {
      this.state.commandHistory = [];
    }
    
    const commandEntry = {
      ...command,
      time: command.time || new Date().toLocaleString(),
      id: command.id || Date.now() + Math.random() // 简单的唯一ID
    };
    
    this.state.commandHistory.unshift(commandEntry); // 添加到开头
    
    // 保持最多20条记录
    if (this.state.commandHistory.length > 20) {
      this.state.commandHistory = this.state.commandHistory.slice(0, 20);
    }
  }

  updateCommandStatus(commandId: number, status: 'pending' | 'running' | 'completed' | 'error'): void {
    if (this.state.commandHistory) {
      const command = this.state.commandHistory.find(cmd => cmd.id === commandId);
      if (command) {
        command.status = status;
      }
    }
  }

  getCommandHistory(): any[] {
    return this.state.commandHistory || [];
  }

  clearCommandHistory(): void {
    this.state.commandHistory = [];
  }

  setCommandHistory(history: any[]): void {
    this.state.commandHistory = history;
  }

  // 主题管理方法
  getTheme(): 'light' | 'dark' | 'sakura' {
    return this.state.theme || 'light';
  }

  setTheme(theme: 'light' | 'dark' | 'sakura'): void {
    this.state.theme = theme;
    // 同步到 localStorage 作为备用
    localStorage.setItem('theme', theme);
    this.applyTheme(theme);
  }

  toggleTheme(): 'light' | 'dark' | 'sakura' {
    const themes: ('light' | 'dark' | 'sakura')[] = ['light', 'dark', 'sakura'];
    const currentIndex = themes.indexOf(this.state.theme || 'light');
    const nextIndex = (currentIndex + 1) % themes.length;
    const newTheme = themes[nextIndex];
    this.setTheme(newTheme);
    return newTheme;
  }

  private async applyTheme(theme: 'light' | 'dark' | 'sakura'): Promise<void> {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      document.body.classList.remove('light-theme', 'dark-theme', 'sakura-theme');
      document.body.classList.add(`${theme}-theme`);
    }
  }

  // 在应用启动时应用主题
  async initializeTheme(): Promise<void> {
    try {
      // 先尝试从后端加载保存的主题设置
      await this.loadThemeFromBackend();

      // 使用新的主题加载器初始化主题系统
      const currentTheme = this.getTheme() as ThemeName;
      await themeLoader.initialize(currentTheme);

      console.log(`✅ 主题系统初始化完成: ${currentTheme}`);
    } catch (error) {
      console.error('❌ 主题系统初始化失败:', error);
      // 降级到默认主题
      await themeLoader.initialize('light');
    }
  }

  // 从后端加载主题设置
  private async loadThemeFromBackend(): Promise<void> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const themeSettings = await invoke('get_theme_settings') as any;

      if (themeSettings && themeSettings.current_theme) {
        //console.log('✅ 从后端加载的主题设置:', themeSettings.current_theme);
        this.state.theme = themeSettings.current_theme;
      } else {
        console.log('⚠️ 后端没有保存的主题设置，使用默认主题');
      }
    } catch (error) {
      console.error('❌ 从后端加载主题设置失败:', error);
      // 如果后端加载失败，尝试从 localStorage 加载
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme && ['light', 'dark', 'sakura'].includes(savedTheme)) {
        this.state.theme = savedTheme as 'light' | 'dark' | 'sakura';
        console.log('✅ 从 localStorage 加载主题:', savedTheme);
      }
    }
  }

  // 通用的状态更新方法
  updateState(partialState: Partial<AppState>): void {
    this.state = { ...this.state, ...partialState };
  }
}

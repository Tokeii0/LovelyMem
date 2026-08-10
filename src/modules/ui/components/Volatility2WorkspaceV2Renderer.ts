/**
 * Volatility2 V2 工作区渲染器
 * 顶部Tab标签页切换 + 下方CSV数据表格
 * 与 Volatility3 V2 类似，但调用 Vol2 后端命令，需要 Profile 选择
 */

import { invoke } from '@tauri-apps/api/core';
import { AppState } from '../../core/types';
import { EmbeddedCSVViewer } from './EmbeddedCSVViewer';
import { VOL2_FEATURE_MAP } from '../../areas/volatility2AreaV2';
import IconParkHelper from '../../utils/iconparkHelper';
import { loadAppSettings } from '../../core/settingsHelper';

// IconPark 风格的 SVG 图标定义
const SVG_ICONS: Record<string, string> = {
  'system': '<svg viewBox="0 0 48 48"><path d="M42 6H6a2 2 0 0 0-2 2v32a2 2 0 0 0 2 2h36a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 24h20M14 32h20M14 16h20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'process': '<svg viewBox="0 0 48 48"><path d="M4 12h40v24H4z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M12 20h24M12 28h24" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'memory': '<svg viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><path d="M6 18h36M6 30h36M18 6v36M30 6v36" stroke="currentColor" stroke-width="4"/></svg>',
  'network': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="4"/><path d="M4 24h40M24 4v40" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
  'filesystem': '<svg viewBox="0 0 48 48"><path d="M8 42h32a2 2 0 0 0 2-2V14L30 4H10a2 2 0 0 0-2 2v34a2 2 0 0 0 2 2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M30 4v10h12" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
  'registry': '<svg viewBox="0 0 48 48"><path d="M40 12H8a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h32a2 2 0 0 0 2-2V14a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M16 4v8M32 4v8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'security': '<svg viewBox="0 0 48 48"><path d="M24 4l16 6v14c0 12-10 20-16 20S8 36 8 24V10l16-6z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M17 23l5 5 10-10" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'kernel': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'gui': '<svg viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><path d="M6 14h36" stroke="currentColor" stroke-width="4"/><circle cx="12" cy="10" r="2" fill="currentColor"/><circle cx="18" cy="10" r="2" fill="currentColor"/></svg>',
  'services': '<svg viewBox="0 0 48 48"><path d="M24 4v4M24 40v4M4 24h4M40 24h4" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 18v6h6" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'browser': '<svg viewBox="0 0 48 48"><path d="M24 44c11.046 0 20-8.954 20-20S35.046 4 24 4 4 12.954 4 24s8.954 20 20 20z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M4 24h40M24 4v40M10 10l28 28M38 10L10 38" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/></svg>',
  'timeline': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 14v10l7 7" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'info': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 22v12M24 14v2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'scan': '<svg viewBox="0 0 48 48"><path d="M4 12V8a4 4 0 0 1 4-4h8M36 4h4a4 4 0 0 1 4 4v8M44 36v4a4 4 0 0 1-4 4h-8M12 44H8a4 4 0 0 1-4-4v-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M4 24h40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'key': '<svg viewBox="0 0 48 48"><circle cx="15" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 24h18v6h-4v-6h-4v6h-4v-6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'user': '<svg viewBox="0 0 48 48"><circle cx="24" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M42 44c0-9.941-8.059-18-18-18S6 34.059 6 44" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'text': '<svg viewBox="0 0 48 48"><path d="M8 42h32a2 2 0 0 0 2-2V14L30 4H10a2 2 0 0 0-2 2v34a2 2 0 0 0 2 2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M30 4v10h12" stroke="currentColor" stroke-width="4"/><path d="M16 22h16M16 30h16M16 38h10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'module': '<svg viewBox="0 0 48 48"><path d="M6 12h16v12H6zM26 12h16v12H26zM6 28h16v12H6zM26 28h16v12H26z" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
  'driver': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'default': '<svg viewBox="0 0 48 48"><path d="M24 4L6 44h36L24 4z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 34v2M24 18v8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>'
};

// Tab分组定义
interface TabGroup {
  id: string;
  name: string;
  icon: string;
  tabs: TabItem[];
}

interface TabItem {
  id: string;
  name: string;
  icon: string;
  plugin: string;
  type: 'csv' | 'text';
}

// 执行状态
type ExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'completed';

interface TabExecutionState {
  status: ExecutionStatus;
  error?: string;
  outputFile?: string;
}

export class Volatility2WorkspaceV2Renderer {
  private state: AppState;
  private getAreaIcon: (config: any) => string;
  private isFilePath: (str: string) => boolean;
  private embeddedViewer: EmbeddedCSVViewer;
  private activeTab: string = 'imageinfo';
  private activeGroup: string = 'system';

  // 每个Tab的执行状态
  private tabExecutionStates: Map<string, TabExecutionState> = new Map();

  // 防止事件重复绑定
  private eventsInitialized: boolean = false;

  // TXT 格式插件列表
  private readonly txtPlugins = [
    'imageinfo', 'vboxinfo', 'shutdowntime', 'cmdscan', 'consoles', 'vadinfo',
    'printkey', 'dumpregistry', 'auditpol',
    'hashdump', 'malfind', 'apihooks', 'eventhooks', 'messagehooks',
    'truecryptsummary', 'truecryptmaster', 'truecryptpassphrase', 'mimikatz',
    'ssdt', 'driverirp', 'callbacks',
    'windows', 'wintree', 'deskscan', 'sessions', 'clipboard', 'editbox',
    'iehistory', 'chromehistory', 'firefoxhistory'
  ];

  // Tab分组配置
  private tabGroups: TabGroup[] = [
    {
      id: 'system',
      name: '系统信息',
      icon: 'system',
      tabs: [
        { id: 'imageinfo', name: '镜像信息', icon: 'info', plugin: 'imageinfo', type: 'text' },
        { id: 'verinfo', name: '版本信息', icon: 'info', plugin: 'verinfo', type: 'csv' },
        { id: 'shutdowntime', name: '关机时间', icon: 'info', plugin: 'shutdowntime', type: 'text' },
        { id: 'atoms', name: '原子表', icon: 'info', plugin: 'atoms', type: 'csv' },
        { id: 'atomscan', name: '原子扫描', icon: 'scan', plugin: 'atomscan', type: 'csv' },
        { id: 'vboxinfo', name: 'VirtualBox信息', icon: 'info', plugin: 'vboxinfo', type: 'text' },
      ]
    },
    {
      id: 'process',
      name: '进程分析',
      icon: 'process',
      tabs: [
        { id: 'pslist', name: '进程列表', icon: 'process', plugin: 'pslist', type: 'csv' },
        { id: 'psscan', name: '进程扫描', icon: 'scan', plugin: 'psscan', type: 'csv' },
        { id: 'psxview', name: '交叉视图', icon: 'process', plugin: 'psxview', type: 'csv' },
        { id: 'handles', name: '句柄', icon: 'key', plugin: 'handles', type: 'csv' },
        { id: 'privs', name: '权限', icon: 'security', plugin: 'privs', type: 'csv' },
        { id: 'cmdline', name: '命令行', icon: 'text', plugin: 'cmdline', type: 'csv' },
        { id: 'cmdscan', name: '命令扫描', icon: 'scan', plugin: 'cmdscan', type: 'text' },
        { id: 'consoles', name: '控制台', icon: 'text', plugin: 'consoles', type: 'text' },
        { id: 'envars', name: '环境变量', icon: 'text', plugin: 'envars', type: 'csv' },
        { id: 'dlllist', name: 'DLL列表', icon: 'module', plugin: 'dlllist', type: 'csv' },
      ]
    },
    {
      id: 'memory',
      name: '内存分析',
      icon: 'memory',
      tabs: [
        { id: 'vadinfo', name: 'VAD信息', icon: 'memory', plugin: 'vadinfo', type: 'text' },
        { id: 'modules', name: '内核模块', icon: 'module', plugin: 'modules', type: 'csv' },
        { id: 'unloadedmodules', name: '已卸载模块', icon: 'module', plugin: 'unloadedmodules', type: 'csv' },
        { id: 'bigpools', name: '大内存池', icon: 'memory', plugin: 'bigpools', type: 'csv' },
      ]
    },
    {
      id: 'network',
      name: '网络分析',
      icon: 'network',
      tabs: [
        { id: 'netscan', name: '网络扫描', icon: 'scan', plugin: 'netscan', type: 'csv' },
      ]
    },
    {
      id: 'filesystem',
      name: '文件系统',
      icon: 'filesystem',
      tabs: [
        { id: 'filescan', name: '文件扫描', icon: 'scan', plugin: 'filescan', type: 'csv' },
        { id: 'mftparser', name: 'MFT解析', icon: 'filesystem', plugin: 'mftparser', type: 'csv' },
        { id: 'shellbags', name: 'ShellBags', icon: 'filesystem', plugin: 'shellbags', type: 'csv' },
      ]
    },
    {
      id: 'registry',
      name: '注册表',
      icon: 'registry',
      tabs: [
        { id: 'printkey', name: '键值', icon: 'key', plugin: 'printkey', type: 'text' },
        { id: 'dumpregistry', name: '转储', icon: 'registry', plugin: 'dumpregistry', type: 'text' },
        { id: 'shimcache', name: '兼容缓存', icon: 'registry', plugin: 'shimcache', type: 'csv' },
        { id: 'auditpol', name: '审计策略', icon: 'security', plugin: 'auditpol', type: 'text' },
        { id: 'userassist', name: '用户活动', icon: 'user', plugin: 'userassist', type: 'csv' },
      ]
    },
    {
      id: 'security',
      name: '安全分析',
      icon: 'security',
      tabs: [
        { id: 'hashdump', name: '密码哈希', icon: 'key', plugin: 'hashdump', type: 'text' },
        { id: 'malfind', name: '恶意代码', icon: 'security', plugin: 'malfind', type: 'text' },
        { id: 'apihooks', name: 'API钩子', icon: 'security', plugin: 'apihooks', type: 'text' },
        { id: 'mutantscan', name: '互斥体', icon: 'scan', plugin: 'mutantscan', type: 'csv' },
        { id: 'symlinkscan', name: '符号链接', icon: 'scan', plugin: 'symlinkscan', type: 'csv' },
        { id: 'mimikatz', name: 'Mimikatz', icon: 'key', plugin: 'mimikatz', type: 'text' },
      ]
    },
    {
      id: 'kernel',
      name: '内核分析',
      icon: 'kernel',
      tabs: [
        { id: 'ssdt', name: 'SSDT', icon: 'kernel', plugin: 'ssdt', type: 'text' },
        { id: 'timers', name: '定时器', icon: 'services', plugin: 'timers', type: 'csv' },
        { id: 'gditimers', name: 'GDI定时器', icon: 'services', plugin: 'gditimers', type: 'csv' },
        { id: 'driverscan', name: '驱动扫描', icon: 'scan', plugin: 'driverscan', type: 'csv' },
        { id: 'driverirp', name: '驱动IRP', icon: 'driver', plugin: 'driverirp', type: 'text' },
        { id: 'callbacks', name: '回调函数', icon: 'kernel', plugin: 'callbacks', type: 'text' },
      ]
    },
    {
      id: 'gui',
      name: 'GUI分析',
      icon: 'gui',
      tabs: [
        { id: 'windows', name: '窗口信息', icon: 'gui', plugin: 'windows', type: 'text' },
        { id: 'wintree', name: '窗口层次', icon: 'gui', plugin: 'wintree', type: 'text' },
        { id: 'deskscan', name: '桌面扫描', icon: 'scan', plugin: 'deskscan', type: 'text' },
        { id: 'session', name: '会话', icon: 'user', plugin: 'sessions', type: 'text' },
        { id: 'clipboard', name: '剪贴板', icon: 'text', plugin: 'clipboard', type: 'text' },
        { id: 'editbox', name: '编辑框', icon: 'text', plugin: 'editbox', type: 'text' },
      ]
    },
    {
      id: 'services',
      name: '服务分析',
      icon: 'services',
      tabs: [
        { id: 'svcscan', name: '服务扫描', icon: 'services', plugin: 'svcscan', type: 'csv' },
      ]
    },
    {
      id: 'browser',
      name: '浏览器取证',
      icon: 'browser',
      tabs: [
        { id: 'iehistory', name: 'IE历史', icon: 'browser', plugin: 'iehistory', type: 'text' },
        { id: 'chromehistory', name: 'Chrome', icon: 'browser', plugin: 'chromehistory', type: 'text' },
        { id: 'firefoxhistory', name: 'Firefox', icon: 'browser', plugin: 'firefoxhistory', type: 'text' },
      ]
    },
    {
      id: 'timeline',
      name: '时间线',
      icon: 'timeline',
      tabs: [
        { id: 'timeliner', name: '时间线', icon: 'timeline', plugin: 'timeliner', type: 'csv' },
      ]
    },
  ];

  constructor(
    state: AppState,
    getAreaIcon: (config: any) => string,
    isFilePath: (str: string) => boolean
  ) {
    this.state = state;
    this.getAreaIcon = getAreaIcon;
    this.isFilePath = isFilePath;
    this.embeddedViewer = new EmbeddedCSVViewer();
  }

  public updateState(state: AppState): void {
    this.state = state;
  }

  /**
   * 获取SVG图标
   */
  private getIcon(key: string): string {
    return SVG_ICONS[key] || SVG_ICONS['default'];
  }

  /**
   * 判断是否为 TXT 格式的插件
   */
  private isTxtPlugin(plugin: string): boolean {
    return this.txtPlugins.includes(plugin);
  }

  /**
   * 获取最终输出文件名（与 V1 executor 一致）
   * text 插件：vol2_xxx.txt
   * json 插件：先输出 vol2_xxx.json，后端自动转为 vol2_xxx.csv
   */
  private getOutputFileName(plugin: string): string {
    const ext = this.isTxtPlugin(plugin) ? 'txt' : 'csv';
    return `vol2_${plugin}.${ext}`;
  }

  /**
   * 获取执行时传给后端的输出文件名
   * json 类型用 .json 后缀（后端会自动转 CSV）
   */
  private getExecuteOutputFileName(plugin: string): string {
    const ext = this.isTxtPlugin(plugin) ? 'txt' : 'json';
    return `vol2_${plugin}.${ext}`;
  }

  /**
   * 检查文件是否存在
   */
  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await invoke('read_file', { path: filePath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 渲染V2工作区 - Tab标签页布局
   */
  public render(): string {
    // render() 会生成全新 DOM，必须重新绑定事件
    this.eventsInitialized = false;

    const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup) || this.tabGroups[0];

    return `
      <div class="vol2-v2-workspace">
        <!-- 顶部分组选择器 + Profile 选择 -->
        <div class="vol2-v2-group-bar">
          ${this.tabGroups.map(group => `
            <button class="vol2-v2-group-btn ${group.id === this.activeGroup ? 'active' : ''}"
                    data-group="${group.id}">
              <span class="group-icon">${this.getIcon(group.icon)}</span>
              <span class="group-name">${group.name}</span>
            </button>
          `).join('')}
        </div>

        <!-- Tab标签页 + Profile 选择 -->
        <div class="vol2-v2-tabs-bar">
          <div class="vol2-v2-tabs" id="vol2-v2-tabs">
            ${currentGroup.tabs.map(tab => {
              const execState = this.tabExecutionStates.get(tab.id);
              const statusClass = execState?.status || 'idle';
              return `
              <button class="vol2-v2-tab ${tab.id === this.activeTab ? 'active' : ''} ${statusClass}"
                      data-tab="${tab.id}"
                      data-plugin="${tab.plugin}"
                      data-type="${tab.type}">
                <span class="tab-icon">${this.getIcon(tab.icon)}</span>
                <span class="tab-name">${tab.name}</span>
                <span class="tab-count" id="vol2-tab-count-${tab.id}"></span>
                <span class="tab-status" id="vol2-tab-status-${tab.id}">
                  ${this.renderTabStatus(execState)}
                </span>
              </button>
            `}).join('')}
          </div>
          <div class="vol2-v2-profile-wrapper">
            <span class="vol2-v2-profile-label">Profile:</span>
            <select class="vol2-v2-profile-select" id="vol2-profile">
              <option value="" disabled selected>请先加载镜像以检测Profile</option>
            </select>
          </div>
        </div>

        <!-- CSV数据表格区域 -->
        <div class="vol2-v2-content">
          <div class="vol2-v2-csv-viewer animate-enter" id="vol2-v2-csv-viewer">
            <div class="embedded-csv-empty">
              <div class="embedded-csv-empty-icon">${this.getIcon('process')}</div>
              <div class="embedded-csv-empty-title">点击Tab标签执行分析</div>
              <div class="embedded-csv-empty-message">选择上方的功能标签，系统将自动执行Volatility2命令并显示结果</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染Tab状态图标
   */
  private renderTabStatus(state?: TabExecutionState): string {
    if (!state) return '';

    switch (state.status) {
      case 'running':
        return '<span class="status-spinner"></span>';
      case 'success':
      case 'completed':
        return '<span class="status-check">✓</span>';
      case 'error':
        return '<span class="status-error">✗</span>';
      default:
        return '';
    }
  }

  /**
   * 初始化事件绑定
   */
  public initEvents(): void {
    if (this.eventsInitialized) {
      this.checkExistingFiles();
      this.loadFirstTab();
      return;
    }
    this.eventsInitialized = true;

    // 初始化内嵌CSV查看器
    this.embeddedViewer.init('vol2-v2-csv-viewer', (rowCount) => {
      this.updateTabCount(this.activeTab, rowCount);
    });

    // 分组按钮点击事件
    const groupBtns = document.querySelectorAll('.vol2-v2-group-btn');
    groupBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = btn.getAttribute('data-group');
        if (groupId && groupId !== this.activeGroup) {
          this.switchGroup(groupId);
        }
      });
    });

    // Tab标签点击事件（使用事件委托，只绑定一次）
    this.bindTabEvents();

    // 加载 Profile 选择器
    this.loadProfileSelector();

    // 检查已完成的文件并更新状态
    this.checkExistingFiles();

    // 自动执行第一个Tab
    this.loadFirstTab();
  }

  /**
   * 加载 Profile 选择器
   * 使用与 V1 面板一致的方式：ID 为 vol2-profile，由 profileCoordinator 统一填充
   * 这里只做初始化和绑定变更事件，profile 列表由 profileCoordinator.applyProfileToSelect 填充
   */
  private async loadProfileSelector(): Promise<void> {
    const selectEl = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (!selectEl) return;

    try {
      // 从 localStorage 读取已检测的 Profile 列表（与 profileCoordinator 一致）
      const stored = localStorage.getItem('detected_profile_info');
      if (stored) {
        const profileData = JSON.parse(stored);
        const profileList: string[] = profileData.profile_list || [];
        const suggestedProfile: string = profileData.suggested_profile || '';

        if (profileList.length > 0) {
          // 清空默认占位选项，填充检测到的 profile 列表
          selectEl.innerHTML = '';
          profileList.forEach((profile: string, index: number) => {
            const option = document.createElement('option');
            option.value = profile;
            option.textContent = profile;
            if (suggestedProfile && profile === suggestedProfile) {
              option.selected = true;
            } else if (!suggestedProfile && index === 0) {
              option.selected = true;
            }
            selectEl.appendChild(option);
          });
        }
      }

      // 从后端加载用户手动保存的 profile，优先级更高
      const settings = await loadAppSettings();
      if (settings.volatility2_profile) {
        let found = false;
        for (let i = 0; i < selectEl.options.length; i++) {
          if (selectEl.options[i].value === settings.volatility2_profile) {
            selectEl.selectedIndex = i;
            found = true;
            break;
          }
        }
        // 模糊匹配
        if (!found) {
          for (let i = 0; i < selectEl.options.length; i++) {
            if (selectEl.options[i].value.includes(settings.volatility2_profile) ||
                settings.volatility2_profile.includes(selectEl.options[i].value)) {
              selectEl.selectedIndex = i;
              break;
            }
          }
        }
      }

      // 绑定变更事件（与 vol2event.ts 中 handleVol2ProfileChange 保持一致）
      selectEl.addEventListener('change', async (e: Event) => {
        if (!(e as any).isTrusted) return;
        const selectedProfile = selectEl.value;
        try {
          await invoke('save_volatility2_profile', { profile: selectedProfile });
          // 同步更新 localStorage，防止 MutationObserver 覆盖
          try {
            const storedInfo = localStorage.getItem('detected_profile_info');
            if (storedInfo) {
              const pd = JSON.parse(storedInfo);
              pd.suggested_profile = selectedProfile;
              localStorage.setItem('detected_profile_info', JSON.stringify(pd));
            }
          } catch (_) { /* ignore */ }
        } catch (e) {
          console.error('保存 Volatility2 Profile 失败:', e);
        }
      });
    } catch (e) {
      console.error('加载 Profile 选择器失败:', e);
    }
  }

  /**
   * 绑定Tab事件
   */
  private bindTabEvents(): void {
    const tabsContainer = document.getElementById('vol2-v2-tabs');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', async (e) => {
        const tab = (e.target as HTMLElement).closest('.vol2-v2-tab');
        if (tab) {
          const tabId = tab.getAttribute('data-tab');
          const plugin = tab.getAttribute('data-plugin');
          const type = tab.getAttribute('data-type') as 'csv' | 'text';
          if (tabId && plugin) {
            await this.switchTab(tabId, plugin, type);
          }
        }
      });

      // 右键菜单：重新执行
      tabsContainer.addEventListener('contextmenu', (e) => {
        const tab = (e.target as HTMLElement).closest('.vol2-v2-tab');
        if (!tab) return;
        e.preventDefault();
        const tabId = tab.getAttribute('data-tab');
        const plugin = tab.getAttribute('data-plugin');
        const type = tab.getAttribute('data-type') as 'csv' | 'text';
        if (tabId && plugin) {
          this.showTabContextMenu(e as MouseEvent, tabId, plugin, type);
        }
      });
    }
  }

  /**
   * 显示Tab右键菜单
   */
  private showTabContextMenu(e: MouseEvent, tabId: string, plugin: string, type: 'csv' | 'text'): void {
    document.querySelectorAll('.vol-tab-context-menu').forEach(m => m.remove());

    const state = this.tabExecutionStates.get(tabId);
    const isRunning = state?.status === 'running';

    const menu = document.createElement('div');
    menu.className = 'vol-tab-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    const refreshIcon = IconParkHelper.getSvgString('refresh', { size: 14 });
    const trashIcon = IconParkHelper.getSvgString('delete', { size: 14 });
    menu.innerHTML = `
      <div class="vol-ctx-item ${isRunning ? 'disabled' : ''}" data-action="rerun">
        <span class="vol-ctx-icon">${refreshIcon}</span>
        <span>重新执行</span>
      </div>
      ${state?.status === 'completed' || state?.status === 'success' ? `
      <div class="vol-ctx-item" data-action="delete-output">
        <span class="vol-ctx-icon">${trashIcon}</span>
        <span>删除产出文件</span>
      </div>` : ''}
    `;

    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;

    requestAnimationFrame(() => menu.classList.add('show'));

    menu.querySelectorAll('.vol-ctx-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', async () => {
        const action = (item as HTMLElement).dataset.action;
        menu.remove();
        if (action === 'rerun') {
          await this.rerunTab(tabId, plugin, type);
        } else if (action === 'delete-output') {
          await this.deleteTabOutput(tabId, plugin);
        }
      });
    });

    const closeMenu = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  /**
   * 重新执行Tab：删除旧产出文件 → 重置状态 → 执行
   */
  private async rerunTab(tabId: string, plugin: string, type: 'csv' | 'text'): Promise<void> {
    await this.deleteTabOutput(tabId, plugin);
    this.tabExecutionStates.set(tabId, { status: 'idle' });
    this.updateTabStatusUI();
    await this.switchTab(tabId, plugin, type);
  }

  /**
   * 删除Tab的产出文件
   */
  private async deleteTabOutput(tabId: string, plugin: string): Promise<void> {
    try {
      const settings = await invoke('load_settings_command') as { output_path?: string };
      const outputPath = settings.output_path || 'output';
      const fileName = this.getOutputFileName(plugin);
      const filePath = `${outputPath}\\${fileName}`;

      await invoke('delete_file', { path: filePath }).catch(() => {});

      // Vol2 json 插件可能还有中间 .json 文件
      if (!this.isTxtPlugin(plugin)) {
        const jsonPath = `${outputPath}\\vol2_${plugin}.json`;
        await invoke('delete_file', { path: jsonPath }).catch(() => {});
      }

      this.tabExecutionStates.set(tabId, { status: 'idle' });
      const countEl = document.getElementById(`tab-count-${tabId}`);
      if (countEl) { countEl.textContent = ''; countEl.style.display = 'none'; }
      this.updateTabStatusUI();
    } catch (error) {
      console.error('删除产出文件失败:', error);
    }
  }

  /**
   * 更新Tab的行数显示
   */
  private updateTabCount(tabId: string, rowCount: number): void {
    const countEl = document.getElementById(`vol2-tab-count-${tabId}`);
    if (countEl) {
      countEl.textContent = rowCount.toLocaleString();
      countEl.style.display = 'inline-flex';
    }
  }

  /**
   * 自动加载第一个Tab
   */
  private loadFirstTab(): void {
    const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup);
    if (currentGroup && currentGroup.tabs.length > 0) {
      const firstTab = currentGroup.tabs[0];
      this.switchTab(firstTab.id, firstTab.plugin, firstTab.type);
    }
  }

  /**
   * 检查已存在的输出文件
   */
  private async checkExistingFiles(): Promise<void> {
    try {
      const settings = await invoke('load_settings_command') as { output_path?: string };
      const outputPath = settings.output_path || 'output';

      const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup);
      if (!currentGroup) return;

      for (const tab of currentGroup.tabs) {
        const fileName = this.getOutputFileName(tab.plugin);
        const filePath = `${outputPath}\\${fileName}`;

        if (await this.checkFileExists(filePath)) {
          this.tabExecutionStates.set(tab.id, {
            status: 'completed',
            outputFile: filePath
          });
        }
      }

      this.updateTabStatusUI();
    } catch (error) {
      console.error('检查已存在文件失败:', error);
    }
  }

  /**
   * 更新Tab状态UI
   */
  private updateTabStatusUI(): void {
    this.tabExecutionStates.forEach((state, tabId) => {
      const tabBtn = document.querySelector(`.vol2-v2-tab[data-tab="${tabId}"]`);
      if (tabBtn) {
        tabBtn.classList.remove('idle', 'running', 'success', 'error', 'completed');
        tabBtn.classList.add(state.status);

        const statusEl = document.getElementById(`vol2-tab-status-${tabId}`);
        if (statusEl) {
          statusEl.innerHTML = this.renderTabStatus(state);
        }
      }
    });
  }

  /**
   * 切换分组
   */
  private switchGroup(groupId: string): void {
    this.activeGroup = groupId;
    const group = this.tabGroups.find(g => g.id === groupId);
    if (!group) return;

    // 更新分组按钮状态
    document.querySelectorAll('.vol2-v2-group-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-group') === groupId);
    });

    // 重新渲染Tabs
    const tabsContainer = document.getElementById('vol2-v2-tabs');
    if (tabsContainer) {
      this.activeTab = group.tabs[0]?.id || '';

      tabsContainer.innerHTML = group.tabs.map(tab => {
        const execState = this.tabExecutionStates.get(tab.id);
        const statusClass = execState?.status || 'idle';
        return `
          <button class="vol2-v2-tab ${tab.id === this.activeTab ? 'active' : ''} ${statusClass}"
                  data-tab="${tab.id}"
                  data-plugin="${tab.plugin}"
                  data-type="${tab.type}">
            <span class="tab-icon">${this.getIcon(tab.icon)}</span>
            <span class="tab-name">${tab.name}</span>
            <span class="tab-count" id="vol2-tab-count-${tab.id}"></span>
            <span class="tab-status" id="vol2-tab-status-${tab.id}">
              ${this.renderTabStatus(execState)}
            </span>
          </button>
        `;
      }).join('');

      this.checkExistingFiles();

      const firstTab = group.tabs[0];
      if (firstTab) {
        this.switchTab(firstTab.id, firstTab.plugin, firstTab.type);
      }
    }
  }

  /**
   * 显示空状态
   */
  private showEmptyState(): void {
    const viewer = document.getElementById('vol2-v2-csv-viewer');
    if (viewer) {
      viewer.innerHTML = `
        <div class="embedded-csv-empty">
          <div class="embedded-csv-empty-icon">${this.getIcon('process')}</div>
          <div class="embedded-csv-empty-title">点击Tab标签执行分析</div>
          <div class="embedded-csv-empty-message">选择上方的功能标签，系统将自动执行Volatility2命令并显示结果</div>
        </div>
      `;
    }
  }

  /**
   * 切换Tab - 核心逻辑：检查文件存在 -> 执行命令 -> 显示数据
   */
  private async switchTab(tabId: string, plugin: string, type: 'csv' | 'text'): Promise<void> {
    this.activeTab = tabId;

    // 更新Tab按钮状态
    document.querySelectorAll('.vol2-v2-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    // 触发动画重绘
    const viewerContainer = document.getElementById('vol2-v2-csv-viewer');
    if (viewerContainer) {
      viewerContainer.classList.remove('animate-enter');
      void viewerContainer.offsetWidth;
      viewerContainer.classList.add('animate-enter');
    }

    // 获取设置
    const settings = await invoke('load_settings_command') as {
      output_path?: string;
      python2_path?: string;
      volatility2_path?: string;
      volatility2_plugin?: string;
      volatility2_profile?: string;
    };
    const outputPath = settings.output_path || 'output';
    const fileName = this.getOutputFileName(plugin);
    const filePath = `${outputPath}\\${fileName}`;

    // 如果该 tab 已经在执行中，不要重复发起执行
    const currentState = this.tabExecutionStates.get(tabId);
    if (currentState?.status === 'running') {
      this.showExecuting(plugin);
      return;
    }

    // 检查文件是否已存在
    const fileExists = await this.checkFileExists(filePath);

    if (fileExists) {
      this.tabExecutionStates.set(tabId, {
        status: 'completed',
        outputFile: filePath
      });
      this.updateTabStatusUI();
      await this.loadTabData(fileName, type, this.getTabDisplayName(tabId));
    } else {
      await this.executeAndLoadTab(tabId, plugin, type, settings, outputPath);
    }
  }

  /**
   * 获取Tab显示名称
   */
  private getTabDisplayName(tabId: string): string {
    for (const group of this.tabGroups) {
      const tab = group.tabs.find(t => t.id === tabId);
      if (tab) return tab.name;
    }
    return tabId;
  }

  /**
   * 执行Vol2命令并加载数据
   */
  private async executeAndLoadTab(
    tabId: string,
    plugin: string,
    type: 'csv' | 'text',
    settings: any,
    outputPath: string
  ): Promise<void> {
    const executingTabId = tabId;

    // 验证配置
    if (!this.state.currentImage) {
      this.showError('请先加载内存镜像文件');
      return;
    }

    if (!settings.python2_path || !settings.volatility2_path) {
      this.showError('请先在设置中配置Python2和Volatility2路径');
      return;
    }

    // 获取 Profile（与 volatility2Executor 一致，使用同一个 vol2-profile 下拉框）
    const profileSelect = document.getElementById('vol2-profile') as HTMLSelectElement;
    const profile = profileSelect?.value || settings.volatility2_profile || '';
    if (!profile) {
      this.showError('请先选择或检测内存镜像的 Profile');
      return;
    }

    // 设置执行中状态
    this.tabExecutionStates.set(tabId, { status: 'running' });
    this.updateTabStatusUI();
    this.showExecuting(plugin);

    try {
      // 执行时传给后端的文件名（json 类型用 .json，后端自动转 .csv）
      const executeFileName = this.getExecuteOutputFileName(plugin);
      const executeFilePath = `${outputPath}\\${executeFileName}`;

      // 最终读取的文件名（json 转换后变成 .csv）
      const finalFileName = this.getOutputFileName(plugin);

      // 决定输出类型：CSV 类型的用 json（后端会自动转 CSV），text 类型的用 text
      const outputType = this.isTxtPlugin(plugin) ? 'text' : 'json';

      // 调用后端命令执行Vol2
      const result = await invoke('execute_volatility2', {
        python2Path: settings.python2_path,
        volatility2Path: settings.volatility2_path,
        volatility2Plugin: settings.volatility2_plugin || '',
        imagePath: this.state.currentImage.path,
        profile: profile,
        plugin: plugin,
        outputType: outputType,
        outputFile: executeFilePath,
        extraArgs: null
      }) as { success: boolean; output_file?: string; message?: string; stderr?: string };

      if (result.success) {
        this.tabExecutionStates.set(executingTabId, {
          status: 'completed',
          outputFile: result.output_file
        });
        this.updateTabStatusUI();

        if (this.activeTab === executingTabId) {
          await this.loadTabData(finalFileName, type, this.getTabDisplayName(executingTabId));
        }
      } else {
        const errorMsg = result.message || '执行Volatility2命令失败';
        const errorDetails = result.stderr || '';
        this.tabExecutionStates.set(executingTabId, {
          status: 'error',
          error: errorMsg
        });
        this.updateTabStatusUI();
        if (this.activeTab === executingTabId) {
          this.showError(errorMsg, errorDetails);
        }
      }
    } catch (error) {
      this.tabExecutionStates.set(executingTabId, {
        status: 'error',
        error: String(error)
      });
      this.updateTabStatusUI();
      if (this.activeTab === executingTabId) {
        this.showError(String(error));
      }
    }
  }

  /**
   * 显示执行中状态
   */
  private showExecuting(plugin: string): void {
    const viewer = document.getElementById('vol2-v2-csv-viewer');
    if (viewer) {
      viewer.innerHTML = `
        <div class="vol2-v2-executing">
          <div class="vol2-v2-executing-icon">
            <svg viewBox="0 0 120 120" width="96" height="96" fill="none">
              <!-- 外圈：虚线旋转扫描环 -->
              <circle cx="60" cy="60" r="54" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-dasharray="6 8" opacity="0.2">
                <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="12s" repeatCount="indefinite"/>
              </circle>
              <!-- 中圈：弧线扫描 -->
              <path d="M60 10 a50 50 0 0 1 43.3 25" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="2.5" stroke-linecap="round" opacity="0.6">
                <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="2s" repeatCount="indefinite"/>
              </path>
              <path d="M60 10 a50 50 0 0 1 43.3 25" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="2.5" stroke-linecap="round" opacity="0.3">
                <animateTransform attributeName="transform" type="rotate" from="180 60 60" to="540 60 60" dur="2s" repeatCount="indefinite"/>
              </path>
              <!-- 内圈底色 -->
              <circle cx="60" cy="60" r="36" stroke="currentColor" stroke-width="1" opacity="0.08"/>
              <!-- 内存芯片图案 -->
              <g opacity="0.5">
                <line x1="48" y1="28" x2="48" y2="35" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="56" y1="28" x2="56" y2="35" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="64" y1="28" x2="64" y2="35" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="72" y1="28" x2="72" y2="35" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="48" y1="85" x2="48" y2="92" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="56" y1="85" x2="56" y2="92" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="64" y1="85" x2="64" y2="92" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="72" y1="85" x2="72" y2="92" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="28" y1="48" x2="35" y2="48" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="28" y1="60" x2="35" y2="60" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="28" y1="72" x2="35" y2="72" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="85" y1="48" x2="92" y2="48" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="85" y1="60" x2="92" y2="60" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="85" y1="72" x2="92" y2="72" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" stroke-linecap="round"/>
              </g>
              <!-- 芯片主体 -->
              <rect x="35" y="35" width="50" height="50" rx="4" stroke="var(--vol2-accent, #ff6b6b)" stroke-width="1.5" fill="var(--vol2-accent, #ff6b6b)" fill-opacity="0.06"/>
              <!-- 芯片内部网格 -->
              <g stroke="var(--vol2-accent, #ff6b6b)" stroke-width="0.5" opacity="0.3">
                <line x1="35" y1="50" x2="85" y2="50"/>
                <line x1="35" y1="60" x2="85" y2="60"/>
                <line x1="35" y1="70" x2="85" y2="70"/>
                <line x1="50" y1="35" x2="50" y2="85"/>
                <line x1="60" y1="35" x2="60" y2="85"/>
                <line x1="70" y1="35" x2="70" y2="85"/>
              </g>
              <!-- 扫描高亮行 -->
              <rect x="36" y="36" width="48" height="4" rx="1" fill="var(--vol2-accent, #ff6b6b)" opacity="0.25">
                <animate attributeName="y" values="36;80;36" dur="3s" repeatCount="indefinite" calcMode="linear"/>
              </rect>
              <!-- 中心芯片标识 -->
              <text x="60" y="64" text-anchor="middle" font-size="10" font-weight="700" font-family="monospace" fill="var(--vol2-accent, #ff6b6b)" opacity="0.7">VOL2</text>
            </svg>
          </div>
          <div class="vol2-v2-executing-title">正在执行 ${this.escapeHtml(plugin)}</div>
          <div class="vol2-v2-executing-message" id="vol2-v2-exec-msg">请稍候，Volatility2正在分析内存镜像...</div>
          <div class="vol2-v2-progress-bar-container" id="vol2-v2-progress-bar-container" style="opacity:1">
            <div class="vol2-v2-progress-bar vol2-v2-progress-bar-pulse" id="vol2-v2-progress-bar"></div>
          </div>
          <div class="vol2-v2-progress-detail" id="vol2-v2-progress-detail"></div>
          <button class="vol2-v2-cancel-btn" id="vol2-v2-cancel-btn">取消执行</button>
        </div>
      `;

      // 绑定取消按钮
      document.getElementById('vol2-v2-cancel-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('vol2-v2-cancel-btn') as HTMLButtonElement;
        if (btn) {
          btn.disabled = true;
          btn.textContent = '正在取消...';
        }
        try {
          await invoke('cancel_volatility2');
          const msgEl = document.getElementById('vol2-v2-exec-msg');
          if (msgEl) msgEl.textContent = '正在取消，请稍候...';
        } catch (e) {
          console.error('取消失败:', e);
          if (btn) {
            btn.disabled = false;
            btn.textContent = '取消执行';
          }
        }
      });
    }
  }

  /**
   * 显示错误信息
   */
  private showError(message: string, details?: string): void {
    const viewer = document.getElementById('vol2-v2-csv-viewer');
    if (viewer) {
      const detailsHtml = details ? `
        <div class="embedded-csv-error-details">
          <div class="embedded-csv-error-details-title">错误详情</div>
          <pre class="embedded-csv-error-details-content">${this.escapeHtml(details)}</pre>
        </div>
      ` : '';

      viewer.innerHTML = `
        <div class="embedded-csv-error">
          <div class="embedded-csv-error-icon">⚠️</div>
          <div class="embedded-csv-error-title">执行失败</div>
          <div class="embedded-csv-error-message">${this.escapeHtml(message)}</div>
          ${detailsHtml}
          <button class="embedded-csv-retry-btn" id="vol2-v2-retry">重试</button>
        </div>
      `;

      // 绑定重试按钮
      document.getElementById('vol2-v2-retry')?.addEventListener('click', () => {
        const activeTabEl = document.querySelector('.vol2-v2-tab.active');
        if (activeTabEl) {
          const tabId = activeTabEl.getAttribute('data-tab');
          const plugin = activeTabEl.getAttribute('data-plugin');
          const type = activeTabEl.getAttribute('data-type') as 'csv' | 'text';
          if (tabId && plugin) {
            this.tabExecutionStates.delete(tabId);
            this.switchTab(tabId, plugin, type);
          }
        }
      });
    }
  }

  /**
   * 加载Tab数据
   */
  private async loadTabData(file: string, type: 'csv' | 'text', displayName: string): Promise<void> {
    if (type === 'csv') {
      await this.embeddedViewer.loadCSV(file, displayName);
    } else {
      await this.embeddedViewer.loadText(file, displayName);
    }
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    this.embeddedViewer.cleanup();
    this.tabExecutionStates.clear();
    this.activeTab = 'imageinfo';
    this.activeGroup = 'system';
    this.eventsInitialized = false;
  }
}

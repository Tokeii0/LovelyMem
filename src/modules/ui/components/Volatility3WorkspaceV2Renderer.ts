/**
 * Volatility3 V2 工作区渲染器
 * 顶部Tab标签页切换 + 下方CSV数据表格
 * 与 MemProcFS V2 不同，Vol3 需要先执行命令生成文件，再显示数据
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { AppState } from '../../core/types';
import { Volatility3Area } from '../../areas/volatility3Area';
import IconParkHelper from '../../utils/iconparkHelper';

import { EmbeddedCSVViewer } from './EmbeddedCSVViewer';
import { Vol3PsListViewer } from './vol3/Vol3PsListViewer';
import { Vol3PsTreeViewer } from './vol3/Vol3PsTreeViewer';
import { Vol3PsScanViewer } from './vol3/Vol3PsScanViewer';
import { Vol3HandleViewer } from './vol3/Vol3HandleViewer';
import { Vol3ThreadViewer } from './vol3/Vol3ThreadViewer';
import { Vol3PrivilegeViewer } from './vol3/Vol3PrivilegeViewer';
import { Vol3ModulesViewer, Vol3ModScanViewer } from './vol3/Vol3ModulesViewer';
import { Vol3DllListViewer } from './vol3/Vol3DllListViewer';
import { Vol3LdrModulesViewer } from './vol3/Vol3LdrModulesViewer';
import { Vol3VadInfoViewer } from './vol3/Vol3VadInfoViewer';
import { Vol3VadWalkViewer } from './vol3/Vol3VadWalkViewer';
import { Vol3BigPoolsViewer } from './vol3/Vol3BigPoolsViewer';
import { Vol3NetStatViewer, Vol3NetScanViewer } from './vol3/Vol3NetStatViewer';
import { Vol3FileScanViewer } from './vol3/Vol3FileScanViewer';
import { Vol3CallbacksViewer } from './vol3/Vol3CallbacksViewer';
import { Vol3SsdtViewer } from './vol3/Vol3SsdtViewer';
import { Vol3DriverScanViewer } from './vol3/Vol3DriverScanViewer';
import { Vol3DriverIrpViewer } from './vol3/Vol3DriverIrpViewer';
import { Vol3DeviceTreeViewer } from './vol3/Vol3DeviceTreeViewer';
import { Vol3TimersViewer } from './vol3/Vol3TimersViewer';
import { Vol3SessionsViewer } from './vol3/Vol3SessionsViewer';
import { Vol3InfoViewer } from './vol3/Vol3InfoViewer';

interface Vol3ProgressEvent {
  plugin: string;
  message: string;
  stage: string;
}

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
  'info': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 22v12M24 14v2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'scan': '<svg viewBox="0 0 48 48"><path d="M4 12V8a4 4 0 0 1 4-4h8M36 4h4a4 4 0 0 1 4 4v8M44 36v4a4 4 0 0 1-4 4h-8M12 44H8a4 4 0 0 1-4-4v-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M4 24h40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'tree': '<svg viewBox="0 0 48 48"><circle cx="24" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="12" cy="24" r="4" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="36" cy="24" r="4" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="8" cy="40" r="4" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="20" cy="40" r="4" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 12v4M12 28v8M20 36v0M12 20v-4l12-4 12 4v4" stroke="currentColor" stroke-width="4"/></svg>',
  'key': '<svg viewBox="0 0 48 48"><circle cx="15" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 24h18v6h-4v-6h-4v6h-4v-6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'user': '<svg viewBox="0 0 48 48"><circle cx="24" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M42 44c0-9.941-8.059-18-18-18S6 34.059 6 44" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'driver': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'thread': '<svg viewBox="0 0 48 48"><path d="M8 24h32" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="14" cy="24" r="4" fill="currentColor"/><circle cx="24" cy="24" r="4" fill="currentColor"/><circle cx="34" cy="24" r="4" fill="currentColor"/></svg>',
  'module': '<svg viewBox="0 0 48 48"><path d="M6 12h16v12H6zM26 12h16v12H26zM6 28h16v12H6zM26 28h16v12H26z" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
  'text': '<svg viewBox="0 0 48 48"><path d="M8 42h32a2 2 0 0 0 2-2V14L30 4H10a2 2 0 0 0-2 2v34a2 2 0 0 0 2 2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M30 4v10h12" stroke="currentColor" stroke-width="4"/><path d="M16 22h16M16 30h16M16 38h10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
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
  plugin: string;  // Vol3 插件名称
  type: 'csv' | 'text';
}

// 执行状态
type ExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'completed';

interface TabExecutionState {
  status: ExecutionStatus;
  error?: string;
  outputFile?: string;
}

export class Volatility3WorkspaceV2Renderer {
  private state: AppState;
  private getAreaIcon: (config: any) => string;
  private isFilePath: (str: string) => boolean;
  private embeddedViewer: EmbeddedCSVViewer;
  private psListViewer: Vol3PsListViewer = new Vol3PsListViewer();
  private psTreeViewer: Vol3PsTreeViewer = new Vol3PsTreeViewer();
  private psScanViewer: Vol3PsScanViewer = new Vol3PsScanViewer();
  private handleViewer: Vol3HandleViewer = new Vol3HandleViewer();
  private threadViewer: Vol3ThreadViewer = new Vol3ThreadViewer();
  private privilegeViewer: Vol3PrivilegeViewer = new Vol3PrivilegeViewer();
  private modulesViewer: Vol3ModulesViewer = new Vol3ModulesViewer();
  private modScanViewer: Vol3ModScanViewer = new Vol3ModScanViewer();
  private dllListViewer: Vol3DllListViewer = new Vol3DllListViewer();
  private ldrModulesViewer: Vol3LdrModulesViewer = new Vol3LdrModulesViewer();
  private vadInfoViewer: Vol3VadInfoViewer = new Vol3VadInfoViewer();
  private vadWalkViewer: Vol3VadWalkViewer = new Vol3VadWalkViewer();
  private bigPoolsViewer: Vol3BigPoolsViewer = new Vol3BigPoolsViewer();
  private netStatViewer: Vol3NetStatViewer = new Vol3NetStatViewer();
  private netScanViewer: Vol3NetScanViewer = new Vol3NetScanViewer();
  private fileScanViewer: Vol3FileScanViewer = new Vol3FileScanViewer();
  private callbacksViewer: Vol3CallbacksViewer = new Vol3CallbacksViewer();
  private ssdtViewer: Vol3SsdtViewer = new Vol3SsdtViewer();
  private driverScanViewer: Vol3DriverScanViewer = new Vol3DriverScanViewer();
  private driverIrpViewer: Vol3DriverIrpViewer = new Vol3DriverIrpViewer();
  private deviceTreeViewer: Vol3DeviceTreeViewer = new Vol3DeviceTreeViewer();
  private timersViewer: Vol3TimersViewer = new Vol3TimersViewer();
  private sessionsViewer: Vol3SessionsViewer = new Vol3SessionsViewer();
  private infoViewer: Vol3InfoViewer = new Vol3InfoViewer();
  private activeTab: string = 'info';
  private activeGroup: string = 'system';
  private currentViewMode: 'csv' | 'special' = 'special';
  private currentSpecialFile: string = '';
  private currentSpecialDisplayName: string = '';
  private currentSpecialType: 'csv' | 'text' = 'csv';

  // 每个Tab的执行状态
  private tabExecutionStates: Map<string, TabExecutionState> = new Map();

  // 防止事件重复绑定
  private eventsInitialized: boolean = false;

  // TXT 格式插件列表
  private readonly txtPlugins = [
    'info',
    'banners',
    'crashinfo',
    'envars',
    'getservicesids',
    'getsids',
    'hashdump',
    'lsadump',
    'printkey',
    'registry.printkey',
    'cachedump'
  ];

  // Tab分组配置
  private tabGroups: TabGroup[] = [
    {
      id: 'system',
      name: '系统信息',
      icon: 'system',
      tabs: [
        { id: 'info', name: '系统信息', icon: 'info', plugin: 'info', type: 'text' },
        { id: 'crashinfo', name: '崩溃信息', icon: 'info', plugin: 'crashinfo', type: 'text' },
        { id: 'statistics', name: '统计信息', icon: 'info', plugin: 'statistics', type: 'csv' },
        { id: 'verinfo', name: '版本信息', icon: 'info', plugin: 'verinfo', type: 'csv' },
        { id: 'banners', name: '系统标识', icon: 'text', plugin: 'banners', type: 'text' },
      ]
    },
    {
      id: 'process',
      name: '进程分析',
      icon: 'process',
      tabs: [
        { id: 'pslist', name: '进程列表', icon: 'process', plugin: 'pslist', type: 'csv' },
        { id: 'pstree', name: '进程树', icon: 'tree', plugin: 'pstree', type: 'csv' },
        { id: 'psscan', name: '进程扫描', icon: 'scan', plugin: 'psscan', type: 'csv' },
        { id: 'cmdline', name: '命令行', icon: 'text', plugin: 'cmdline', type: 'csv' },
        { id: 'envars', name: '环境变量', icon: 'text', plugin: 'envars', type: 'text' },
        { id: 'handles', name: '句柄', icon: 'key', plugin: 'handles', type: 'csv' },
        { id: 'threads', name: '线程', icon: 'thread', plugin: 'threads', type: 'csv' },
        { id: 'privileges', name: '权限', icon: 'security', plugin: 'privileges', type: 'csv' },
      ]
    },
    {
      id: 'memory',
      name: '内存分析',
      icon: 'memory',
      tabs: [
        { id: 'modules', name: '内核模块', icon: 'module', plugin: 'modules', type: 'csv' },
        { id: 'modscan', name: '模块扫描', icon: 'scan', plugin: 'modscan', type: 'csv' },
        { id: 'dlllist', name: 'DLL列表', icon: 'module', plugin: 'dlllist', type: 'csv' },
        { id: 'ldrmodules', name: 'LDR模块', icon: 'module', plugin: 'ldrmodules', type: 'csv' },
        { id: 'vadinfo', name: 'VAD信息', icon: 'memory', plugin: 'vadinfo', type: 'csv' },
        { id: 'vadwalk', name: 'VAD遍历', icon: 'memory', plugin: 'vadwalk', type: 'csv' },
        { id: 'bigpools', name: '大内存池', icon: 'memory', plugin: 'bigpools', type: 'csv' },
      ]
    },
    {
      id: 'network',
      name: '网络分析',
      icon: 'network',
      tabs: [
        { id: 'netstat', name: '网络状态', icon: 'network', plugin: 'netstat', type: 'csv' },
        { id: 'netscan', name: '网络扫描', icon: 'scan', plugin: 'netscan', type: 'csv' },
      ]
    },
    {
      id: 'filesystem',
      name: '文件系统',
      icon: 'filesystem',
      tabs: [
        { id: 'filescan', name: '文件扫描', icon: 'scan', plugin: 'filescan', type: 'csv' },
        { id: 'symlinkscan', name: '符号链接', icon: 'filesystem', plugin: 'symlinkscan', type: 'csv' },
      ]
    },
    {
      id: 'registry',
      name: '注册表',
      icon: 'registry',
      tabs: [
        { id: 'hivelist', name: '配置单元', icon: 'registry', plugin: 'registry.hivelist', type: 'csv' },
        { id: 'hivescan', name: '单元扫描', icon: 'scan', plugin: 'registry.hivescan', type: 'csv' },
        { id: 'printkey', name: '打印键值', icon: 'key', plugin: 'registry.printkey', type: 'text' },
        { id: 'userassist', name: '用户活动', icon: 'user', plugin: 'registry.userassist', type: 'csv' },
        { id: 'certificates', name: '证书', icon: 'security', plugin: 'registry.certificates', type: 'csv' },
      ]
    },
    {
      id: 'security',
      name: '安全分析',
      icon: 'security',
      tabs: [
        { id: 'malfind', name: '恶意代码', icon: 'security', plugin: 'malfind', type: 'csv' },
        { id: 'hashdump', name: '密码哈希', icon: 'key', plugin: 'hashdump', type: 'text' },
        { id: 'cachedump', name: '缓存凭据', icon: 'key', plugin: 'cachedump', type: 'text' },
        { id: 'lsadump', name: 'LSA密钥', icon: 'key', plugin: 'lsadump', type: 'text' },
        { id: 'getsids', name: 'SID', icon: 'user', plugin: 'getsids', type: 'text' },
        { id: 'getservicesids', name: '服务SID', icon: 'services', plugin: 'getservicesids', type: 'text' },
        { id: 'mutantscan', name: '互斥体', icon: 'scan', plugin: 'mutantscan', type: 'csv' },
      ]
    },
    {
      id: 'kernel',
      name: '内核分析',
      icon: 'kernel',
      tabs: [
        { id: 'callbacks', name: '回调函数', icon: 'kernel', plugin: 'callbacks', type: 'csv' },
        { id: 'ssdt', name: 'SSDT', icon: 'kernel', plugin: 'ssdt', type: 'csv' },
        { id: 'driverscan', name: '驱动扫描', icon: 'scan', plugin: 'driverscan', type: 'csv' },
        { id: 'driverirp', name: '驱动IRP', icon: 'driver', plugin: 'driverirp', type: 'csv' },
        { id: 'devicetree', name: '设备树', icon: 'tree', plugin: 'devicetree', type: 'csv' },
        { id: 'timers', name: '定时器', icon: 'services', plugin: 'timers', type: 'csv' },
      ]
    },
    {
      id: 'services',
      name: '服务分析',
      icon: 'services',
      tabs: [
        { id: 'svclist', name: '服务列表', icon: 'services', plugin: 'svclist', type: 'csv' },
        { id: 'svcdiff', name: '服务差异', icon: 'services', plugin: 'svcdiff', type: 'csv' },
        { id: 'sessions', name: '会话信息', icon: 'user', plugin: 'sessions', type: 'csv' },
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
   * 获取输出文件名
   */
  private getOutputFileName(plugin: string): string {
    const ext = this.isTxtPlugin(plugin) ? 'txt' : 'csv';
    return `output_vol3_${plugin}.${ext}`;
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
      <div class="vol3-v2-workspace">
        <!-- 顶部分组选择器 -->
        <div class="vol3-v2-group-bar">
          ${this.tabGroups.map(group => `
            <button class="vol3-v2-group-btn ${group.id === this.activeGroup ? 'active' : ''}"
                    data-group="${group.id}">
              <span class="group-icon">${this.getIcon(group.icon)}</span>
              <span class="group-name">${group.name}</span>
            </button>
          `).join('')}
        </div>

        <!-- Tab标签页 -->
        <div class="vol3-v2-tabs-bar">
          <div class="vol3-v2-tabs" id="vol3-v2-tabs">
            ${currentGroup.tabs.map(tab => {
              const execState = this.tabExecutionStates.get(tab.id);
              const statusClass = execState?.status || 'idle';
              return `
              <button class="vol3-v2-tab ${tab.id === this.activeTab ? 'active' : ''} ${statusClass}"
                      data-tab="${tab.id}"
                      data-plugin="${tab.plugin}"
                      data-type="${tab.type}">
                <span class="tab-icon">${this.getIcon(tab.icon)}</span>
                <span class="tab-name">${tab.name}</span>
                <span class="tab-count" id="tab-count-${tab.id}"></span>
                <span class="tab-status" id="tab-status-${tab.id}">
                  ${this.renderTabStatus(execState)}
                </span>
              </button>
            `}).join('')}
          </div>
        </div>

        <!-- 视图切换栏 -->
        <div class="ntfs-view-toggle-bar" id="vol3-view-toggle-bar" style="display:none"></div>

        <!-- CSV数据表格区域 -->
        <div class="vol3-v2-content">
          <div class="vol3-v2-csv-viewer animate-enter" id="vol3-v2-csv-viewer">
            <div class="embedded-csv-empty">
              <div class="embedded-csv-empty-icon">${this.getIcon('process')}</div>
              <div class="embedded-csv-empty-title">点击Tab标签执行分析</div>
              <div class="embedded-csv-empty-message">选择上方的功能标签，系统将自动执行Volatility3命令并显示结果</div>
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
    // 防止重复绑定事件（切换区域/tab时 initPostRenderEvents 会反复调用）
    if (this.eventsInitialized) {
      // 已初始化过，只需重新检查文件状态和加载首个Tab
      this.checkExistingFiles();
      this.loadFirstTab();
      return;
    }
    this.eventsInitialized = true;

    // 初始化内嵌CSV查看器
    this.embeddedViewer.init('vol3-v2-csv-viewer', (rowCount) => {
      this.updateTabCount(this.activeTab, rowCount);
    });

    // 分组按钮点击事件
    const groupBtns = document.querySelectorAll('.vol3-v2-group-btn');
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

    // 检查已完成的文件并更新状态
    this.checkExistingFiles();

    // 自动执行第一个Tab
    this.loadFirstTab();
  }

  /**
   * 绑定Tab事件
   */
  private bindTabEvents(): void {
    const tabsContainer = document.getElementById('vol3-v2-tabs');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', async (e) => {
        const tab = (e.target as HTMLElement).closest('.vol3-v2-tab');
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
        const tab = (e.target as HTMLElement).closest('.vol3-v2-tab');
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
    // 移除已有的右键菜单
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

    // 调整位置防止溢出
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;

    requestAnimationFrame(() => menu.classList.add('show'));

    // 点击菜单项
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

    // 点击外部关闭
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
    // 先删除旧文件
    await this.deleteTabOutput(tabId, plugin);

    // 重置状态
    this.tabExecutionStates.set(tabId, { status: 'idle' });
    this.updateTabStatusUI();

    // 重新执行（switchTab 发现文件不存在会自动执行）
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

      // 对于 Vol2 的 json 类型插件，还可能有 .json 中间文件，Vol3 只有最终文件
      await invoke('delete_file', { path: filePath }).catch(() => {});

      // 重置状态
      this.tabExecutionStates.set(tabId, { status: 'idle' });
      // 清除行数显示
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
    const countEl = document.getElementById(`tab-count-${tabId}`);
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

      // 检查当前分组的所有Tab
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

      // 更新UI
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
      const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
      if (tabBtn) {
        tabBtn.classList.remove('idle', 'running', 'success', 'error', 'completed');
        tabBtn.classList.add(state.status);

        const statusEl = document.getElementById(`tab-status-${tabId}`);
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
    document.querySelectorAll('.vol3-v2-group-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-group') === groupId);
    });

    // 重新渲染Tabs
    const tabsContainer = document.getElementById('vol3-v2-tabs');
    if (tabsContainer) {
      // 默认选中该分组的第一个Tab
      this.activeTab = group.tabs[0]?.id || '';

      tabsContainer.innerHTML = group.tabs.map(tab => {
        const execState = this.tabExecutionStates.get(tab.id);
        const statusClass = execState?.status || 'idle';
        return `
          <button class="vol3-v2-tab ${tab.id === this.activeTab ? 'active' : ''} ${statusClass}"
                  data-tab="${tab.id}"
                  data-plugin="${tab.plugin}"
                  data-type="${tab.type}">
            <span class="tab-icon">${this.getIcon(tab.icon)}</span>
            <span class="tab-name">${tab.name}</span>
            <span class="tab-count" id="tab-count-${tab.id}"></span>
            <span class="tab-status" id="tab-status-${tab.id}">
              ${this.renderTabStatus(execState)}
            </span>
          </button>
        `;
      }).join('');

      // 事件委托在父容器上，innerHTML 替换后子按钮自动生效，无需重新绑定

      // 检查该分组的已完成文件
      this.checkExistingFiles();

      // 自动执行第一个tab
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
    const viewer = document.getElementById('vol3-v2-csv-viewer');
    if (viewer) {
      viewer.innerHTML = `
        <div class="embedded-csv-empty">
          <div class="embedded-csv-empty-icon">${this.getIcon('process')}</div>
          <div class="embedded-csv-empty-title">点击Tab标签执行分析</div>
          <div class="embedded-csv-empty-message">选择上方的功能标签，系统将自动执行Volatility3命令并显示结果</div>
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
    document.querySelectorAll('.vol3-v2-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    // 触发动画重绘
    const viewerContainer = document.getElementById('vol3-v2-csv-viewer');
    if (viewerContainer) {
      viewerContainer.classList.remove('animate-enter');
      void viewerContainer.offsetWidth;
      viewerContainer.classList.add('animate-enter');
    }

    // 获取设置
    const settings = await invoke('load_settings_command') as {
      output_path?: string;
      python3_path?: string;
      volatility3_path?: string;
    };
    const outputPath = settings.output_path || 'output';
    const fileName = this.getOutputFileName(plugin);
    const filePath = `${outputPath}\\${fileName}`;

    // 如果该 tab 已经在执行中，不要重复发起执行，只恢复执行中 UI
    const currentState = this.tabExecutionStates.get(tabId);
    if (currentState?.status === 'running') {
      this.showExecuting(plugin);
      await this.startProgressListener(plugin);
      return;
    }

    // 检查文件是否已存在
    const fileExists = await this.checkFileExists(filePath);

    if (fileExists) {
      // 文件已存在，直接加载显示
      this.tabExecutionStates.set(tabId, {
        status: 'completed',
        outputFile: filePath
      });
      this.updateTabStatusUI();
      await this.loadTabData(fileName, type, this.getTabDisplayName(tabId));
    } else {
      // 文件不存在，需要执行命令
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
   * 执行Vol3命令并加载数据
   */
  private async executeAndLoadTab(
    tabId: string,
    plugin: string,
    type: 'csv' | 'text',
    settings: any,
    outputPath: string
  ): Promise<void> {
    // 记录执行时的tabId，用于完成后检查
    const executingTabId = tabId;

    // 验证配置
    if (!this.state.currentImage) {
      this.showError('请先加载内存镜像文件');
      return;
    }

    if (!settings.python3_path || !settings.volatility3_path) {
      this.showError('请先在设置中配置Python3和Volatility3路径');
      return;
    }

    // 设置执行中状态
    this.tabExecutionStates.set(tabId, { status: 'running' });
    this.updateTabStatusUI();
    this.showExecuting(plugin);

    // 启动进度事件监听
    await this.startProgressListener(plugin);

    try {
      // 调用后端命令执行Vol3
      const result = await invoke('execute_volatility3', {
        pythonPath: settings.python3_path,
        volatility3Path: settings.volatility3_path,
        imagePath: this.state.currentImage.path,
        plugin: plugin,
        offline: false,
        outputDir: outputPath
      }) as { success: boolean; output_file?: string; message?: string; stderr?: string };

      // 停止进度监听
      await this.stopProgressListener();

      if (result.success) {



        // 执行成功，更新状态
        this.tabExecutionStates.set(executingTabId, {
          status: 'completed',
          outputFile: result.output_file
        });
        this.updateTabStatusUI();

        // 只有当前激活的tab仍是执行时的tab才加载数据
        if (this.activeTab === executingTabId) {
          const fileName = this.getOutputFileName(plugin);
          await this.loadTabData(fileName, type, this.getTabDisplayName(executingTabId));
        }
      } else {
        // 执行失败
        const errorMsg = result.message || '执行Volatility3命令失败';
        const errorDetails = result.stderr || '';
        this.tabExecutionStates.set(executingTabId, {
          status: 'error',
          error: errorMsg
        });
        this.updateTabStatusUI();
        // 只有当前激活的tab仍是执行时的tab才显示错误
        if (this.activeTab === executingTabId) {
          this.showError(errorMsg, errorDetails);
        }
      }
    } catch (error) {
      // 停止进度监听
      await this.stopProgressListener();
      // 异常处理
      this.tabExecutionStates.set(executingTabId, {
        status: 'error',
        error: String(error)
      });
      this.updateTabStatusUI();
      // 只有当前激活的tab仍是执行时的tab才显示错误
      if (this.activeTab === executingTabId) {
        this.showError(String(error));
      }
    }
  }

  /** 进度事件监听器 */
  private progressUnlisten: UnlistenFn | null = null;

  /** 进度消息计数 */
  private progressMessageCount = 0;

  /** 本次执行是否已弹出过需要用户介入的告警(如 VMEM 缺少元数据),避免重复 */
  private vol3WarnShown = false;

  /**
   * 显示执行中状态（带实时进度条和取消按钮）
   */
  private showExecuting(plugin: string): void {
    this.progressMessageCount = 0;
    this.vol3WarnShown = false;
    const viewer = document.getElementById('vol3-v2-csv-viewer');
    if (viewer) {
      viewer.innerHTML = `
        <div class="vol3-v2-executing">
          <div class="vol3-v2-executing-icon">
            <svg viewBox="0 0 120 120" width="96" height="96" fill="none">
              <!-- 外圈：虚线旋转扫描环 -->
              <circle cx="60" cy="60" r="54" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-dasharray="6 8" opacity="0.2">
                <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="12s" repeatCount="indefinite"/>
              </circle>
              <!-- 中圈：弧线扫描 -->
              <path d="M60 10 a50 50 0 0 1 43.3 25" stroke="var(--vol3-accent, #10b981)" stroke-width="2.5" stroke-linecap="round" opacity="0.6">
                <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="2s" repeatCount="indefinite"/>
              </path>
              <path d="M60 10 a50 50 0 0 1 43.3 25" stroke="var(--vol3-accent, #10b981)" stroke-width="2.5" stroke-linecap="round" opacity="0.3">
                <animateTransform attributeName="transform" type="rotate" from="180 60 60" to="540 60 60" dur="2s" repeatCount="indefinite"/>
              </path>
              <!-- 内圈底色 -->
              <circle cx="60" cy="60" r="36" stroke="currentColor" stroke-width="1" opacity="0.08"/>
              <!-- 内存芯片图案 -->
              <g opacity="0.5">
                <!-- 芯片引脚 - 上 -->
                <line x1="48" y1="28" x2="48" y2="35" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="56" y1="28" x2="56" y2="35" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="64" y1="28" x2="64" y2="35" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="72" y1="28" x2="72" y2="35" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <!-- 芯片引脚 - 下 -->
                <line x1="48" y1="85" x2="48" y2="92" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="56" y1="85" x2="56" y2="92" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="64" y1="85" x2="64" y2="92" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="72" y1="85" x2="72" y2="92" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <!-- 芯片引脚 - 左 -->
                <line x1="28" y1="48" x2="35" y2="48" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="28" y1="60" x2="35" y2="60" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="28" y1="72" x2="35" y2="72" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <!-- 芯片引脚 - 右 -->
                <line x1="85" y1="48" x2="92" y2="48" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="85" y1="60" x2="92" y2="60" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="85" y1="72" x2="92" y2="72" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" stroke-linecap="round"/>
              </g>
              <!-- 芯片主体 -->
              <rect x="35" y="35" width="50" height="50" rx="4" stroke="var(--vol3-accent, #10b981)" stroke-width="1.5" fill="var(--vol3-accent, #10b981)" fill-opacity="0.06"/>
              <!-- 芯片内部网格 - 内存单元 -->
              <g stroke="var(--vol3-accent, #10b981)" stroke-width="0.5" opacity="0.3">
                <line x1="35" y1="50" x2="85" y2="50"/>
                <line x1="35" y1="60" x2="85" y2="60"/>
                <line x1="35" y1="70" x2="85" y2="70"/>
                <line x1="50" y1="35" x2="50" y2="85"/>
                <line x1="60" y1="35" x2="60" y2="85"/>
                <line x1="70" y1="35" x2="70" y2="85"/>
              </g>
              <!-- 扫描高亮行 - 从上到下扫描 -->
              <rect x="36" y="36" width="48" height="4" rx="1" fill="var(--vol3-accent, #10b981)" opacity="0.25">
                <animate attributeName="y" values="36;80;36" dur="3s" repeatCount="indefinite" calcMode="linear"/>
              </rect>
              <!-- 中心芯片标识 -->
              <text x="60" y="64" text-anchor="middle" font-size="10" font-weight="700" font-family="monospace" fill="var(--vol3-accent, #10b981)" opacity="0.7">MEM</text>
            </svg>
          </div>
          <div class="vol3-v2-executing-title">正在执行 ${plugin}</div>
          <div class="vol3-v2-executing-message" id="vol3-v2-exec-msg">请稍候，Volatility3正在分析内存镜像...</div>
          <div class="vol3-v2-warn-banner" id="vol3-v2-warn-banner" style="display:none; margin-top:10px; padding:10px 12px; border-radius:8px; background:color-mix(in srgb, #f59e0b 16%, transparent); color:#b45309; font-size:12.5px; line-height:1.6; text-align:left; max-width:560px;"></div>
          <div class="vol3-v2-progress-bar-container" id="vol3-v2-progress-bar-container">
            <div class="vol3-v2-progress-bar" id="vol3-v2-progress-bar"></div>
          </div>
          <div class="vol3-v2-progress-detail" id="vol3-v2-progress-detail"></div>
          <button class="vol3-v2-cancel-btn" id="vol3-v2-cancel-btn">取消执行</button>
        </div>
      `;

      // 绑定取消按钮
      document.getElementById('vol3-v2-cancel-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('vol3-v2-cancel-btn') as HTMLButtonElement;
        if (btn) {
          btn.disabled = true;
          btn.textContent = '正在取消...';
        }
        try {
          await invoke('cancel_volatility3');
          const msgEl = document.getElementById('vol3-v2-exec-msg');
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
   * 启动进度事件监听，原地更新进度条和状态文本
   */
  private async startProgressListener(plugin: string): Promise<void> {
    await this.stopProgressListener();

    this.progressUnlisten = await listen<Vol3ProgressEvent>('vol3-progress', (event) => {
      const { plugin: eventPlugin, message, stage } = event.payload;
      if (eventPlugin !== plugin) return;

      const cleanMsg = this.cleanProgressMessage(message);
      if (!cleanMsg) return;

      // 检测需要用户介入的告警(如 VMEM 缺少 VMSS/VMSN 元数据)，显示专门提示
      this.detectVol3ProgressWarning(cleanMsg);

      // 原地更新主消息文本
      const msgEl = document.getElementById('vol3-v2-exec-msg');
      if (msgEl) {
        // 检测是否为缓存更新消息
        if (/updating caches/i.test(cleanMsg)) {
          msgEl.textContent = '正在更新符号表，请稍等...';
        } else {
          // 去掉 "Progress: 4.34" 前缀，只留后面的描述
          const descOnly = cleanMsg.replace(/^Progress:\s*[\d.]+\s*/i, '').trim();
          const displayText = (descOnly || cleanMsg);
          msgEl.textContent = displayText.length > 80 ? displayText.substring(0, 77) + '...' : displayText;
        }
      }

      // 从消息中提取百分比：匹配 "Progress: 4.34" 或 "45%" 格式
      const progressMatch = cleanMsg.match(/Progress:\s*([\d.]+)/i) || cleanMsg.match(/(\d+(?:\.\d+)?)\s*%/);
      const progressBar = document.getElementById('vol3-v2-progress-bar');
      const progressContainer = document.getElementById('vol3-v2-progress-bar-container');
      if (progressMatch && progressBar && progressContainer) {
        const percent = Math.min(parseFloat(progressMatch[1]), 100);
        progressBar.style.width = `${percent}%`;
        progressBar.classList.remove('vol3-v2-progress-bar-pulse');
        progressContainer.style.opacity = '1';
        // 更新底部详情显示百分比
        const detailEl = document.getElementById('vol3-v2-progress-detail');
        if (detailEl) {
          detailEl.textContent = `${percent.toFixed(1)}%`;
        }
      } else if (progressBar && progressContainer) {
        // 没有百分比时显示脉冲动画
        progressContainer.style.opacity = '1';
        progressBar.classList.add('vol3-v2-progress-bar-pulse');
      }
    });
  }

  /**
   * 停止进度事件监听
   */
  private async stopProgressListener(): Promise<void> {
    if (this.progressUnlisten) {
      this.progressUnlisten();
      this.progressUnlisten = null;
    }
  }

  /**
   * 检测进度流中需要用户介入的告警，并在执行界面给出专门提示(每次执行只提示一次)。
   * 目前覆盖:VMEM 缺少配套 VMSS/VMSN 元数据文件。
   */
  private detectVol3ProgressWarning(msg: string): void {
    if (this.vol3WarnShown) return;
    const low = msg.toLowerCase();
    let banner = '';
    if (
      low.includes('no metadata file found alongside') ||
      low.includes('vmss or vmsn') ||
      (low.includes('vmem') && low.includes('metadata'))
    ) {
      banner =
        '提示:检测到 .vmem 缺少配套的 .vmss / .vmsn 元数据文件，结果可能不准确或为空。请把与 .vmem 同名的 .vmss 或 .vmsn 放到同一目录后重新加载镜像，例如 mem_secret-963a4663.vmem 需配套 mem_secret-963a4663.vmss 或 .vmsn。';
    }
    if (!banner) return;
    this.vol3WarnShown = true;
    const el = document.getElementById('vol3-v2-warn-banner');
    if (el) {
      el.textContent = banner;
      el.style.display = 'block';
    }
  }

  /**
   * 清理进度消息：移除 ANSI 转义序列和进度条字符
   */
  private cleanProgressMessage(message: string): string {
    let cleaned = message;
    cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    cleaned = cleaned.replace(/[█░▓▒■□▪▫●○◆◇]/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
  }

  /**
   * 显示错误信息
   */
  private showError(message: string, details?: string): void {
    const viewer = document.getElementById('vol3-v2-csv-viewer');
    if (!viewer) return;

    // 对错误进行分类(尤其区分「符号表下载失败」),给出简洁摘要 + 操作建议，
    // 完整堆栈折叠收起，避免一大堆提示词糊在界面上。
    const cls = this.classifyVol3Error(message, details || '');
    const detailsHtml = details ? `
        <details class="embedded-csv-error-details">
          <summary class="embedded-csv-error-details-title" style="cursor:pointer;">展开完整错误输出</summary>
          <pre class="embedded-csv-error-details-content">${this.escapeHtml(details)}</pre>
        </details>
      ` : '';
    const hintHtml = cls.hint
      ? `<div class="embedded-csv-error-hint" style="margin-top:10px;padding:10px 12px;border-radius:8px;background:color-mix(in srgb, var(--primary-color,#3b82f6) 10%, transparent);color:var(--text-secondary,#64748b);font-size:12.5px;line-height:1.6;text-align:left;max-width:560px;">${this.escapeHtml(cls.hint)}</div>`
      : '';

    viewer.innerHTML = `
        <div class="embedded-csv-error">
          <div class="embedded-csv-error-icon">[!]</div>
          <div class="embedded-csv-error-title">${this.escapeHtml(cls.title)}</div>
          <div class="embedded-csv-error-message">${this.escapeHtml(cls.summary || message)}</div>
          ${hintHtml}
          ${detailsHtml}
          <button class="embedded-csv-retry-btn" id="vol3-v2-retry">重试</button>
        </div>
      `;

    // 绑定重试按钮
    document.getElementById('vol3-v2-retry')?.addEventListener('click', () => {
      const activeTabEl = document.querySelector('.vol3-v2-tab.active');
      if (activeTabEl) {
        const tabId = activeTabEl.getAttribute('data-tab');
        const plugin = activeTabEl.getAttribute('data-plugin');
        const type = activeTabEl.getAttribute('data-type') as 'csv' | 'text';
        if (tabId && plugin) {
          // 清除之前的状态，重新执行
          this.tabExecutionStates.delete(tabId);
          this.switchTab(tabId, plugin, type);
        }
      }
    });
  }

  /** 将 Volatility3 报错分类为更友好的提示(尤其区分符号表下载失败) */
  private classifyVol3Error(message: string, details: string): { title: string; summary: string; hint?: string } {
    const text = `${message}\n${details}`.toLowerCase();
    const has = (...keys: string[]) => keys.some(k => text.includes(k.toLowerCase()));

    // VMEM 缺少 VMSS/VMSN 元数据(最具体,优先判断)
    if (has('no metadata file found alongside', 'vmss or vmsn') || (has('vmem') && has('metadata'))) {
      return {
        title: 'VMEM 缺少 VMSS/VMSN 元数据',
        summary: '该 .vmem 内存文件缺少配套的 .vmss / .vmsn 元数据文件，Volatility3 无法正确解析。',
        hint: '请把与 .vmem 同名的 .vmss 或 .vmsn 文件放到同一目录后重新加载镜像，例如 mem_secret-963a4663.vmem 需配套 mem_secret-963a4663.vmss 或 .vmsn。'
      };
    }

    const symbolHit = has(
      'symbol table', 'symbol_table', 'symboltable', 'isf', 'symbolerror',
      'unable to download', 'no suitable', 'base symbol', 'symbols.zip',
      'intermed', 'pdbconv', 'remote_isf', 'unsatisfied requirement',
      'could not find a suitable', 'symbol_shift', '符号表'
    );
    const netHit = has(
      'urlerror', 'connectionerror', 'max retries', 'getaddrinfo', 'timed out',
      'timeout', 'sslerror', 'failed to resolve', 'network is unreachable',
      'connection refused', 'name resolution', 'temporary failure', 'certificate'
    );

    if (symbolHit) {
      return {
        title: '符号表下载 / 匹配失败',
        summary: 'Volatility3 未能获取或匹配该镜像所需的符号表(ISF)。',
        hint: '可尝试:① 检查网络(符号表需要联网下载);② 内网/离线环境改用离线模式,或手动把对应 ISF 符号表放入 Volatility3 的 symbols 目录;③ 确认镜像操作系统版本受支持。'
      };
    }
    if (netHit) {
      return {
        title: '网络错误',
        summary: '执行过程中发生网络相关错误(可能在下载符号表或资源)。',
        hint: '请检查网络连接 / 代理设置后重试;离线环境可尝试离线模式。'
      };
    }
    if (has('no base layer', 'invalid memory', 'not a valid', 'unable to read', 'pagedinvalid', 'layer requirement')) {
      return {
        title: '镜像解析失败',
        summary: '无法正确解析该内存镜像(可能格式不符或文件损坏)。',
        hint: '请确认镜像文件完整,且为 Volatility3 支持的格式/操作系统。'
      };
    }
    // 默认:从 stderr 提取一条关键行作为摘要,避免整段堆栈
    const concise = this.extractConciseError(details) || message || 'Volatility3 命令执行失败';
    return { title: '执行失败', summary: concise };
  }

  /** 从一大段 stderr/traceback 中提取最关键的一行作为摘要 */
  private extractConciseError(stderr: string): string {
    if (!stderr) return '';
    const lines = stderr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    const key = [...lines].reverse().find(l =>
      /^volatility/i.test(l) || /(unable to|unsatisfied|error[:：]|exception|not found|failed)/i.test(l)
    );
    return (key || lines[lines.length - 1]).slice(0, 300);
  }

  /**
   * 加载Tab数据
   */
  private readonly SPECIAL_PLUGINS: Record<string, string> = {
    'output_vol3_info.txt': '卡片视图',
    'output_vol3_pslist.csv': '进程列表',
    'output_vol3_pstree.csv': '进程树',
    'output_vol3_psscan.csv': '进程扫描',
    'output_vol3_handles.csv': '句柄视图',
    'output_vol3_threads.csv': '线程视图',
    'output_vol3_privileges.csv': '权限视图',
    'output_vol3_modules.csv': '内核模块',
    'output_vol3_modscan.csv': '模块扫描',
    'output_vol3_dlllist.csv': 'DLL列表',
    'output_vol3_ldrmodules.csv': 'LDR模块',
    'output_vol3_vadinfo.csv': 'VAD信息',
    'output_vol3_vadwalk.csv': 'VAD遍历',
    'output_vol3_bigpools.csv': '大内存池',
    'output_vol3_netstat.csv': '网络状态',
    'output_vol3_netscan.csv': '网络扫描',
    'output_vol3_filescan.csv': '文件扫描',
    'output_vol3_callbacks.csv': '回调函数',
    'output_vol3_ssdt.csv': 'SSDT',
    'output_vol3_driverscan.csv': '驱动扫描',
    'output_vol3_driverirp.csv': '驱动IRP',
    'output_vol3_devicetree.csv': '设备树',
    'output_vol3_timers.csv': '定时器',
    'output_vol3_sessions.csv': '会话信息',
  };

  private readonly SPECIAL_ICONS: Record<string, string> = {
    'output_vol3_info.txt': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    'output_vol3_pslist.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/></svg>',
    'output_vol3_pstree.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="14"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="19" r="3"/><line x1="12" y1="14" x2="6" y2="16"/><line x1="12" y1="14" x2="18" y2="16"/></svg>',
    'output_vol3_psscan.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    'output_vol3_handles.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="8" cy="18" r="1"/></svg>',
    'output_vol3_threads.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    'output_vol3_privileges.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    'output_vol3_modules.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    'output_vol3_modscan.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    'output_vol3_dlllist.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    'output_vol3_ldrmodules.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
    'output_vol3_vadinfo.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/></svg>',
    'output_vol3_vadwalk.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    'output_vol3_bigpools.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>',
    'output_vol3_netstat.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M2 12h20"/></svg>',
    'output_vol3_netscan.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10"/></svg>',
    'output_vol3_filescan.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    'output_vol3_callbacks.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>',
    'output_vol3_ssdt.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    'output_vol3_driverscan.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>',
    'output_vol3_driverirp.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
    'output_vol3_devicetree.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v3"/></svg>',
    'output_vol3_timers.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    'output_vol3_sessions.csv': '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  };

  /**
   * 加载Tab数据
   */
  private async loadTabData(file: string, type: 'csv' | 'text', displayName: string): Promise<void> {
    // 清理所有专属视图
    this.psListViewer.cleanup();
    this.psTreeViewer.cleanup();
    this.psScanViewer.cleanup();
    this.handleViewer.cleanup();
    this.threadViewer.cleanup();
    this.privilegeViewer.cleanup();
    this.modulesViewer.cleanup();
    this.modScanViewer.cleanup();
    this.dllListViewer.cleanup();
    this.ldrModulesViewer.cleanup();
    this.vadInfoViewer.cleanup();
    this.vadWalkViewer.cleanup();
    this.bigPoolsViewer.cleanup();
    this.netStatViewer.cleanup();
    this.netScanViewer.cleanup();
    this.fileScanViewer.cleanup();
    this.callbacksViewer.cleanup();
    this.ssdtViewer.cleanup();
    this.driverScanViewer.cleanup();
    this.driverIrpViewer.cleanup();
    this.deviceTreeViewer.cleanup();
    this.timersViewer.cleanup();
    this.sessionsViewer.cleanup();
    this.infoViewer.cleanup();

    const isSpecial = file in this.SPECIAL_PLUGINS;

    if (isSpecial) {
      this.currentSpecialFile = file;
      this.currentSpecialDisplayName = displayName;
      this.currentSpecialType = type;
      this.renderVol3ToggleBar(file);
    } else {
      // 非专属视图，隐藏切换栏
      this.currentSpecialFile = '';
      this.currentViewMode = 'csv';
      const bar = document.getElementById('vol3-view-toggle-bar');
      if (bar) bar.style.display = 'none';
    }

    if (isSpecial && this.currentViewMode === 'special') {
      await this.loadSpecialView(file);
    } else if (type === 'csv') {
      await this.embeddedViewer.loadCSV(file, displayName);
    } else {
      await this.embeddedViewer.loadText(file, displayName);
    }
  }

  /**
   * 加载专属视图
   */
  private async loadSpecialView(file: string): Promise<void> {
    const viewerId = 'vol3-v2-csv-viewer';
    const handlers: Record<string, () => Promise<void>> = {
      'output_vol3_info.txt': async () => { this.infoViewer.init(viewerId); await this.infoViewer.load(file); },
      'output_vol3_pslist.csv': async () => {
        this.psListViewer.init(viewerId);
        // 注入共享右键菜单宿主：卡片视图与 CSV 表格视图使用完全一致的菜单
        this.psListViewer.setContextMenuHost(this.embeddedViewer);
        await this.psListViewer.load(file);
      },
      'output_vol3_pstree.csv': async () => { this.psTreeViewer.init(viewerId); await this.psTreeViewer.load(file); },
      'output_vol3_psscan.csv': async () => { this.psScanViewer.init(viewerId); await this.psScanViewer.load(file); },
      'output_vol3_handles.csv': async () => { this.handleViewer.init(viewerId); await this.handleViewer.load(file); },
      'output_vol3_threads.csv': async () => { this.threadViewer.init(viewerId); await this.threadViewer.load(file); },
      'output_vol3_privileges.csv': async () => { this.privilegeViewer.init(viewerId); await this.privilegeViewer.load(file); },
      'output_vol3_modules.csv': async () => { this.modulesViewer.init(viewerId); await this.modulesViewer.load(file); },
      'output_vol3_modscan.csv': async () => { this.modScanViewer.init(viewerId); await this.modScanViewer.load(file); },
      'output_vol3_dlllist.csv': async () => { this.dllListViewer.init(viewerId); await this.dllListViewer.load(file); },
      'output_vol3_ldrmodules.csv': async () => { this.ldrModulesViewer.init(viewerId); await this.ldrModulesViewer.load(file); },
      'output_vol3_vadinfo.csv': async () => { this.vadInfoViewer.init(viewerId); await this.vadInfoViewer.load(file); },
      'output_vol3_vadwalk.csv': async () => { this.vadWalkViewer.init(viewerId); await this.vadWalkViewer.load(file); },
      'output_vol3_bigpools.csv': async () => { this.bigPoolsViewer.init(viewerId); await this.bigPoolsViewer.load(file); },
      'output_vol3_netstat.csv': async () => { this.netStatViewer.init(viewerId); await this.netStatViewer.load(file); },
      'output_vol3_netscan.csv': async () => { this.netScanViewer.init(viewerId); await this.netScanViewer.load(file); },
      'output_vol3_filescan.csv': async () => { this.fileScanViewer.init(viewerId); await this.fileScanViewer.load(file); },
      'output_vol3_callbacks.csv': async () => { this.callbacksViewer.init(viewerId); await this.callbacksViewer.load(file); },
      'output_vol3_ssdt.csv': async () => { this.ssdtViewer.init(viewerId); await this.ssdtViewer.load(file); },
      'output_vol3_driverscan.csv': async () => { this.driverScanViewer.init(viewerId); await this.driverScanViewer.load(file); },
      'output_vol3_driverirp.csv': async () => { this.driverIrpViewer.init(viewerId); await this.driverIrpViewer.load(file); },
      'output_vol3_devicetree.csv': async () => { this.deviceTreeViewer.init(viewerId); await this.deviceTreeViewer.load(file); },
      'output_vol3_timers.csv': async () => { this.timersViewer.init(viewerId); await this.timersViewer.load(file); },
      'output_vol3_sessions.csv': async () => { this.sessionsViewer.init(viewerId); await this.sessionsViewer.load(file); },
    };
    const handler = handlers[file];
    if (handler) await handler();
  }

  /**
   * 取证知识小贴士
   */
  private readonly FORENSIC_TIPS: Record<string, { title: string; tips: string[] }> = {
    'output_vol3_pslist.csv': {
      title: '进程列表 · 取证技巧',
      tips: [
        '[+] 对比 PsList 和 PsScan：PsScan 能发现被 DKOM 隐藏的进程',
        '[!] 关注异常 PPID：如 svchost.exe 的父进程不是 services.exe 则高度可疑',
        '[*] 已退出但仍驻留的进程可能是恶意软件执行后清除痕迹',
        '[i] WoW64 标注的是 32 位进程运行在 64 位系统上，恶意软件常用 32 位',
      ]
    },
    'output_vol3_pstree.csv': {
      title: '进程树 · 取证技巧',
      tips: [
        '[+] 正常的进程树应有清晰的父子关系：System → smss → csrss/wininit',
        '[!] 孤儿进程（无父进程）可能是注入或DKOM攻击的迹象',
        '[+] 检查命令行参数：恶意进程常伪装进程名但命令行路径异常',
        '[+] Path 为空但进程活跃可能意味着该进程的可执行文件已被删除',
      ]
    },
    'output_vol3_psscan.csv': {
      title: '进程扫描 · 取证技巧',
      tips: [
        '[+] PsScan 通过扫描物理内存中的 EPROCESS 池标签来发现进程',
        '[!] PsScan 能找到但 PsList 找不到的进程 = 被隐藏的进程（rootkit）',
        '[*] PsScan 也会找到已终止的进程残留，注意区分退出时间',
        '[i] 对比两个列表可快速做 "交叉视图检测"（Cross-View Detection）',
      ]
    },
    'output_vol3_handles.csv': {
      title: '句柄 · 取证技巧',
      tips: [
        '[+] 句柄类型 "Key" = 注册表键，可发现恶意软件的持久化机制',
        '[+] 句柄类型 "File" 可定位恶意软件打开的文件或通信管道',
        '[+] "Mutant" 类型句柄常被恶意软件用作互斥锁防止重复运行',
        '[i] 筛选 "Process" 类型可发现跨进程注入行为',
      ]
    },
    'output_vol3_threads.csv': {
      title: '线程 · 取证技巧',
      tips: [
        '[!] StartAddress 不在进程模块范围内的线程可能是注入的',
        '[+] 没有 Win32StartPath 但有 StartAddress 的线程值得关注',
        '💉 远程线程注入：线程的 StartAddress 指向 ntdll!LdrLoadDll 或 kernel32!LoadLibrary',
        '[*] 检查线程创建时间与进程创建时间的差异，延迟创建的线程可能是注入的',
      ]
    },
    'output_vol3_privileges.csv': {
      title: '权限 · 取证技巧',
      tips: [
        '[!] SeDebugPrivilege 已启用 = 可调试/注入其他进程，普通程序不需要',
        '[!] SeLoadDriverPrivilege = 可加载内核驱动，rootkit 常需此权限',
        '[+] SeBackupPrivilege / SeRestorePrivilege 可绕过文件权限读写任意文件',
        '[i] 筛选 "Enabled" 属性可快速找出拥有高危权限的进程',
      ]
    },
    'output_vol3_modules.csv': {
      title: '内核模块 · 取证技巧',
      tips: [
        '[+] 检查不在 System32\\drivers\\ 下的驱动模块 — 可能是 rootkit',
        '[!] 模块名异常（随机字符串、仿冒系统模块名）是常见恶意驱动特征',
        '[i] 异常小的驱动模块（< 10KB）可能是 shellcode 加载器',
        '[i] 对比 modules 和 modscan 结果，modscan 多出的可能已被卸载',
      ]
    },
    'output_vol3_modscan.csv': {
      title: '模块扫描 · 取证技巧',
      tips: [
        '[+] ModScan 扫描物理内存中的 LDR_DATA_TABLE_ENTRY 结构',
        '[!] 仅在 ModScan 出现而 Modules 没有的 = 已卸载或隐藏的驱动',
        '[*] Name 为 "-" 的条目通常是已损坏的残留数据，可忽略',
        '[i] 重点关注 Path 路径中包含 Temp、AppData 等非标准位置的驱动',
      ]
    },
    'output_vol3_dlllist.csv': {
      title: 'DLL列表 · 取证技巧',
      tips: [
        '💉 DLL 路径不在 System32 或程序目录下？可能是 DLL 劫持/侧加载',
        '[!] 同名 DLL 出现在非标准路径 = 经典 DLL 搜索顺序劫持',
        '[+] LoadTime 为 N/A 的 DLL 是进程启动时就加载的，运行时注入的会有时间戳',
        '[i] 对比 DllList 和 LdrModules 可发现不在加载器列表中的隐藏 DLL',
      ]
    },
    'output_vol3_ldrmodules.csv': {
      title: 'LDR模块 · 取证技巧',
      tips: [
        '[!] InLoad=✗ InInit=✗ InMem=✗（三列全 False）= 高度可疑！可能是注入的模块',
        '💉 正常 DLL 应至少在一个列表中为 True；全 False 表示已从链表中摘除',
        '[+] InMem=True 但 InLoad=False → 模块映射到内存但未通过正常加载器加载',
        '[!] 使用"仅看可疑"按钮可快速定位所有疑似注入的模块',
        '[i] 结合 MappedPath 判断模块来源，合法模块通常指向已知系统路径',
      ]
    },
    'output_vol3_vadinfo.csv': {
      title: 'VAD信息 · 取证技巧',
      tips: [
        '[!] PAGE_EXECUTE_READWRITE(RWX) 是最危险的保护属性 — shellcode 和注入通常需要此权限',
        '[!] RWX 区域无关联文件 = 极高概率是注入的代码（无文件恶意软件）',
        '[+] PAGE_EXECUTE_WRITECOPY 用于已修改的系统 DLL，可能是钩子（hooking）',
        '[i] 使用"可执行"按钮筛选所有可执行区域，重点检查无文件映射的 RWX 区域',
        '[i] CommitCharge 表示实际提交的页数，帮助评估内存占用',
      ]
    },
    'output_vol3_vadwalk.csv': {
      title: 'VAD遍历 · 取证技巧',
      tips: [
        '[+] VAD 使用 AVL 自平衡二叉树管理进程虚拟地址空间',
        '[!] Parent/Left/Right 指针被篡改可能导致内存区域被隐藏',
        '[+] Start-End 地址范围异常大或异常小的节点值得关注',
        '[i] 配合 VadInfo 使用 — VadWalk 显示树结构，VadInfo 显示保护等详细属性',
      ]
    },
    'output_vol3_bigpools.csv': {
      title: '大内存池 · 取证技巧',
      tips: [
        '🏷️ Tag 标签是驱动分配内存时的 4 字节标识，帮助识别分配者',
        '[+] 常见 Tag："Proc"=进程, "Thre"=线程, "CM31"=注册表, "MmSt"=内存管理',
        '[!] 非标准 Tag（不在已知列表中）可能来自第三方驱动或 rootkit',
        '[i] 按 Tag 分组可快速发现异常大量分配 — 可能是内存泄漏或恶意行为',
        '[i] "Freed" 状态的池仍在物理内存中，可用于恢复已释放的数据',
      ]
    },
    'output_vol3_netstat.csv': {
      title: '网络状态 · 取证技巧',
      tips: [
        '[+] 关注 ESTABLISHED 连接到异常 IP/端口 — 可能是 C2 通信',
        '[!] LISTENING 在非标准端口上的进程需要检查是否合法',
        '[i] 同一 PID 有多个外部连接可能是数据外泄或扫描行为',
        '[i] 对比 NetStat（活跃连接）和 NetScan（包含已关闭的）发现更多线索',
      ]
    },
    'output_vol3_netscan.csv': {
      title: '网络扫描 · 取证技巧',
      tips: [
        '[+] NetScan 能找到已关闭的连接和 UDP 端点（NetStat 看不到）',
        '[!] 已关闭但残留在内存中的连接可能揭示历史 C2 通信',
        '[+] UDP 连接不显示状态，关注绑定到非标准端口的 UDP 套接字',
        '[i] Created 时间戳帮助建立网络活动时间线',
      ]
    },
    'output_vol3_filescan.csv': {
      title: '文件扫描 · 取证技巧',
      tips: [
        '[+] 搜索 Temp、AppData、ProgramData 下的可执行文件 — 恶意软件常驻位置',
        '[!] \\Device\\NamedPipe\\ 条目可能揭示进程间通信和横向移动',
        '[i] 搜索 .exe/.dll/.sys 扩展名快速定位可疑二进制文件',
        '[+] 与进程列表交叉对比可确认哪些文件被哪些进程使用',
      ]
    },
    'output_vol3_callbacks.csv': {
      title: '回调函数 · 取证技巧',
      tips: [
        '[!] 来自非 ntoskrnl 模块的回调高度可疑 — 可能是 rootkit 拦截点',
        '[+] CreateProcess 回调常被用于监控/拦截进程创建',
        '[!] LoadImage 回调可拦截 DLL/驱动加载，用于注入或阻止安全软件',
        '[i] Registry 回调（CmpCallBack）可监控和篡改注册表操作',
      ]
    },
    'output_vol3_ssdt.csv': {
      title: 'SSDT · 取证技巧',
      tips: [
        '[!] 所有条目都应指向 ntoskrnl — 指向其他模块意味着 SSDT Hook',
        '[!] Hook 可能来自安全软件（正常）或 rootkit（恶意），需结合模块名判断',
        '[+] Hook NtCreateFile/NtReadFile = 文件操作拦截',
        '[i] Hook NtEnumerateValueKey = 可能在隐藏注册表键值',
      ]
    },
    'output_vol3_driverscan.csv': {
      title: '驱动扫描 · 取证技巧',
      tips: [
        '[+] Service Key 显示驱动在注册表中的注册位置',
        '[!] 没有 Service Key 的驱动可能是通过漏洞或工具直接加载的',
        '[i] 对比 DriversS can 和 Modules 列表发现隐藏驱动',
        '[+] 检查驱动名称是否模仿合法系统驱动（如 "tcpip2.sys"）',
      ]
    },
    'output_vol3_driverirp.csv': {
      title: '驱动IRP · 取证技巧',
      tips: [
        '[i] IRP 分派表定义驱动如何响应 I/O 请求',
        '[!] IRP 指向其他驱动模块地址空间 = IRP Hook（中间人拦截）',
        '[+] 自定义 IRP_MJ_DEVICE_CONTROL 处理函数是驱动与用户态交互的接口',
        '[i] 大多数 IRP 指向 IopInvalidDeviceRequest 是正常的（驱动未实现该功能）',
      ]
    },
    'output_vol3_devicetree.csv': {
      title: '设备树 · 取证技巧',
      tips: [
        '[+] DRV=驱动对象, DEV=设备对象, ATT=附加设备（过滤驱动）',
        '[!] 异常的设备附加（ATT）可能是过滤驱动在拦截 I/O 请求',
        '[+] 文件系统过滤驱动常被 rootkit 用来隐藏文件',
        '[i] 网络驱动栈上的异常附加可能在监听/修改网络流量',
      ]
    },
    'output_vol3_timers.csv': {
      title: '定时器 · 取证技巧',
      tips: [
        '⏰ 内核定时器用于定期执行例程 — 常被 rootkit 用于维持持久化',
        '[!] 来自第三方模块的定时器需要确认是否来自合法驱动',
        '[+] 周期性定时器（Period > 0）更值得关注 — 可能是 beacon 心跳',
        '[i] Routine 地址可与模块列表交叉对比确定所属驱动',
      ]
    },
    'output_vol3_sessions.csv': {
      title: '会话信息 · 取证技巧',
      tips: [
        '👤 Session 0 = 系统服务，Session 1+ = 用户登录会话',
        '[!] 异常用户名或在非预期会话中运行的进程值得调查',
        '[+] RDP 会话通常有独立的 Session ID，可识别远程登录活动',
        '[i] 对比会话中的进程列表与已知合法进程可发现可疑活动',
      ]
    },
  };

  /**
   * 渲染Vol3视图切换栏
   */
  private renderVol3ToggleBar(file: string): void {
    const bar = document.getElementById('vol3-view-toggle-bar');
    if (!bar) return;
    bar.style.display = 'flex';

    const label = this.SPECIAL_PLUGINS[file] || '专属视图';
    const icon = this.SPECIAL_ICONS[file] || '';
    const hasTips = file in this.FORENSIC_TIPS;
    // 原始视图按钮：text 类型显示「原始文本」，csv 类型显示「CSV表格」
    const isTextRaw = this.currentSpecialType === 'text';
    const rawLabel = isTextRaw ? '原始文本' : 'CSV表格';
    const rawIcon = isTextRaw
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>';

    bar.innerHTML = `
      <div class="ntfs-view-toggle-group">
        <button class="ntfs-view-toggle-btn ${this.currentViewMode === 'csv' ? 'active' : ''}" data-vol3mode="csv">
          ${rawIcon}
          ${rawLabel}
        </button>
        <button class="ntfs-view-toggle-btn ${this.currentViewMode === 'special' ? 'active' : ''}" data-vol3mode="special">
          ${icon}
          ${label}
        </button>
      </div>
      ${hasTips ? `
        <div class="vol3-tips-wrapper" style="position:relative;margin-left:auto">
          <button class="vol3-tips-btn" id="vol3-tips-btn" title="取证小贴士">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span style="font-size:11px;margin-left:4px">取证技巧</span>
          </button>
        </div>` : ''}
    `;

    // 绑定切换按钮
    bar.querySelectorAll('.ntfs-view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.getAttribute('data-vol3mode') as 'csv' | 'special';
        if (mode === this.currentViewMode) return;
        this.currentViewMode = mode;
        this.renderVol3ToggleBar(this.currentSpecialFile);

        // 清理并重新加载
        this.psListViewer.cleanup();
        this.psTreeViewer.cleanup();
        this.psScanViewer.cleanup();
        this.handleViewer.cleanup();
        this.threadViewer.cleanup();
        this.privilegeViewer.cleanup();
        this.modulesViewer.cleanup();
        this.modScanViewer.cleanup();
        this.dllListViewer.cleanup();
        this.ldrModulesViewer.cleanup();
        this.vadInfoViewer.cleanup();
        this.vadWalkViewer.cleanup();
        this.bigPoolsViewer.cleanup();
        this.netStatViewer.cleanup();
        this.netScanViewer.cleanup();
        this.fileScanViewer.cleanup();
        this.callbacksViewer.cleanup();
        this.ssdtViewer.cleanup();
        this.driverScanViewer.cleanup();
        this.driverIrpViewer.cleanup();
        this.deviceTreeViewer.cleanup();
        this.timersViewer.cleanup();
        this.sessionsViewer.cleanup();
        this.infoViewer.cleanup();

        if (mode === 'special') {
          await this.loadSpecialView(this.currentSpecialFile);
        } else {
          this.embeddedViewer.init('vol3-v2-csv-viewer', (rowCount) => {
            this.updateTabCount(this.activeTab, rowCount);
          });
          if (this.currentSpecialType === 'text') {
            await this.embeddedViewer.loadText(this.currentSpecialFile, this.currentSpecialDisplayName);
          } else {
            await this.embeddedViewer.loadCSV(this.currentSpecialFile, this.currentSpecialDisplayName);
          }
        }
      });
    });

    // 绑定取证小贴士按钮
    if (hasTips) {
      document.getElementById('vol3-tips-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showForensicTips(file);
      });
    }
  }

  /**
   * 显示取证小贴士弹窗
   */
  private showForensicTips(file: string): void {
    // 移除已有弹窗
    document.querySelectorAll('.vol3-tips-popover').forEach(e => e.remove());

    const tipsData = this.FORENSIC_TIPS[file];
    if (!tipsData) return;

    const popover = document.createElement('div');
    popover.className = 'vol3-tips-popover';
    popover.innerHTML = `
      <div class="vol3-tips-header">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>${tipsData.title}</span>
        <button class="vol3-tips-close">&times;</button>
      </div>
      <ul class="vol3-tips-list">
        ${tipsData.tips.map(tip => `<li>${tip}</li>`).join('')}
      </ul>
    `;

    // 样式内联写（避免额外CSS文件）
    Object.assign(popover.style, {
      position: 'fixed', right: '24px', top: '180px', width: '380px', maxWidth: 'calc(100vw - 48px)',
      background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border-color, #e2e8f0)',
      borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
      zIndex: '10000', animation: 'fadeInUp 0.25s ease', overflow: 'hidden',
    });

    const header = popover.querySelector('.vol3-tips-header') as HTMLElement;
    if (header) Object.assign(header.style, {
      display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 16px',
      borderBottom: '1px solid var(--border-color, #e2e8f0)',
      fontWeight: '600', fontSize: '13px', color: 'var(--text-primary, #1e293b)',
    });

    const list = popover.querySelector('.vol3-tips-list') as HTMLElement;
    if (list) Object.assign(list.style, {
      listStyle: 'none', padding: '12px 16px', margin: '0', display: 'flex', flexDirection: 'column', gap: '10px',
    });
    popover.querySelectorAll('.vol3-tips-list li').forEach(li => {
      Object.assign((li as HTMLElement).style, {
        fontSize: '12.5px', lineHeight: '1.6', color: 'var(--text-secondary, #475569)',
        padding: '8px 12px', borderRadius: '8px',
        background: 'var(--bg-secondary, #f8fafc)',
        borderLeft: '3px solid var(--vol3-accent, #10b981)',
      });
    });

    const closeBtn = popover.querySelector('.vol3-tips-close') as HTMLElement;
    if (closeBtn) Object.assign(closeBtn.style, {
      marginLeft: 'auto', background: 'none', border: 'none', fontSize: '18px',
      cursor: 'pointer', color: 'var(--text-secondary, #94a3b8)', padding: '0 2px', lineHeight: '1',
    });

    // 关闭逻辑
    closeBtn?.addEventListener('click', () => popover.remove());
    const clickOutside = (e: MouseEvent) => {
      if (!popover.contains(e.target as Node)) { popover.remove(); document.removeEventListener('click', clickOutside); }
    };
    setTimeout(() => document.addEventListener('click', clickOutside), 10);
    const escH = (e: KeyboardEvent) => { if (e.key === 'Escape') { popover.remove(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);

    document.body.appendChild(popover);
  }

  /**
   * HTML转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 清理
   */
  public cleanup(): void {
    this.embeddedViewer.cleanup();
    this.psListViewer.cleanup();
    this.psTreeViewer.cleanup();
    this.psScanViewer.cleanup();
    this.handleViewer.cleanup();
    this.threadViewer.cleanup();
    this.privilegeViewer.cleanup();
    this.modulesViewer.cleanup();
    this.modScanViewer.cleanup();
    this.dllListViewer.cleanup();
    this.ldrModulesViewer.cleanup();
    this.vadInfoViewer.cleanup();
    this.vadWalkViewer.cleanup();
    this.bigPoolsViewer.cleanup();
    this.netStatViewer.cleanup();
    this.netScanViewer.cleanup();
    this.fileScanViewer.cleanup();
    this.callbacksViewer.cleanup();
    this.ssdtViewer.cleanup();
    this.driverScanViewer.cleanup();
    this.driverIrpViewer.cleanup();
    this.deviceTreeViewer.cleanup();
    this.timersViewer.cleanup();
    this.sessionsViewer.cleanup();
    this.infoViewer.cleanup();
    this.tabExecutionStates.clear();
    this.activeTab = 'info';
    this.activeGroup = 'system';
  }
}

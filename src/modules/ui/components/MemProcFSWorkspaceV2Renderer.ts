/**
 * MemProcFS V2 工作区渲染器
 * 顶部Tab标签页切换 + 下方CSV数据表格
 */

import { invoke } from '@tauri-apps/api/core';
import { AppState } from '../../core/types';
import { MemProcFSAreaV2, CSV_FEATURE_MAP } from '../../areas/memprocfsAreaV2';
import { EmbeddedCSVViewer } from './EmbeddedCSVViewer';
import { NtfsFileTreeViewer } from './NtfsFileTreeViewer';
import { HandlesViewer } from './HandlesViewer';
import { ServicesViewer } from './ServicesViewer';
import { ModulesViewer } from './ModulesViewer';
import { DriversViewer } from './DriversViewer';
import { ProcessViewer } from './ProcessViewer';
import { NetViewer } from './NetViewer';
import { SysInfoViewer } from './SysInfoViewer';

// IconPark 风格的 SVG 图标定义
const SVG_ICONS: Record<string, string> = {
  'basic': '<svg viewBox="0 0 48 48"><path d="M42 6H6a2 2 0 0 0-2 2v32a2 2 0 0 0 2 2h36a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 24h20M14 32h20M14 16h20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'forensics': '<svg viewBox="0 0 48 48"><path d="M21 38c9.389 0 17-7.611 17-17S30.389 4 21 4 4 11.611 4 21s7.611 17 17 17z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M33.222 33.222l8.485 8.485" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M21 15v6h6" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'browser': '<svg viewBox="0 0 48 48"><path d="M24 44c11.046 0 20-8.954 20-20S35.046 4 24 4 4 12.954 4 24s8.954 20 20 20z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M4 24h40M24 4v40M10 10l28 28M38 10L10 38" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5"/></svg>',
  'timeline': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 14v10l7 7" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'security': '<svg viewBox="0 0 48 48"><path d="M24 4l16 6v14c0 12-10 20-16 20S8 36 8 24V10l16-6z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M17 23l5 5 10-10" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'registry': '<svg viewBox="0 0 48 48"><path d="M40 12H8a2 2 0 0 0-2 2v20a2 2 0 0 0 2 2h32a2 2 0 0 0 2-2V14a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M16 4v8M32 4v8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'apps': '<svg viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 16h6v6h-6zM28 16h6v6h-6zM14 28h6v6h-6zM28 28h6v6h-6z" fill="currentColor"/></svg>',
  
  // Tabs
  'process': '<svg viewBox="0 0 48 48"><path d="M4 12h40v24H4z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M12 20h24M12 28h24" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'network': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="4"/><path d="M4 24h40M24 4v40" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="24" r="8" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
  'service': '<svg viewBox="0 0 48 48"><path d="M24 4v4M24 40v4M4 24h4M40 24h4" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 18v6h6" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'user': '<svg viewBox="0 0 48 48"><circle cx="24" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M42 44c0-9.941-8.059-18-18-18S6 34.059 6 44" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'startup': '<svg viewBox="0 0 48 48"><path d="M24 4v40M4 24h40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M12 12l24 24M36 12L12 36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'task': '<svg viewBox="0 0 48 48"><path d="M42 10H6a2 2 0 0 0-2 2v30a2 2 0 0 0 2 2h36a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 6v8M34 6v8M14 26h20M14 34h14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'driver': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 8v32M8 24h32" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'module': '<svg viewBox="0 0 48 48"><path d="M6 12h16v12H6zM26 12h16v12H26zM6 28h16v12H6zM26 28h16v12H26z" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
  'file': '<svg viewBox="0 0 48 48"><path d="M8 42h32a2 2 0 0 0 2-2V14L30 4H10a2 2 0 0 0-2 2v34a2 2 0 0 0 2 2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M30 4v10h12" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
  'text': '<svg viewBox="0 0 48 48"><path d="M8 42h32a2 2 0 0 0 2-2V14L30 4H10a2 2 0 0 0-2 2v34a2 2 0 0 0 2 2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M30 4v10h12" stroke="currentColor" stroke-width="4"/><path d="M16 22h16M16 30h16M16 38h10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'info': '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 22v12M24 14v2" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'scan': '<svg viewBox="0 0 48 48"><path d="M4 12V8a4 4 0 0 1 4-4h8M36 4h4a4 4 0 0 1 4 4v8M44 36v4a4 4 0 0 1-4 4h-8M12 44H8a4 4 0 0 1-4-4v-8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M4 24h40" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
  'key': '<svg viewBox="0 0 48 48"><circle cx="15" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 24h18v6h-4v-6h-4v6h-4v-6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
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
  file: string;  // 文件名（支持 .csv 和 .txt）
  type: 'csv' | 'text';
}

export class MemProcFSWorkspaceV2Renderer {
  private state: AppState;
  private getAreaIcon: (config: any) => string;
  private isFilePath: (str: string) => boolean;
  private embeddedViewer: EmbeddedCSVViewer = new EmbeddedCSVViewer();
  private ntfsTreeViewer: NtfsFileTreeViewer = new NtfsFileTreeViewer();
  private handlesViewer: HandlesViewer = new HandlesViewer();
  private servicesViewer: ServicesViewer = new ServicesViewer();
  private modulesViewer: ModulesViewer = new ModulesViewer();
  private driversViewer: DriversViewer = new DriversViewer();
  private processViewer: ProcessViewer = new ProcessViewer();
  private netViewer: NetViewer = new NetViewer();
  private sysInfoViewer: SysInfoViewer = new SysInfoViewer();
  private activeTab: string = 'sysinfo';
  private activeGroup: string = 'basic';
  private currentViewMode: 'csv' | 'tree' = 'csv';

  // 防止事件重复绑定
  private eventsInitialized: boolean = false;

  // Tab分组配置
  private tabGroups: TabGroup[] = [
    // {
    //   id: 'overview',
    //   name: '系统概览',
    //   icon: 'info',
    //   tabs: [
    //     { id: 'sysinfo', name: '系统信息', icon: 'info', file: 'sysinfo.txt', type: 'text' },
    //     { id: 'general', name: '综合信息', icon: 'text', file: 'general.txt', type: 'text' },
    //     { id: 'sys_proc', name: '进程摘要', icon: 'process', file: 'sys_proc.txt', type: 'text' },
    //     { id: 'sys_net', name: '网络摘要', icon: 'network', file: 'sys_net.txt', type: 'text' },
    //     { id: 'sys_task', name: '任务摘要', icon: 'task', file: 'sys_task.txt', type: 'text' },
    //   ]
    // },
    {
      id: 'basic',
      name: '基础信息',
      icon: 'basic',
      tabs: [
        { id: 'sysinfo', name: '系统信息', icon: 'info', file: 'sysinfo.txt', type: 'text' },
        { id: 'proc_info', name: '进程详情', icon: 'process', file: 'process.csv', type: 'csv' },
        { id: 'net_info', name: '网络详情', icon: 'network', file: 'net.csv', type: 'csv' },
        { id: 'services', name: '系统服务', icon: 'service', file: 'services.csv', type: 'csv' },
        { id: 'accounts', name: '用户列表', icon: 'user', file: 'lovelymem/accounts.csv', type: 'csv' },
        { id: 'startup', name: '自启动', icon: 'startup', file: 'lovelymem/startup.csv', type: 'csv' },
        { id: 'tasks', name: '计划任务', icon: 'task', file: 'tasks.csv', type: 'csv' },
        { id: 'drivers', name: '驱动程序', icon: 'driver', file: 'drivers.csv', type: 'csv' },
        { id: 'modules', name: '模块信息', icon: 'module', file: 'modules.csv', type: 'csv' },
        { id: 'timezone', name: '时区信息', icon: 'timezone', file: 'lovelymem/timezone.csv', type: 'csv' },
      ]
    },
    {
      id: 'forensics',
      name: '取证分析',
      icon: 'forensics',
      tabs: [
        { id: 'handles', name: '句柄信息', icon: 'key', file: 'handles.csv', type: 'csv' },
        { id: 'files', name: '内存文件', icon: 'file', file: 'files.csv', type: 'csv' },
        { id: 'timeline_ntfs_forensics', name: 'NTFS时间线', icon: 'file', file: 'timeline_ntfs.csv', type: 'csv' },
        { id: 'shimcache', name: 'Shimcache', icon: 'file', file: 'lovelymem/shimcache.csv', type: 'csv' },
        { id: 'appcompat', name: '应用兼容', icon: 'file', file: 'lovelymem/appcompat.csv', type: 'csv' },
        { id: 'cmdline', name: '命令行', icon: 'process', file: 'lovelymem/cmdline.csv', type: 'csv' },
        { id: 'environ', name: '环境变量', icon: 'process', file: 'lovelymem/environ.csv', type: 'csv' },
        { id: 'usb_devices', name: 'USB设备', icon: 'driver', file: 'usb_devices.txt', type: 'text' },
      ]
    },
    {
      id: 'browser',
      name: '浏览器配置取证',
      icon: 'browser',
      tabs: [
        { id: 'chrome', name: 'Chrome', icon: 'browser', file: 'lovelymem/chrome.csv', type: 'csv' },
        { id: 'edge', name: 'Edge', icon: 'browser', file: 'lovelymem/edge.csv', type: 'csv' },
        { id: 'firefox', name: 'Firefox', icon: 'browser', file: 'lovelymem/firefox.csv', type: 'csv' },
        { id: 'extensions', name: '浏览器扩展', icon: 'module', file: 'lovelymem/extensions.csv', type: 'csv' },
        { id: 'downloads', name: '下载记录', icon: 'file', file: 'lovelymem/downloads.csv', type: 'csv' },
        { id: 'chinabrowser', name: '国产浏览器', icon: 'browser', file: 'lovelymem/chinabrowser.csv', type: 'csv' },
      ]
    },
    {
      id: 'timeline',
      name: '时间线',
      icon: 'timeline',
      tabs: [
        { id: 'timeline_process', name: '进程时间线', icon: 'process', file: 'timeline_process.csv', type: 'csv' },
        { id: 'timeline_net', name: '网络时间线', icon: 'network', file: 'timeline_net.csv', type: 'csv' },
        { id: 'timeline_ntfs', name: 'NTFS时间线', icon: 'file', file: 'timeline_ntfs.csv', type: 'csv' },
        { id: 'timeline_web', name: 'Web时间线', icon: 'browser', file: 'timeline_web.csv', type: 'csv' },
        { id: 'timeline_registry', name: '注册表时间线', icon: 'registry', file: 'timeline_registry.csv', type: 'csv' },
        { id: 'activity', name: '活动记录', icon: 'task', file: 'lovelymem/activity.csv', type: 'csv' },
      ]
    },
    {
      id: 'security',
      name: '安全分析',
      icon: 'security',
      tabs: [
        { id: 'yara_report', name: 'Yara报告', icon: 'text', file: 'yara.txt', type: 'text' },
        { id: 'yara', name: 'Yara详情', icon: 'scan', file: 'yara.csv', type: 'csv' },
        { id: 'findevil', name: '恶意软件', icon: 'security', file: 'findevil.csv', type: 'csv' },
        { id: 'security', name: '安全配置', icon: 'security', file: 'lovelymem/security.csv', type: 'csv' },
        { id: 'policies', name: '策略设置', icon: 'task', file: 'lovelymem/policies.csv', type: 'csv' },
        { id: 'secrets', name: '系统密码相关', icon: 'security', file: 'secrets_all.txt', type: 'text' },
      ]
    },
    {
      id: 'registry',
      name: '注册表痕迹',
      icon: 'registry',
      tabs: [
        { id: 'shellbags', name: 'ShellBags', icon: 'file', file: 'lovelymem/shellbags.csv', type: 'csv' },
        { id: 'userassist', name: 'UserAssist', icon: 'user', file: 'lovelymem/userassist.csv', type: 'csv' },
        { id: 'mru', name: 'MRU记录', icon: 'file', file: 'lovelymem/mru.csv', type: 'csv' },
        { id: 'runmru', name: 'RunMRU', icon: 'process', file: 'lovelymem/runmru.csv', type: 'csv' },
        { id: 'typedpaths', name: 'TypedPaths', icon: 'file', file: 'lovelymem/typedpaths.csv', type: 'csv' },
        { id: 'recentdocs', name: '最近文档', icon: 'file', file: 'lovelymem/recentdocs.csv', type: 'csv' },
      ]
    },
    {
      id: 'apps',
      name: '应用痕迹',
      icon: 'apps',
      tabs: [
        { id: 'wechat', name: '微信', icon: 'apps', file: 'lovelymem/wechat.csv', type: 'csv' },
        { id: 'chineseim', name: '国产IM', icon: 'apps', file: 'lovelymem/chineseim.csv', type: 'csv' },
        { id: 'chinacloud', name: '国产云盘', icon: 'file', file: 'lovelymem/chinacloud.csv', type: 'csv' },
        { id: 'onedrive', name: 'OneDrive', icon: 'file', file: 'lovelymem/onedrive.csv', type: 'csv' },
        { id: 'rdp', name: 'RDP连接', icon: 'network', file: 'lovelymem/rdp.csv', type: 'csv' },
        { id: 'software', name: '已安装软件', icon: 'apps', file: 'lovelymem/software.csv', type: 'csv' },
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
    this.ntfsTreeViewer = new NtfsFileTreeViewer();
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
   * 渲染V2工作区 - Tab标签页布局
   */
  public render(): string {
    // render() 会生成全新 DOM，必须重新绑定事件
    this.eventsInitialized = false;

    const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup) || this.tabGroups[0];

    return `
      <div class="memprocfs-v2-workspace">
        <!-- 顶部分组选择器 -->
        <div class="memprocfs-v2-group-bar">
          ${this.tabGroups.map(group => `
            <button class="memprocfs-v2-group-btn ${group.id === this.activeGroup ? 'active' : ''}"
                    data-group="${group.id}">
              <span class="group-icon">${this.getIcon(group.icon)}</span>
              <span class="group-name">${group.name}</span>
            </button>
          `).join('')}
        </div>

        <!-- Tab标签页 -->
        <div class="memprocfs-v2-tabs-bar">
          <div class="memprocfs-v2-tabs" id="memprocfs-v2-tabs">
            ${currentGroup.tabs.map(tab => `
              <button class="memprocfs-v2-tab ${tab.id === this.activeTab ? 'active' : ''}"
                      data-tab="${tab.id}"
                      data-csv="${tab.file}"
                      data-type="${tab.type}">
                <span class="tab-icon">${this.getIcon(tab.icon)}</span>
                <span class="tab-name">${tab.name}</span>
                <span class="tab-count" id="tab-count-${tab.id}"></span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- CSV数据表格区域 -->
        <div class="memprocfs-v2-content">
          <div class="memprocfs-v2-csv-viewer animate-enter" id="memprocfs-v2-csv-viewer">
            <div class="embedded-csv-empty">
              <div class="embedded-csv-empty-icon">${this.getIcon('basic')}</div>
              <div class="embedded-csv-empty-title">正在加载数据...</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 初始化事件绑定
   */
  public initEvents(): void {
    if (this.eventsInitialized) {
      this.loadFirstTab();
      this.updateAllTabCounts();
      return;
    }
    this.eventsInitialized = true;

    // 初始化内嵌CSV查看器，传入数据加载回调
    this.embeddedViewer.init('memprocfs-v2-csv-viewer', (rowCount) => {
      this.updateTabCount(this.activeTab, rowCount);
    });

    // 分组按钮点击事件
    const groupBtns = document.querySelectorAll('.memprocfs-v2-group-btn');
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

    // 自动加载第一个Tab的数据，并加载所有Tab的计数
    this.loadFirstTab();
    this.updateAllTabCounts();
  }

  /**
   * 绑定Tab事件
   */
  private bindTabEvents(): void {
    const tabsContainer = document.getElementById('memprocfs-v2-tabs');
    if (tabsContainer) {
      tabsContainer.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).closest('.memprocfs-v2-tab');
        if (tab) {
          const tabId = tab.getAttribute('data-tab');
          const file = tab.getAttribute('data-csv');
          const type = tab.getAttribute('data-type') as 'csv' | 'text';
          if (tabId && file) {
            this.switchTab(tabId, file, type);
          }
        }
      });
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
   * 异步获取并更新当前分组所有Tab的计数
   */
  private async updateAllTabCounts(): Promise<void> {
    const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup);
    if (!currentGroup) return;

    // 获取用户设置中的输出路径
    try {
      const settings = await invoke('load_settings_command') as { output_path?: string };
      const outputPath = settings.output_path || 'output';

      // 并行加载所有Tab的计数（限制并发或全部并发取决于性能，这里使用Promise.all全部并发）
      // 注意：对于大文件这可能会有性能影响，但这是用户要求的
      const promises = currentGroup.tabs.map(async (tab) => {
        try {
          const csvPath = `${outputPath}\\${tab.file}`;
          
          // 如果是当前Tab，不需要重复加载，因为EmbeddedCSVViewer会加载
          if (tab.id === this.activeTab) return;

          // 调用后端命令读取文件（这里我们只需要计数，可以优化后端命令只返回行数，
          // 但目前只能复用read_csv_file_embedded，它有限制读取行数，所以不会太慢）
          if (tab.type === 'csv') {
             const data = await invoke('read_csv_file_embedded', { csvFilePath: csvPath }) as any;
             if (data && data.rows) {
               this.updateTabCount(tab.id, data.rows.length);
             }
          } else {
             // 文本文件计数
             const content = await invoke('read_file', { path: csvPath }) as string;
             const lines = content.split('\n').filter(line => line.trim()).length;
             this.updateTabCount(tab.id, lines);
          }
        } catch (e) {
          console.warn(`Failed to load count for ${tab.id}:`, e);
        }
      });

      await Promise.all(promises);
    } catch (e) {
      console.error('Failed to load tab counts:', e);
    }
  }

  /**
   * 切换分组
   */
  private switchGroup(groupId: string): void {
    this.activeGroup = groupId;
    const group = this.tabGroups.find(g => g.id === groupId);
    if (!group) return;

    // 更新分组按钮状态
    document.querySelectorAll('.memprocfs-v2-group-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-group') === groupId);
    });

    // 重新渲染Tabs
    const tabsContainer = document.getElementById('memprocfs-v2-tabs');
    if (tabsContainer) {
      // 默认选中该分组的第一个Tab
      this.activeTab = group.tabs[0]?.id || '';
      
      tabsContainer.innerHTML = group.tabs.map(tab => `
        <button class="memprocfs-v2-tab ${tab.id === this.activeTab ? 'active' : ''}"
                data-tab="${tab.id}"
                data-csv="${tab.file}"
                data-type="${tab.type}">
          <span class="tab-icon">${this.getIcon(tab.icon)}</span>
          <span class="tab-name">${tab.name}</span>
          <span class="tab-count" id="tab-count-${tab.id}"></span>
        </button>
      `).join('');

      // 事件委托在父容器上，innerHTML 替换后子按钮自动生效，无需重新绑定

      // 加载第一个Tab的数据
      if (group.tabs[0]) {
        this.loadTabData(group.tabs[0].file, group.tabs[0].type, group.tabs[0].name);
      }
      
      // 加载本组所有计数
      this.updateAllTabCounts();
    }
  }

  /**
   * 切换Tab
   */
  private switchTab(tabId: string, file: string, type: 'csv' | 'text'): void {
    this.activeTab = tabId;

    // 更新Tab按钮状态
    document.querySelectorAll('.memprocfs-v2-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    // 触发动画重绘
    const viewerContainer = document.getElementById('memprocfs-v2-csv-viewer');
    if (viewerContainer) {
      viewerContainer.classList.remove('animate-enter');
      void viewerContainer.offsetWidth; // 触发重绘
      viewerContainer.classList.add('animate-enter');
    }

    // 找到Tab名称
    const group = this.tabGroups.find(g => g.id === this.activeGroup);
    const tabInfo = group?.tabs.find(t => t.id === tabId);
    const displayName = tabInfo?.name || file;

    // 加载数据
    this.loadTabData(file, type, displayName);
  }

  /**
   * 加载Tab数据
   */
  private async loadTabData(file: string, type: 'csv' | 'text', displayName: string): Promise<void> {
    // 特殊视图 -> 支持视图切换
    if (file === 'timeline_ntfs.csv' || file === 'files.csv' || file === 'handles.csv' || file === 'services.csv' || file === 'modules.csv' || file === 'drivers.csv' || file === 'process.csv' || file === 'net.csv') {
      this.currentNtfsFile = file;
      this.currentNtfsDisplayName = displayName;
      this.currentTreeMode = file === 'files.csv' ? 'files' : 'ntfs';
      this.sysInfoViewer.cleanup();
      await this.loadNtfsView();
      return;
    }

    // 默认 CSV/Text 视图
    this.currentNtfsFile = null;
    this.currentTreeMode = 'ntfs';
    this.removeNtfsToggleBar();
    this.ntfsTreeViewer.cleanup();
    this.handlesViewer.cleanup();
    this.servicesViewer.cleanup();
    this.modulesViewer.cleanup();
    this.driversViewer.cleanup();
    this.processViewer.cleanup();
    this.netViewer.cleanup();
    this.sysInfoViewer.cleanup();
    this.currentViewMode = 'csv';

    // SysInfo 专用面板
    if (file === 'sysinfo.txt') {
      this.sysInfoViewer.init('memprocfs-v2-csv-viewer');
      await this.sysInfoViewer.load();
      return;
    }

    if (type === 'csv') {
      await this.embeddedViewer.loadCSV(file, displayName);
    } else {
      await this.embeddedViewer.loadText(file, displayName);
    }
  }

  // NTFS 时间线当前文件信息（用于视图切换）
  private currentNtfsFile: string | null = null;
  private currentNtfsDisplayName: string = '';
  private currentTreeMode: 'ntfs' | 'files' = 'ntfs';

  /**
   * 加载 NTFS 视图（根据 currentViewMode 选择表格或文件树）
   */
  private async loadNtfsView(): Promise<void> {
    const file = this.currentNtfsFile;
    if (!file) return;

    // 插入切换栏
    this.renderNtfsToggleBar();

    const isHandles = file === 'handles.csv';
    const isServices = file === 'services.csv';
    const isModules = file === 'modules.csv';
    const isDrivers = file === 'drivers.csv';
    const isProcess = file === 'process.csv';
    const isNet = file === 'net.csv';

    if (this.currentViewMode === 'tree') {
      this.ntfsTreeViewer.cleanup();
      this.handlesViewer.cleanup();
      this.servicesViewer.cleanup();
      this.modulesViewer.cleanup();
      this.driversViewer.cleanup();
      this.processViewer.cleanup();
      this.netViewer.cleanup();

      // 注入共享右键菜单宿主（复用 CSV 表格视图的完整右键菜单）
      this.ntfsTreeViewer.setContextMenuHost(this.embeddedViewer);
      this.handlesViewer.setContextMenuHost(this.embeddedViewer);
      this.servicesViewer.setContextMenuHost(this.embeddedViewer);
      this.modulesViewer.setContextMenuHost(this.embeddedViewer);
      this.driversViewer.setContextMenuHost(this.embeddedViewer);
      this.processViewer.setContextMenuHost(this.embeddedViewer);
      this.netViewer.setContextMenuHost(this.embeddedViewer);

      if (isHandles) {
        this.handlesViewer.init('memprocfs-v2-csv-viewer');
        await this.handlesViewer.load(file);
      } else if (isServices) {
        this.servicesViewer.init('memprocfs-v2-csv-viewer');
        await this.servicesViewer.load(file);
      } else if (isModules) {
        this.modulesViewer.init('memprocfs-v2-csv-viewer');
        await this.modulesViewer.load(file);
      } else if (isDrivers) {
        this.driversViewer.init('memprocfs-v2-csv-viewer');
        await this.driversViewer.load(file);
      } else if (isProcess) {
        this.processViewer.init('memprocfs-v2-csv-viewer');
        await this.processViewer.load(file);
      } else if (isNet) {
        this.netViewer.init('memprocfs-v2-csv-viewer');
        await this.netViewer.load(file);
      } else {
        this.ntfsTreeViewer.init('memprocfs-v2-csv-viewer');
        await this.ntfsTreeViewer.loadTree(file, this.currentTreeMode);
      }
    } else {
      this.ntfsTreeViewer.cleanup();
      this.handlesViewer.cleanup();
      this.servicesViewer.cleanup();
      this.modulesViewer.cleanup();
      this.driversViewer.cleanup();
      this.processViewer.cleanup();
      this.netViewer.cleanup();
      this.embeddedViewer.init('memprocfs-v2-csv-viewer', (rowCount) => {
        this.updateTabCount(this.activeTab, rowCount);
      });
      await this.embeddedViewer.loadCSV(file, this.currentNtfsDisplayName);
    }
  }

  /**
   * 渲染 NTFS 视图切换栏
   */
  private renderNtfsToggleBar(): void {
    this.removeNtfsToggleBar();

    const contentArea = document.querySelector('.memprocfs-v2-content');
    if (!contentArea) return;

    const bar = document.createElement('div');
    bar.className = 'ntfs-view-toggle-bar';
    bar.id = 'ntfs-view-toggle-bar';
    const isHandles = this.currentNtfsFile === 'handles.csv';
    const isServices = this.currentNtfsFile === 'services.csv';
    const isModules = this.currentNtfsFile === 'modules.csv';
    const isDrivers = this.currentNtfsFile === 'drivers.csv';
    const isProcess = this.currentNtfsFile === 'process.csv';
    const isNet = this.currentNtfsFile === 'net.csv';
    let treeLabel = '文件树视图';
    let treeSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    if (isHandles) { treeLabel = '句柄视图'; treeSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="8" cy="18" r="1"/></svg>'; }
    if (isServices) { treeLabel = '服务视图'; treeSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'; }
    if (isModules) { treeLabel = '模块视图'; treeSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'; }
    if (isDrivers) { treeLabel = '驱动视图'; treeSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>'; }
    if (isProcess) { treeLabel = '进程树'; treeSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="14"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="19" r="3"/><line x1="12" y1="14" x2="6" y2="16"/><line x1="12" y1="14" x2="18" y2="16"/></svg>'; }
    if (isNet) { treeLabel = '网络视图'; treeSvg = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'; }

    bar.innerHTML = `
      <div class="ntfs-view-toggle-group">
        <button class="ntfs-view-toggle-btn ${this.currentViewMode === 'csv' ? 'active' : ''}" data-view="csv">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>
          表格视图
        </button>
        <button class="ntfs-view-toggle-btn ${this.currentViewMode === 'tree' ? 'active' : ''}" data-view="tree">
          ${treeSvg}
          ${treeLabel}
        </button>
      </div>
    `;

    // 插入到 content 区域的最前面（viewer 之前）
    contentArea.insertBefore(bar, contentArea.firstChild);

    // 绑定切换事件
    bar.querySelectorAll('.ntfs-view-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view') as 'csv' | 'tree';
        if (view && view !== this.currentViewMode) {
          this.currentViewMode = view;
          this.loadNtfsView();
        }
      });
    });
  }

  /**
   * 移除 NTFS 视图切换栏
   */
  private removeNtfsToggleBar(): void {
    const existing = document.getElementById('ntfs-view-toggle-bar');
    if (existing) existing.remove();
  }

  /**
   * 加载第一个Tab
   */
  private loadFirstTab(): void {
    const firstGroup = this.tabGroups[0];
    if (firstGroup && firstGroup.tabs[0]) {
      const firstTab = firstGroup.tabs[0];
      this.loadTabData(firstTab.file, firstTab.type, firstTab.name);
    }
  }

  /**
   * 清理
   */
  public cleanup(): void {
    this.embeddedViewer.cleanup();
    this.ntfsTreeViewer.cleanup();
    this.sysInfoViewer.cleanup();
    this.activeTab = 'sysinfo';
    this.activeGroup = 'basic';
    this.currentViewMode = 'csv';
  }
}

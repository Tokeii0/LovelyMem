import { invoke } from '@tauri-apps/api/core';
import { AppState } from '../../core/types';
import { EmbeddedCSVViewer } from './EmbeddedCSVViewer';

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

type ExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'completed';

interface TabExecutionState {
  status: ExecutionStatus;
  error?: string;
  outputFile?: string;
}

export class Vol3LinuxWorkspaceV2Renderer {
  private state: AppState;
  private getAreaIcon: (config: any) => string;
  private isFilePath: (str: string) => boolean;
  private embeddedViewer: EmbeddedCSVViewer;
  private activeTab: string = 'banners';
  private activeGroup: string = 'system';

  private tabExecutionStates: Map<string, TabExecutionState> = new Map();

  // 防止事件重复绑定
  private eventsInitialized: boolean = false;

  private readonly txtPlugins = ['psaux'];

  private tabGroups: TabGroup[] = [
    {
      id: 'system',
      name: '系统信息',
      icon: 'system',
      tabs: [
        { id: 'banners', name: '内核横幅', icon: 'text', plugin: 'banners', type: 'csv' },
        { id: 'boottime', name: '启动时间', icon: 'info', plugin: 'boottime', type: 'csv' },
        { id: 'iomem', name: 'IO内存映射', icon: 'info', plugin: 'iomem', type: 'csv' },
        { id: 'vmcoreinfo', name: 'VM核心信息', icon: 'info', plugin: 'vmcoreinfo', type: 'csv' },
        { id: 'kmsg', name: '内核消息', icon: 'text', plugin: 'kmsg', type: 'csv' },
        { id: 'kallsyms', name: '内核符号表', icon: 'text', plugin: 'kallsyms', type: 'csv' },
      ],
    },
    {
      id: 'process',
      name: '进程分析',
      icon: 'process',
      tabs: [
        { id: 'pslist', name: '进程列表', icon: 'process', plugin: 'pslist', type: 'csv' },
        { id: 'pstree', name: '进程树', icon: 'tree', plugin: 'pstree', type: 'csv' },
        { id: 'psscan', name: '进程扫描', icon: 'scan', plugin: 'psscan', type: 'csv' },
        { id: 'psaux', name: '进程辅助信息', icon: 'text', plugin: 'psaux', type: 'text' },
        { id: 'proc_maps', name: '进程内存映射', icon: 'memory', plugin: 'proc_maps', type: 'csv' },
        { id: 'pscallstack', name: '进程调用栈', icon: 'text', plugin: 'pscallstack', type: 'csv' },
        { id: 'pidhashtable', name: 'PID哈希表', icon: 'text', plugin: 'pidhashtable', type: 'csv' },
        { id: 'capabilities', name: '进程权限', icon: 'security', plugin: 'capabilities', type: 'csv' },
        { id: 'ptrace', name: 'Ptrace调试', icon: 'security', plugin: 'ptrace', type: 'csv' },
      ],
    },
    {
      id: 'network',
      name: '网络分析',
      icon: 'network',
      tabs: [
        { id: 'ip_addr', name: 'IP地址', icon: 'network', plugin: 'ip_addr', type: 'csv' },
        { id: 'ip_link', name: 'IP链路', icon: 'network', plugin: 'ip_link', type: 'csv' },
        { id: 'sockstat', name: '套接字状态', icon: 'network', plugin: 'sockstat', type: 'csv' },
      ],
    },
    {
      id: 'filesystem',
      name: '文件系统',
      icon: 'filesystem',
      tabs: [
        { id: 'mountinfo', name: '挂载信息', icon: 'filesystem', plugin: 'mountinfo', type: 'csv' },
        { id: 'lsof', name: '打开文件', icon: 'filesystem', plugin: 'lsof', type: 'csv' },
        { id: 'pagecache_files', name: '页面缓存文件', icon: 'filesystem', plugin: 'pagecache_files', type: 'csv' },
        { id: 'pagecache_inodepages', name: '页面缓存Inode页面', icon: 'filesystem', plugin: 'pagecache_inodepages', type: 'csv' },
        { id: 'pagecache_recoverfs', name: '页面缓存恢复文件系统', icon: 'filesystem', plugin: 'pagecache_recoverfs', type: 'csv' },
      ],
    },
    {
      id: 'kernel',
      name: '内核分析',
      icon: 'kernel',
      tabs: [
        { id: 'elfs', name: 'ELF文件', icon: 'module', plugin: 'elfs', type: 'csv' },
        { id: 'lsmod', name: '模块列表', icon: 'module', plugin: 'lsmod', type: 'csv' },
        { id: 'kthreads', name: '内核线程', icon: 'thread', plugin: 'kthreads', type: 'csv' },
        { id: 'module_extract', name: '模块提取', icon: 'dump', plugin: 'module_extract', type: 'csv' },
        { id: 'library_list', name: '库列表', icon: 'module', plugin: 'library_list', type: 'csv' },
        { id: 'ebpf', name: 'eBPF程序', icon: 'kernel', plugin: 'ebpf', type: 'csv' },
        { id: 'ftrace', name: 'Ftrace跟踪', icon: 'kernel', plugin: 'ftrace', type: 'csv' },
        { id: 'perf_events', name: '性能事件', icon: 'kernel', plugin: 'perf_events', type: 'csv' },
        { id: 'tracepoints', name: '跟踪点', icon: 'kernel', plugin: 'tracepoints', type: 'csv' },
      ],
    },
    {
      id: 'gui',
      name: '图形输入',
      icon: 'gui',
      tabs: [
        { id: 'fbdev', name: '帧缓冲设备', icon: 'gui', plugin: 'fbdev', type: 'csv' },
      ],
    },
    {
      id: 'malware',
      name: '恶意分析',
      icon: 'security',
      tabs: [
        { id: 'malware_check_afinfo', name: '检查地址族', icon: 'security', plugin: 'malware_check_afinfo', type: 'csv' },
        { id: 'malware_check_creds', name: '检查凭据', icon: 'security', plugin: 'malware_check_creds', type: 'csv' },
        { id: 'malware_check_idt', name: '检查IDT', icon: 'security', plugin: 'malware_check_idt', type: 'csv' },
        { id: 'malware_check_syscall', name: '检查系统调用', icon: 'security', plugin: 'malware_check_syscall', type: 'csv' },
        { id: 'malware_check_modules', name: '检查模块', icon: 'security', plugin: 'malware_check_modules', type: 'csv' },
        { id: 'malware_hidden_modules', name: '隐藏模块', icon: 'security', plugin: 'malware_hidden_modules', type: 'csv' },
        { id: 'malware_keyboard_notifiers', name: '键盘通知器', icon: 'security', plugin: 'malware_keyboard_notifiers', type: 'csv' },
        { id: 'malware_malfind', name: 'Malfind', icon: 'security', plugin: 'malware_malfind', type: 'csv' },
        { id: 'malware_modxview', name: '模块查看器', icon: 'security', plugin: 'malware_modxview', type: 'csv' },
        { id: 'malware_netfilter', name: 'Netfilter', icon: 'security', plugin: 'malware_netfilter', type: 'csv' },
        { id: 'malware_tty_check', name: 'TTY检查', icon: 'security', plugin: 'malware_tty_check', type: 'csv' },
      ],
    },
  ];

  // 简洁内联SVG图标（替换 emoji）
  private readonly icons: Record<string, string> = {
    system: '<svg viewBox="0 0 48 48"><path d="M8 10h32a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 18h20M14 26h20M14 34h14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    process: '<svg viewBox="0 0 48 48"><path d="M6 14h36v20H6z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 22h20M14 30h14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    memory: '<svg viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><path d="M8 18h32M8 30h32M18 8v32M30 8v32" stroke="currentColor" stroke-width="4"/></svg>',
    network: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M6 24h36M24 6v36" stroke="currentColor" stroke-width="4"/></svg>',
    filesystem: '<svg viewBox="0 0 48 48"><path d="M8 14h14l4 4h14v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
    security: '<svg viewBox="0 0 48 48"><path d="M24 6l14 6v12c0 12-10 18-14 18S10 36 10 24V12l14-6z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M16 24l5 5 11-11" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    kernel: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 10v28M10 24h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    gui: '<svg viewBox="0 0 48 48"><rect x="6" y="10" width="36" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="4"/><path d="M6 16h36" stroke="currentColor" stroke-width="4"/></svg>',
    info: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 22v12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M24 14h.01" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>',
    scan: '<svg viewBox="0 0 48 48"><path d="M10 18V10h8M38 18V10h-8M10 30v8h8M38 30v8h-8" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M14 24h20" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    tree: '<svg viewBox="0 0 48 48"><circle cx="24" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="14" cy="26" r="4" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="34" cy="26" r="4" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 16v6M24 22l-10 4M24 22l10 4" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/></svg>',
    thread: '<svg viewBox="0 0 48 48"><path d="M10 24h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="24" r="3" fill="currentColor"/><circle cx="24" cy="24" r="3" fill="currentColor"/><circle cx="32" cy="24" r="3" fill="currentColor"/></svg>',
    module: '<svg viewBox="0 0 48 48"><path d="M10 14h12v12H10zM26 14h12v12H26zM10 28h12v12H10zM26 28h12v12H26z" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
    text: '<svg viewBox="0 0 48 48"><path d="M12 10h24v28H12z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M18 18h12M18 26h12M18 34h8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    dump: '<svg viewBox="0 0 48 48"><path d="M10 18h28v20H10z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M16 18v-6h16v6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 24v10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M20 30l4 4 4-4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    default: '<svg viewBox="0 0 48 48"><path d="M24 6l18 36H6L24 6z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 18v12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M24 34h.01" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>',
  };

  private readonly uiIcons = {
    spinner: '<span class="status-spinner"></span>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    cross: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l10 20H2L12 2z"/><path d="M12 9v5"/><path d="M12 17h.01"/></svg>',
  };

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

  private getIcon(key: string): string {
    return this.icons[key] || this.icons.default;
  }

  private isTxtPlugin(plugin: string): boolean {
    return this.txtPlugins.includes(plugin);
  }

  private getOutputFileName(plugin: string): string {
    const ext = this.isTxtPlugin(plugin) ? 'txt' : 'csv';
    return `vol3linux_${plugin}.${ext}`;
  }

  private async checkFileExists(filePath: string): Promise<boolean> {
    try {
      await invoke('read_file', { path: filePath });
      return true;
    } catch {
      return false;
    }
  }

  public render(): string {
    // render() 会生成全新 DOM，必须重新绑定事件
    this.eventsInitialized = false;

    const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup) || this.tabGroups[0];

    return `
      <div class="vol3-v2-workspace">
        <div class="vol3-v2-group-bar" style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div class="vol3linux-v2-group-left" style="display: flex; gap: 10px; align-items: center;">
          ${this.tabGroups.map(group => `
            <button class="vol3-v2-group-btn ${group.id === this.activeGroup ? 'active' : ''}"
                    data-group="${group.id}">
              <span class="group-icon" style="display:inline-flex; width:18px; height:18px;">${this.getIcon(group.icon)}</span>
              <span class="group-name">${group.name}</span>
            </button>
          `).join('')}
          </div>

          <div class="config-section" style="display:flex; gap:12px; align-items:center; justify-content:flex-end;">
            <label class="config-checkbox" style="margin: 0; display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="vol3linux-proxy" checked> 使用远程符号表
            </label>
            <input type="text" class="config-input" id="vol3linux-proxy-url" placeholder="这里填代理地址，例如http://127.0.0.1:7890" style="width: 260px;">
          </div>
        </div>

        <div class="vol3-v2-tabs-bar">
          <div class="vol3-v2-tabs" id="vol3linux-v2-tabs">
            ${currentGroup.tabs.map(tab => {
              const execState = this.tabExecutionStates.get(tab.id);
              const statusClass = execState?.status || 'idle';
              return `
              <button class="vol3-v2-tab ${tab.id === this.activeTab ? 'active' : ''} ${statusClass}"
                      data-tab="${tab.id}"
                      data-plugin="${tab.plugin}"
                      data-type="${tab.type}">
                <span class="tab-icon" style="display:inline-flex; width:18px; height:18px;">${this.getIcon(tab.icon)}</span>
                <span class="tab-name">${tab.name}</span>
                <span class="tab-count" id="tab-count-${tab.id}"></span>
                <span class="tab-status" id="tab-status-${tab.id}">
                  ${this.renderTabStatus(execState)}
                </span>
              </button>
            `;
            }).join('')}
          </div>
        </div>

        <div class="vol3-v2-content">
          <div class="vol3-v2-csv-viewer animate-enter" id="vol3linux-v2-csv-viewer">
            <div class="embedded-csv-empty">
              <div class="embedded-csv-empty-icon" style="display:inline-flex; width:36px; height:36px;">${this.getIcon('process')}</div>
              <div class="embedded-csv-empty-title">点击Tab标签执行分析</div>
              <div class="embedded-csv-empty-message">选择上方的功能标签，系统将自动执行 Vol3 Linux 并显示结果</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderTabStatus(state?: TabExecutionState): string {
    if (!state) return '';
    switch (state.status) {
      case 'running':
        return this.uiIcons.spinner;
      case 'success':
      case 'completed':
        return `<span class="status-check">${this.uiIcons.check}</span>`;
      case 'error':
        return `<span class="status-error">${this.uiIcons.cross}</span>`;
      default:
        return '';
    }
  }

  public initEvents(): void {
    if (this.eventsInitialized) {
      this.checkExistingFiles();
      this.loadFirstTab();
      return;
    }
    this.eventsInitialized = true;

    this.embeddedViewer.init('vol3linux-v2-csv-viewer', (rowCount) => {
      this.updateTabCount(this.activeTab, rowCount);
    });

    document.querySelectorAll('.vol3-v2-group-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = (btn as HTMLElement).getAttribute('data-group');
        if (groupId && groupId !== this.activeGroup) {
          this.switchGroup(groupId);
        }
      });
    });

    this.bindTabEvents();
    this.checkExistingFiles();
    this.loadFirstTab();
  }

  private bindTabEvents(): void {
    const tabsContainer = document.getElementById('vol3linux-v2-tabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', async (e) => {
      const tab = (e.target as HTMLElement).closest('.vol3-v2-tab');
      if (!tab) return;

      const tabId = tab.getAttribute('data-tab');
      const plugin = tab.getAttribute('data-plugin');
      const type = tab.getAttribute('data-type') as 'csv' | 'text';
      if (tabId && plugin) {
        await this.switchTab(tabId, plugin, type);
      }
    });
  }

  private updateTabCount(tabId: string, rowCount: number): void {
    const countEl = document.getElementById(`tab-count-${tabId}`);
    if (countEl) {
      countEl.textContent = rowCount.toLocaleString();
      (countEl as HTMLElement).style.display = 'inline-flex';
    }
  }

  private loadFirstTab(): void {
    const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup);
    if (currentGroup && currentGroup.tabs.length > 0) {
      const firstTab = currentGroup.tabs[0];
      this.switchTab(firstTab.id, firstTab.plugin, firstTab.type);
    }
  }

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
          this.tabExecutionStates.set(tab.id, { status: 'completed', outputFile: filePath });
        }
      }

      this.updateTabStatusUI();
    } catch {
      return;
    }
  }

  private updateTabStatusUI(): void {
    this.tabExecutionStates.forEach((state, tabId) => {
      const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
      if (!tabBtn) return;

      tabBtn.classList.remove('idle', 'running', 'success', 'error', 'completed');
      tabBtn.classList.add(state.status);

      const statusEl = document.getElementById(`tab-status-${tabId}`);
      if (statusEl) {
        statusEl.innerHTML = this.renderTabStatus(state);
      }
    });
  }

  private switchGroup(groupId: string): void {
    this.activeGroup = groupId;
    const group = this.tabGroups.find(g => g.id === groupId);
    if (!group) return;

    document.querySelectorAll('.vol3-v2-group-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-group') === groupId);
    });

    const tabsContainer = document.getElementById('vol3linux-v2-tabs');
    if (!tabsContainer) return;

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
    this.checkExistingFiles();

    const firstTab = group.tabs[0];
    if (firstTab) {
      this.switchTab(firstTab.id, firstTab.plugin, firstTab.type);
    }
  }

  private async switchTab(tabId: string, plugin: string, type: 'csv' | 'text'): Promise<void> {
    this.activeTab = tabId;

    document.querySelectorAll('.vol3-v2-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    const viewerContainer = document.getElementById('vol3linux-v2-csv-viewer');
    if (viewerContainer) {
      viewerContainer.classList.remove('animate-enter');
      void (viewerContainer as HTMLElement).offsetWidth;
      viewerContainer.classList.add('animate-enter');
    }

    const settings = await invoke('load_settings_command') as {
      output_path?: string;
      python3_path?: string;
      volatility3_path?: string;
    };

    const outputPath = settings.output_path || 'output';
    const fileName = this.getOutputFileName(plugin);
    const filePath = `${outputPath}\\${fileName}`;

    if (await this.checkFileExists(filePath)) {
      this.tabExecutionStates.set(tabId, { status: 'completed', outputFile: filePath });
      this.updateTabStatusUI();
      await this.loadTabData(fileName, type, this.getTabDisplayName(tabId));
      return;
    }

    await this.executeAndLoadTab(tabId, plugin, type, settings, outputPath);
  }

  private getTabDisplayName(tabId: string): string {
    for (const group of this.tabGroups) {
      const tab = group.tabs.find(t => t.id === tabId);
      if (tab) return tab.name;
    }
    return tabId;
  }

  private async executeAndLoadTab(
    tabId: string,
    plugin: string,
    type: 'csv' | 'text',
    settings: any,
    outputPath: string
  ): Promise<void> {
    const executingTabId = tabId;

    if (!this.state.currentImage) {
      this.showError('请先加载内存镜像文件');
      return;
    }

    if (!settings.python3_path || !settings.volatility3_path) {
      this.showError('请先在设置中配置Python3和Volatility3路径');
      return;
    }

    this.tabExecutionStates.set(tabId, { status: 'running' });
    this.updateTabStatusUI();
    this.showExecuting(plugin);

    const remoteSymbolsCheckbox = document.getElementById('vol3linux-proxy') as HTMLInputElement | null;
    const useProxy = remoteSymbolsCheckbox?.checked ?? true;

    const proxyUrlInput = document.getElementById('vol3linux-proxy-url') as HTMLInputElement | null;
    const proxyUrlValue = (proxyUrlInput?.value || '').trim();
    const proxyUrl = useProxy && proxyUrlValue ? proxyUrlValue : null;

    try {
      const result = await invoke('execute_vol3linux', {
        pythonPath: settings.python3_path,
        volatility3Path: settings.volatility3_path,
        imagePath: this.state.currentImage.path,
        plugin: plugin,
        offline: false,
        useProxy: useProxy,
        proxyUrl: proxyUrl,
        outputDir: outputPath,
      }) as { success: boolean; output_file?: string; message?: string; stderr?: string };

      if (result.success) {
        this.tabExecutionStates.set(executingTabId, { status: 'completed', outputFile: result.output_file });
        this.updateTabStatusUI();

        if (this.activeTab === executingTabId) {
          const outFileName = this.getOutputFileName(plugin);
          await this.loadTabData(outFileName, type, this.getTabDisplayName(executingTabId));
        }
      } else {
        const errorMsg = result.message || '执行 Vol3 Linux 命令失败';
        const errorDetails = result.stderr || '';
        this.tabExecutionStates.set(executingTabId, { status: 'error', error: errorMsg });
        this.updateTabStatusUI();
        if (this.activeTab === executingTabId) {
          this.showError(errorMsg, errorDetails);
        }
      }
    } catch (error) {
      this.tabExecutionStates.set(executingTabId, { status: 'error', error: String(error) });
      this.updateTabStatusUI();
      if (this.activeTab === executingTabId) {
        this.showError(String(error));
      }
    }
  }

  private showExecuting(plugin: string): void {
    const viewer = document.getElementById('vol3linux-v2-csv-viewer');
    if (viewer) {
      viewer.innerHTML = `
        <div class="vol3-v2-executing">
          <div class="vol3-v2-spinner"></div>
          <div class="vol3-v2-executing-title">正在执行 ${plugin}</div>
          <div class="vol3-v2-executing-message">请稍候，Vol3 Linux 正在分析内存镜像...</div>
        </div>
      `;
    }
  }

  private showError(message: string, details?: string): void {
    const viewer = document.getElementById('vol3linux-v2-csv-viewer');
    if (!viewer) return;

    const detailsHtml = details
      ? `
        <div class="embedded-csv-error-details">
          <div class="embedded-csv-error-details-title">错误详情</div>
          <pre class="embedded-csv-error-details-content">${this.escapeHtml(details)}</pre>
        </div>
      `
      : '';

    viewer.innerHTML = `
        <div class="embedded-csv-error">
          <div class="embedded-csv-error-icon" style="display:inline-flex; width:22px; height:22px;">${this.uiIcons.warning}</div>
          <div class="embedded-csv-error-title">执行失败</div>
          <div class="embedded-csv-error-message">${this.escapeHtml(message)}</div>
          ${detailsHtml}
          <button class="embedded-csv-retry-btn" id="vol3linux-v2-retry">重试</button>
        </div>
      `;

    document.getElementById('vol3linux-v2-retry')?.addEventListener('click', () => {
      const activeTabEl = document.querySelector('.vol3-v2-tab.active');
      if (!activeTabEl) return;

      const tabId = activeTabEl.getAttribute('data-tab');
      const plugin = activeTabEl.getAttribute('data-plugin');
      const type = activeTabEl.getAttribute('data-type') as 'csv' | 'text';

      if (tabId && plugin) {
        this.tabExecutionStates.delete(tabId);
        this.switchTab(tabId, plugin, type);
      }
    });
  }

  private async loadTabData(file: string, type: 'csv' | 'text', displayName: string): Promise<void> {
    if (type === 'csv') {
      await this.embeddedViewer.loadCSV(file, displayName);
    } else {
      await this.embeddedViewer.loadText(file, displayName);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public cleanup(): void {
    this.embeddedViewer.cleanup();
    this.tabExecutionStates.clear();
    this.activeTab = 'banners';
    this.activeGroup = 'system';
  }
}

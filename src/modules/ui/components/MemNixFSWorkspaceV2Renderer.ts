/**
 * MemNixFS V2 工作区渲染器
 *
 * 内嵌 CSV/文本查看器展示 Linux 内存取证产物。一级分类 = 顶部分组，二级分类 = 组内 Tab。
 * 数据来源：后端把 M:\forensic、M:\sys、M:\fs 下的取证文件复制到 output（保留相对结构，带进度），
 * 本面板从 output 直接读取。复制由本面板首次访问时触发（幂等），并显示进度条。
 *
 * 复用 vol3-v2-* 的 CSS 样式，容器/按钮使用 memnixfs-v2-* 以避免与其它 V2 面板冲突。
 */
import { invoke } from '@tauri-apps/api/core';
import { AppState } from '../../core/types';
import { EmbeddedCSVViewer } from './EmbeddedCSVViewer';
import { getMountRoot } from '../../core/mountDrive';

interface TabItem {
  id: string;
  name: string;
  icon: string;
  /** output 目录下的相对文件名（如 'forensic\\timeline\\all.csv' 或 'sys\\findevil\\triage.txt'） */
  file: string;
  type: 'csv' | 'text';
}

interface TabGroup {
  id: string;
  name: string;
  icon: string;
  tabs: TabItem[];
}

export class MemNixFSWorkspaceV2Renderer {
  private state: AppState;
  private getAreaIcon: (config: any) => string;
  private isFilePath: (str: string) => boolean;
  private embeddedViewer: EmbeddedCSVViewer;
  private activeTab: string = 'tl_all';
  private activeGroup: string = 'forensic';
  private eventsInitialized: boolean = false;

  // 取证文件复制状态（幂等，仅复制一次）
  private copied: boolean = false;
  private copyPromise: Promise<void> | null = null;

  // 一级分类（分组）→ 二级分类（Tab）
  private tabGroups: TabGroup[] = [
    {
      id: 'forensic',
      name: '取证时间线',
      icon: 'timeline',
      tabs: [
        { id: 'tl_all', name: '综合时间线', icon: 'timeline', file: 'forensic\\timeline\\all.csv', type: 'csv' },
        { id: 'tl_process', name: '进程时间线', icon: 'process', file: 'forensic\\timeline\\process.csv', type: 'csv' },
        { id: 'tl_network', name: '网络时间线', icon: 'network', file: 'forensic\\timeline\\network.csv', type: 'csv' },
        { id: 'tl_kernel', name: '内核时间线', icon: 'kernel', file: 'forensic\\timeline\\kernel.csv', type: 'csv' },
        { id: 'tl_findevil', name: '恶意时间线', icon: 'security', file: 'forensic\\timeline\\findevil.csv', type: 'csv' },
        { id: 'tl_shell', name: 'Shell历史', icon: 'text', file: 'forensic\\timeline\\shell.csv', type: 'csv' },
        { id: 'tl_summary', name: '时间线摘要', icon: 'text', file: 'forensic\\timeline_summary.txt', type: 'text' },
        { id: 'tl_snapshot', name: '系统快照', icon: 'system', file: 'forensic\\snapshot.txt', type: 'text' },
      ],
    },
    {
      id: 'process',
      name: '进程',
      icon: 'process',
      tabs: [
        { id: 'ps_list', name: '进程列表', icon: 'process', file: 'sys\\processes\\pslist.csv', type: 'csv' },
        { id: 'ps_tree', name: '进程树', icon: 'tree', file: 'sys\\processes\\pstree.txt', type: 'text' },
        { id: 'ps_aux', name: '进程详情', icon: 'text', file: 'sys\\processes\\psaux.txt', type: 'text' },
        { id: 'ps_threads', name: '线程', icon: 'thread', file: 'sys\\processes\\threads.txt', type: 'text' },
        { id: 'ps_pidhash', name: 'PID哈希表', icon: 'text', file: 'sys\\pidhashtable', type: 'text' },
      ],
    },
    {
      id: 'network',
      name: '网络',
      icon: 'network',
      tabs: [
        { id: 'net_tcp', name: 'TCP连接', icon: 'network', file: 'sys\\net\\tcp.csv', type: 'csv' },
        { id: 'net_udp', name: 'UDP连接', icon: 'network', file: 'sys\\net\\udp.csv', type: 'csv' },
        { id: 'net_listen', name: '监听端口', icon: 'network', file: 'sys\\net\\listening', type: 'text' },
        { id: 'net_summary', name: '连接概览', icon: 'text', file: 'sys\\net\\summary.txt', type: 'text' },
        { id: 'net_arp', name: 'ARP表', icon: 'network', file: 'sys\\net\\arp', type: 'text' },
        { id: 'net_routes', name: '路由表', icon: 'network', file: 'sys\\net\\routes', type: 'text' },
        { id: 'net_iface', name: '网络接口', icon: 'network', file: 'sys\\net\\interfaces', type: 'text' },
        { id: 'net_unix', name: 'Unix套接字', icon: 'network', file: 'sys\\net\\unix', type: 'text' },
        { id: 'net_netfilter', name: 'Netfilter', icon: 'security', file: 'sys\\net\\netfilter', type: 'text' },
        { id: 'net_dns', name: 'DNS', icon: 'network', file: 'sys\\dns.txt', type: 'text' },
      ],
    },
    {
      id: 'findevil',
      name: '威胁检测',
      icon: 'security',
      tabs: [
        { id: 'fe_triage', name: '分诊报告', icon: 'security', file: 'sys\\findevil\\triage.txt', type: 'text' },
        { id: 'fe_indicators', name: '威胁指标', icon: 'security', file: 'sys\\findevil\\indicators.csv', type: 'csv' },
        { id: 'fe_malfind', name: 'Malfind', icon: 'security', file: 'sys\\findevil\\malfind.csv', type: 'csv' },
        { id: 'fe_psscan', name: '隐藏进程', icon: 'security', file: 'sys\\findevil\\psscan.txt', type: 'text' },
        { id: 'fe_hidmod', name: '隐藏模块', icon: 'security', file: 'sys\\findevil\\hidden_modules.txt', type: 'text' },
        { id: 'fe_syscall', name: '系统调用挂钩', icon: 'security', file: 'sys\\findevil\\check_syscall.txt', type: 'text' },
        { id: 'fe_creds', name: '凭据检查', icon: 'security', file: 'sys\\findevil\\check_creds.txt', type: 'text' },
        { id: 'fe_idt', name: 'IDT检查', icon: 'security', file: 'sys\\findevil\\check_idt.txt', type: 'text' },
        { id: 'fe_modules', name: '模块检查', icon: 'security', file: 'sys\\findevil\\check_modules.txt', type: 'text' },
        { id: 'fe_afinfo', name: 'AFInfo检查', icon: 'security', file: 'sys\\findevil\\check_afinfo.txt', type: 'text' },
        { id: 'fe_ebpf', name: 'eBPF', icon: 'kernel', file: 'sys\\findevil\\ebpf.txt', type: 'text' },
        { id: 'fe_kprobes', name: 'kprobes', icon: 'kernel', file: 'sys\\findevil\\kprobes.txt', type: 'text' },
        { id: 'fe_tracepoints', name: 'Tracepoints', icon: 'kernel', file: 'sys\\findevil\\tracepoints.txt', type: 'text' },
        { id: 'fe_tty', name: 'TTY检查', icon: 'security', file: 'sys\\findevil\\tty_check.txt', type: 'text' },
        { id: 'fe_kbd', name: '键盘通知', icon: 'security', file: 'sys\\findevil\\keyboard_notifiers.txt', type: 'text' },
        { id: 'fe_modxview', name: 'ModXView', icon: 'security', file: 'sys\\findevil\\modxview.txt', type: 'text' },
        { id: 'fe_avedr', name: 'AV/EDR', icon: 'security', file: 'sys\\findevil\\av_edr.txt', type: 'text' },
        { id: 'fe_entropy', name: '熵分析', icon: 'security', file: 'sys\\findevil\\entropy.txt', type: 'text' },
      ],
    },
    {
      id: 'kernel',
      name: '内核 & 模块',
      icon: 'kernel',
      tabs: [
        { id: 'k_kallsyms', name: '内核符号', icon: 'kernel', file: 'sys\\kallsyms', type: 'text' },
        { id: 'k_modules', name: '内核模块', icon: 'module', file: 'sys\\modules\\modules.txt', type: 'text' },
        { id: 'k_dmesg', name: '内核日志(dmesg)', icon: 'text', file: 'sys\\dmesg', type: 'text' },
        { id: 'k_iomem', name: 'IO内存', icon: 'memory', file: 'sys\\iomem', type: 'text' },
        { id: 'k_meminfo', name: '内存信息', icon: 'memory', file: 'sys\\meminfo', type: 'text' },
        { id: 'k_cpuinfo', name: 'CPU信息', icon: 'system', file: 'sys\\cpuinfo', type: 'text' },
        { id: 'k_banner', name: '内核版本', icon: 'kernel', file: 'sys\\banner.txt', type: 'text' },
        { id: 'k_btf', name: 'BTF', icon: 'kernel', file: 'sys\\btf.txt', type: 'text' },
        { id: 'k_dtb', name: 'DTB', icon: 'kernel', file: 'sys\\dtb.txt', type: 'text' },
        { id: 'k_memranges', name: '内存范围', icon: 'memory', file: 'sys\\mem_ranges.txt', type: 'text' },
      ],
    },
    {
      id: 'sysinfo',
      name: '系统信息',
      icon: 'system',
      tabs: [
        { id: 'si_hostname', name: '主机名', icon: 'system', file: 'sys\\hostname', type: 'text' },
        { id: 'si_users', name: '用户', icon: 'account', file: 'sys\\users.txt', type: 'text' },
        { id: 'si_boottime', name: '启动时间', icon: 'timeline', file: 'sys\\boottime', type: 'text' },
        { id: 'si_uptime', name: '运行时间', icon: 'timeline', file: 'sys\\uptime', type: 'text' },
        { id: 'si_mounts', name: '挂载点', icon: 'filesystem', file: 'sys\\mounts', type: 'text' },
        { id: 'si_mountinfo', name: '挂载信息', icon: 'filesystem', file: 'sys\\mountinfo', type: 'text' },
        { id: 'si_shell', name: 'Shell历史', icon: 'text', file: 'sys\\shell_history.txt', type: 'text' },
      ],
    },
    {
      id: 'logs',
      name: '日志 & 崩溃',
      icon: 'log',
      tabs: [
        { id: 'lg_journald', name: 'Journald', icon: 'log', file: 'sys\\journal\\journald.txt', type: 'text' },
        { id: 'lg_textlogs', name: '文本日志', icon: 'log', file: 'sys\\journal\\text_logs.txt', type: 'text' },
        { id: 'lg_index', name: '日志索引', icon: 'log', file: 'sys\\journal\\index.txt', type: 'text' },
        { id: 'cr_summary', name: '崩溃摘要', icon: 'security', file: 'sys\\crash\\summary.txt', type: 'text' },
        { id: 'cr_traces', name: '调用栈', icon: 'text', file: 'sys\\crash\\call_traces.txt', type: 'text' },
        { id: 'cr_events', name: '崩溃事件', icon: 'security', file: 'sys\\crash\\events.txt', type: 'text' },
      ],
    },
    {
      id: 'pagecache',
      name: '页缓存恢复',
      icon: 'filesystem',
      tabs: [
        { id: 'pc_index', name: '缓存索引', icon: 'filesystem', file: 'sys\\pagecache\\index.txt', type: 'text' },
        { id: 'pc_recovery', name: '文件恢复', icon: 'filesystem', file: 'sys\\pagecache\\recovery.txt', type: 'text' },
        { id: 'pc_quality', name: '路径质量', icon: 'filesystem', file: 'sys\\pagecache\\path_quality.txt', type: 'text' },
      ],
    },
    {
      id: 'incident',
      name: '应急响应',
      icon: 'security',
      tabs: [
        { id: 'ir_rclocal', name: 'rc.local', icon: 'security', file: 'fs\\etc\\rc.local', type: 'text' },
        { id: 'ir_preload', name: 'ld.so.preload', icon: 'security', file: 'fs\\etc\\ld.so.preload', type: 'text' },
        { id: 'ir_ldconf', name: 'ld.so.conf', icon: 'text', file: 'fs\\etc\\ld.so.conf', type: 'text' },
        { id: 'ir_profile', name: '/etc/profile', icon: 'text', file: 'fs\\etc\\profile', type: 'text' },
        { id: 'ir_bashbashrc', name: 'bash.bashrc', icon: 'text', file: 'fs\\etc\\bash.bashrc', type: 'text' },
        { id: 'ir_environment', name: 'environment', icon: 'text', file: 'fs\\etc\\environment', type: 'text' },
        { id: 'ir_modules', name: '/etc/modules', icon: 'module', file: 'fs\\etc\\modules', type: 'text' },
        { id: 'ir_hostsallow', name: 'hosts.allow', icon: 'network', file: 'fs\\etc\\hosts.allow', type: 'text' },
        { id: 'ir_hostsdeny', name: 'hosts.deny', icon: 'network', file: 'fs\\etc\\hosts.deny', type: 'text' },
        { id: 'ir_nsswitch', name: 'nsswitch.conf', icon: 'text', file: 'fs\\etc\\nsswitch.conf', type: 'text' },
        { id: 'ir_pamsshd', name: 'pam.d/sshd', icon: 'security', file: 'fs\\etc\\pam.d\\sshd', type: 'text' },
        { id: 'ir_pamauth', name: 'pam.d/common-auth', icon: 'security', file: 'fs\\etc\\pam.d\\common-auth', type: 'text' },
        { id: 'ir_sudoers', name: 'sudoers', icon: 'security', file: 'fs\\etc\\sudoers', type: 'text' },
        { id: 'ir_rootbashrc', name: 'root/.bashrc', icon: 'text', file: 'fs\\root\\.bashrc', type: 'text' },
        { id: 'ir_rootprofile', name: 'root/.profile', icon: 'text', file: 'fs\\root\\.profile', type: 'text' },
        { id: 'ir_rootauthkeys', name: 'root authorized_keys', icon: 'security', file: 'fs\\root\\.ssh\\authorized_keys', type: 'text' },
      ],
    },
    {
      id: 'linux-files',
      name: 'Linux 文件',
      icon: 'account',
      tabs: [
        { id: 'lf_passwd', name: 'passwd', icon: 'account', file: 'fs\\etc\\passwd', type: 'text' },
        { id: 'lf_shadow', name: 'shadow', icon: 'security', file: 'fs\\etc\\shadow', type: 'text' },
        { id: 'lf_group', name: 'group', icon: 'account', file: 'fs\\etc\\group', type: 'text' },
        { id: 'lf_sudoers', name: 'sudoers', icon: 'security', file: 'fs\\etc\\sudoers', type: 'text' },
        { id: 'lf_hostname', name: 'hostname', icon: 'system', file: 'fs\\etc\\hostname', type: 'text' },
        { id: 'lf_hosts', name: 'hosts', icon: 'network', file: 'fs\\etc\\hosts', type: 'text' },
        { id: 'lf_osrelease', name: 'os-release', icon: 'system', file: 'fs\\etc\\os-release', type: 'text' },
        { id: 'lf_crontab', name: 'crontab', icon: 'timeline', file: 'fs\\etc\\crontab', type: 'text' },
        { id: 'lf_sshd', name: 'sshd_config', icon: 'network', file: 'fs\\etc\\ssh\\sshd_config', type: 'text' },
        { id: 'lf_authlog', name: 'auth.log', icon: 'log', file: 'fs\\var\\log\\auth.log', type: 'text' },
        { id: 'lf_syslog', name: 'syslog', icon: 'log', file: 'fs\\var\\log\\syslog', type: 'text' },
        { id: 'lf_kernlog', name: 'kern.log', icon: 'log', file: 'fs\\var\\log\\kern.log', type: 'text' },
        { id: 'lf_dpkglog', name: 'dpkg.log', icon: 'log', file: 'fs\\var\\log\\dpkg.log', type: 'text' },
        { id: 'lf_bashroot', name: 'root历史', icon: 'text', file: 'fs\\root\\.bash_history', type: 'text' },
      ],
    },
  ];

  private readonly icons: Record<string, string> = {
    timeline: '<svg viewBox="0 0 48 48"><path d="M6 24h36" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="14" cy="24" r="4" fill="currentColor"/><circle cx="24" cy="24" r="4" fill="currentColor"/><circle cx="34" cy="24" r="4" fill="currentColor"/></svg>',
    security: '<svg viewBox="0 0 48 48"><path d="M24 6l14 6v12c0 12-10 18-14 18S10 36 10 24V12l14-6z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M16 24l5 5 11-11" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    process: '<svg viewBox="0 0 48 48"><path d="M6 14h36v20H6z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 22h20M14 30h14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    network: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M6 24h36M24 6v36" stroke="currentColor" stroke-width="4"/></svg>',
    kernel: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 10v28M10 24h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    filesystem: '<svg viewBox="0 0 48 48"><path d="M8 14h14l4 4h14v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
    text: '<svg viewBox="0 0 48 48"><path d="M12 10h24v28H12z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M18 18h12M18 26h12M18 34h8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    system: '<svg viewBox="0 0 48 48"><path d="M8 10h32a2 2 0 0 1 2 2v24a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 18h20M14 26h20M14 34h14" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    log: '<svg viewBox="0 0 48 48"><path d="M10 8h20l8 8v24H10z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M16 22h16M16 30h16" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    account: '<svg viewBox="0 0 48 48"><circle cx="24" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M10 40c0-8 6-12 14-12s14 4 14 12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
    memory: '<svg viewBox="0 0 48 48"><rect x="8" y="8" width="32" height="32" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><path d="M8 18h32M8 30h32M18 8v32M30 8v32" stroke="currentColor" stroke-width="4"/></svg>',
    module: '<svg viewBox="0 0 48 48"><path d="M10 14h12v12H10zM26 14h12v12H26zM10 28h12v12H10zM26 28h12v12H26z" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
    tree: '<svg viewBox="0 0 48 48"><circle cx="24" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="14" cy="26" r="4" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="34" cy="26" r="4" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 16v6M24 22l-10 4M24 22l10 4" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/></svg>',
    thread: '<svg viewBox="0 0 48 48"><path d="M10 24h28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="16" cy="24" r="3" fill="currentColor"/><circle cx="24" cy="24" r="3" fill="currentColor"/><circle cx="32" cy="24" r="3" fill="currentColor"/></svg>',
    default: '<svg viewBox="0 0 48 48"><path d="M24 6l18 36H6L24 6z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 18v12" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
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

  public render(): string {
    this.eventsInitialized = false;
    const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup) || this.tabGroups[0];

    return `
      <div class="vol3-v2-workspace memnixfs-v2-workspace">
        <style>
          #memnixfs-v2-tabs { display:flex; flex-wrap:nowrap; overflow-x:auto; overflow-y:hidden; gap:6px; scrollbar-width:thin; }
          #memnixfs-v2-tabs::-webkit-scrollbar { height:6px; }
          #memnixfs-v2-tabs::-webkit-scrollbar-thumb { background:rgba(139,92,246,0.5); border-radius:3px; }
          #memnixfs-v2-tabs::-webkit-scrollbar-track { background:transparent; }
          #memnixfs-v2-tabs .vol3-v2-tab { flex:0 0 auto; white-space:nowrap; }
          .memnixfs-v2-workspace .vol3-v2-group-bar { row-gap:8px; }
        </style>
        <div class="vol3-v2-group-bar" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; flex:1;">
          ${this.tabGroups.map(group => `
            <button class="vol3-v2-group-btn memnixfs-v2-group-btn ${group.id === this.activeGroup ? 'active' : ''}" data-group="${group.id}">
              <span class="group-icon" style="display:inline-flex; width:18px; height:18px;">${this.getIcon(group.icon)}</span>
              <span class="group-name">${group.name}</span>
            </button>
          `).join('')}
          </div>
          <button class="vol3-v2-group-btn" id="memnixfs-v2-export" title="把取证文件复制到 output 目录（持久化离线留存，可能较慢）" style="white-space:nowrap;">
            <span class="group-icon" style="display:inline-flex; width:16px; height:16px;">${this.getIcon('filesystem')}</span>
            <span class="group-name">导出到 output</span>
          </button>
        </div>

        <div class="vol3-v2-tabs-bar">
          <div class="vol3-v2-tabs" id="memnixfs-v2-tabs">
            ${currentGroup.tabs.map(tab => `
              <button class="vol3-v2-tab memnixfs-v2-tab ${tab.id === this.activeTab ? 'active' : ''}"
                      data-tab="${tab.id}" data-file="${tab.file}" data-type="${tab.type}">
                <span class="tab-icon" style="display:inline-flex; width:18px; height:18px;">${this.getIcon(tab.icon)}</span>
                <span class="tab-name">${tab.name}</span>
                <span class="tab-count" id="memnixfs-tab-count-${tab.id}"></span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="vol3-v2-content">
          <div class="vol3-v2-csv-viewer animate-enter" id="memnixfs-v2-csv-viewer">
            <div class="embedded-csv-empty">
              <div class="embedded-csv-empty-icon" style="display:inline-flex; width:36px; height:36px;">${this.getIcon('timeline')}</div>
              <div class="embedded-csv-empty-title">点击 Tab 查看 Linux 取证数据</div>
              <div class="embedded-csv-empty-message">数据来自 MemNixFS 挂载盘，首次访问会自动复制取证文件到 output</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  public initEvents(): void {
    if (this.eventsInitialized) {
      this.loadFirstTab();
      return;
    }
    this.eventsInitialized = true;

    this.embeddedViewer.init('memnixfs-v2-csv-viewer', (rowCount) => {
      this.updateTabCount(this.activeTab, rowCount);
    });

    document.querySelectorAll('.memnixfs-v2-group-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = (btn as HTMLElement).getAttribute('data-group');
        if (groupId && groupId !== this.activeGroup) {
          this.switchGroup(groupId);
        }
      });
    });

    document.getElementById('memnixfs-v2-export')?.addEventListener('click', () => {
      this.exportToOutput();
    });

    this.bindTabEvents();
    this.bindTabWheelScroll();
    this.loadFirstTab();
  }

  private bindTabEvents(): void {
    const tabsContainer = document.getElementById('memnixfs-v2-tabs');
    if (!tabsContainer) return;
    tabsContainer.addEventListener('click', async (e) => {
      const tab = (e.target as HTMLElement).closest('.memnixfs-v2-tab');
      if (!tab) return;
      const tabId = tab.getAttribute('data-tab');
      const file = tab.getAttribute('data-file');
      const type = tab.getAttribute('data-type') as 'csv' | 'text';
      if (tabId && file) {
        await this.switchTab(tabId, file, type);
      }
    });
  }

  /** 让 Tab 栏支持鼠标滚轮横向滚动（Tab 较多时） */
  private bindTabWheelScroll(): void {
    const tabsContainer = document.getElementById('memnixfs-v2-tabs');
    if (!tabsContainer) return;
    tabsContainer.addEventListener('wheel', (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        tabsContainer.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  private updateTabCount(tabId: string, rowCount: number): void {
    const countEl = document.getElementById(`memnixfs-tab-count-${tabId}`);
    if (countEl) {
      countEl.textContent = rowCount.toLocaleString();
      (countEl as HTMLElement).style.display = 'inline-flex';
    }
  }

  private loadFirstTab(): void {
    const currentGroup = this.tabGroups.find(g => g.id === this.activeGroup);
    if (currentGroup && currentGroup.tabs.length > 0) {
      const firstTab = currentGroup.tabs[0];
      this.switchTab(firstTab.id, firstTab.file, firstTab.type);
    }
  }

  private switchGroup(groupId: string): void {
    this.activeGroup = groupId;
    const group = this.tabGroups.find(g => g.id === groupId);
    if (!group) return;

    document.querySelectorAll('.memnixfs-v2-group-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-group') === groupId);
    });

    const tabsContainer = document.getElementById('memnixfs-v2-tabs');
    if (!tabsContainer) return;

    this.activeTab = group.tabs[0]?.id || '';
    tabsContainer.innerHTML = group.tabs.map(tab => `
      <button class="vol3-v2-tab memnixfs-v2-tab ${tab.id === this.activeTab ? 'active' : ''}"
              data-tab="${tab.id}" data-file="${tab.file}" data-type="${tab.type}">
        <span class="tab-icon">${this.getIcon(tab.icon)}</span>
        <span class="tab-name">${tab.name}</span>
        <span class="tab-count" id="memnixfs-tab-count-${tab.id}"></span>
      </button>
    `).join('');

    const firstTab = group.tabs[0];
    if (firstTab) {
      this.switchTab(firstTab.id, firstTab.file, firstTab.type);
    }
  }

  private async switchTab(tabId: string, file: string, type: 'csv' | 'text'): Promise<void> {
    this.activeTab = tabId;
    document.querySelectorAll('.memnixfs-v2-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    const viewerContainer = document.getElementById('memnixfs-v2-csv-viewer');
    if (viewerContainer) {
      viewerContainer.classList.remove('animate-enter');
      void (viewerContainer as HTMLElement).offsetWidth;
      viewerContainer.classList.add('animate-enter');
    }

    // 直接从挂载盘按需读取（file 是相对挂载根的路径，避免全量复制造成卡顿）
    const displayName = this.getTabDisplayName(tabId);
    const fullPath = `${getMountRoot()}${file}`;
    if (type === 'csv') {
      await this.embeddedViewer.loadCSV(fullPath, displayName);
    } else {
      await this.embeddedViewer.loadText(fullPath, displayName);
    }
  }

  private getTabDisplayName(tabId: string): string {
    for (const group of this.tabGroups) {
      const tab = group.tabs.find(t => t.id === tabId);
      if (tab) return tab.name;
    }
    return tabId;
  }

  /** 把取证文件复制到 output 目录（显式动作；监听进度事件显示进度条；完成后重载当前 Tab） */
  private async exportToOutput(): Promise<void> {
    if (this.copyPromise) return this.copyPromise;

    this.showCopyingProgress(0, 0, '准备中...');
    this.copyPromise = (async () => {
      let unlisten: (() => void) | null = null;
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('memnixfs-copy-progress', (e: any) => {
          const p = e?.payload || {};
          this.updateCopyProgress(p.current || 0, p.total || 0, p.file || '');
        });
        await invoke('export_key_forensic_reports');
      } catch (e) {
        console.warn('复制 Linux 取证文件失败:', e);
      } finally {
        if (unlisten) {
          try { unlisten(); } catch { /* ignore */ }
        }
      }
    })();
    await this.copyPromise;
    this.copyPromise = null;
    this.reloadActiveTab();
  }

  /** 重新加载当前激活的 Tab（导出完成后刷新视图） */
  private reloadActiveTab(): void {
    for (const group of this.tabGroups) {
      const tab = group.tabs.find(t => t.id === this.activeTab);
      if (tab) {
        this.switchTab(tab.id, tab.file, tab.type);
        return;
      }
    }
  }

  private showCopyingProgress(current: number, total: number, file: string): void {
    const viewer = document.getElementById('memnixfs-v2-csv-viewer');
    if (!viewer) return;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    viewer.innerHTML = `
      <div class="memnixfs-copy-progress" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:48px 24px;">
        <div class="vol3-v2-spinner"></div>
        <div id="memnixfs-copy-title" style="font-size:15px;font-weight:600;color:var(--text-primary,#1e293b);">正在复制取证文件 ${total > 0 ? `(${current}/${total})` : ''}</div>
        <div id="memnixfs-copy-file" style="font-size:12px;opacity:0.7;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary,#64748b);">${this.escapeHtml(file || '')}</div>
        <div style="width:min(520px,80%);height:8px;border-radius:6px;background:var(--bg-tertiary,#e2e8f0);overflow:hidden;">
          <div id="memnixfs-progress-bar" style="height:100%;width:${pct}%;background:linear-gradient(90deg,#a78bfa,#8b5cf6);border-radius:6px;transition:width .2s ease;"></div>
        </div>
        <div style="font-size:12px;opacity:0.6;color:var(--text-secondary,#64748b);">首次访问会从 MemNixFS 挂载盘复制取证产物到 output，请稍候...</div>
      </div>
    `;
  }

  private updateCopyProgress(current: number, total: number, file: string): void {
    const title = document.getElementById('memnixfs-copy-title');
    const fileEl = document.getElementById('memnixfs-copy-file');
    const bar = document.getElementById('memnixfs-progress-bar');
    if (!title || !bar) {
      this.showCopyingProgress(current, total, file);
      return;
    }
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    title.textContent = `正在复制取证文件 (${current}/${total})`;
    if (fileEl) fileEl.textContent = file || '';
    (bar as HTMLElement).style.width = `${pct}%`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public cleanup(): void {
    this.embeddedViewer.cleanup();
    this.activeTab = 'tl_all';
    this.activeGroup = 'forensic';
    this.copied = false;
    this.copyPromise = null;
    this.eventsInitialized = false;
  }
}

/**
 * MemNixFS（Linux 内存取证）功能区
 *
 * 声明式取证项注册表：每个条目同时驱动「侧边栏功能卡片」与「MemNixFSManager 的通用分发器」。
 * 新增一个取证项（含 MemNixFS 自定义插件产物）只需往 memnixfsForensicItems 加一行即可——
 * 卡片会自动出现，点击也会被 manager 按 view 路由处理，无需改动其它逻辑。
 */
import { FeatureConfig } from '../core/types';

/** 取证项的查看方式 */
export type MemNixFSView = 'csv' | 'text' | 'file-browser' | 'action';

/** Linux 取证项（单一数据源） */
export interface LinuxForensicItem {
  /** data-feature ID（memnixfs- 前缀） */
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  /** 查看方式 */
  view: MemNixFSView;
  /** 相对挂载根的路径分段，例如 ['sys','processes','pslist.csv'] -> M:\sys\processes\pslist.csv */
  vfsPath?: string[];
}

export const memnixfsForensicItems: LinuxForensicItem[] = [
  // —— 操作 ——
  { id: 'memnixfs-load_image', name: '加载 Linux 镜像', description: '选择并通过 MemNixFS 挂载 Linux 内存转储（AVML/LiME/raw/kdump）', category: 'system-info', icon: '📥', view: 'action' },
  { id: 'memnixfs-unload', name: '卸载镜像', description: '停止 MemNixFS 并释放挂载盘', category: 'system-info', icon: '⏏️', view: 'action' },
  { id: 'memnixfs-export_reports', name: '导出取证报告', description: '把关键取证报告（时间线/findevil/进程/网络等）持久化到 output 目录', category: 'forensics', icon: '📦', view: 'action' },

  // —— 系统信息 ——
  { id: 'memnixfs-kernel_info', name: '内核版本', description: '查看内核 banner 版本字符串', category: 'system-info', icon: '🐧', view: 'text', vfsPath: ['sys', 'banner.txt'] },
  { id: 'memnixfs-kallsyms', name: '内核符号', description: '完整内核符号表（/proc/kallsyms 兼容）', category: 'system-info', icon: '🔑', view: 'text', vfsPath: ['sys', 'kallsyms'] },
  { id: 'memnixfs-dmesg', name: '内核日志(dmesg)', description: 'printk 环形缓冲区内核日志', category: 'system-info', icon: '📜', view: 'text', vfsPath: ['sys', 'dmesg'] },
  { id: 'memnixfs-mountinfo', name: '挂载信息', description: '/proc/mountinfo 格式的挂载点信息', category: 'system-info', icon: '🗄️', view: 'text', vfsPath: ['sys', 'mountinfo'] },

  // —— 进程 ——
  { id: 'memnixfs-process_list', name: '进程列表', description: 'RFC 4180 进程列表（pslist.csv）', category: 'process', icon: '🧊', view: 'csv', vfsPath: ['sys', 'processes', 'pslist.csv'] },
  { id: 'memnixfs-pstree', name: '进程树', description: 'ps 风格的进程父子树文本视图', category: 'process', icon: '🌲', view: 'text', vfsPath: ['sys', 'processes', 'pstree.txt'] },
  { id: 'memnixfs-psaux', name: '进程命令行', description: 'ps aux 风格的进程命令行视图', category: 'process', icon: '📋', view: 'text', vfsPath: ['sys', 'processes', 'psaux.txt'] },

  // —— 网络 ——
  { id: 'memnixfs-net_tcp', name: 'TCP 连接', description: 'TCP 网络连接（SIEM 导入格式）', category: 'network', icon: '🌐', view: 'csv', vfsPath: ['sys', 'net', 'tcp.csv'] },
  { id: 'memnixfs-net_udp', name: 'UDP 连接', description: 'UDP 网络连接', category: 'network', icon: '🌐', view: 'csv', vfsPath: ['sys', 'net', 'udp.csv'] },
  { id: 'memnixfs-net_summary', name: '网络概览', description: '网络接口与连接概览', category: 'network', icon: '📡', view: 'text', vfsPath: ['sys', 'net', 'summary.txt'] },

  // —— 用户/历史 ——
  { id: 'memnixfs-shell_history', name: 'Shell 历史', description: 'bash/zsh/fish 聚合命令历史', category: 'forensics', icon: '⌨️', view: 'text', vfsPath: ['sys', 'shell_history.txt'] },

  // —— 取证时间线 ——
  { id: 'memnixfs-timeline', name: '取证时间线', description: 'UTC 绝对时间流（文件 MAC 时间 + 进程 + dmesg + 日志）', category: 'timeline', icon: '📈', view: 'csv', vfsPath: ['forensic', 'timeline.csv'] },
  { id: 'memnixfs-timeline_summary', name: '时间线摘要', description: '取证时间线摘要', category: 'timeline', icon: '🧾', view: 'text', vfsPath: ['forensic', 'timeline_summary.txt'] },

  // —— 威胁狩猎 / 恶意检测（findevil 内置 16 插件，Linux 取证增强核心扩展点）——
  { id: 'memnixfs-findevil_triage', name: '恶意检测总览', description: 'findevil 威胁狩猎分诊报告', category: 'security', icon: '🩺', view: 'text', vfsPath: ['sys', 'findevil', 'triage.txt'] },
  { id: 'memnixfs-findevil_indicators', name: '威胁指标(IOC)', description: '聚合的恶意指标列表', category: 'security', icon: '🚨', view: 'csv', vfsPath: ['sys', 'findevil', 'indicators.csv'] },
  { id: 'memnixfs-findevil_malfind', name: '可疑内存(malfind)', description: '可疑可执行内存区域检测', category: 'security', icon: '🧬', view: 'csv', vfsPath: ['sys', 'findevil', 'malfind.csv'] },
  { id: 'memnixfs-findevil_psscan', name: '隐藏进程扫描', description: '扫描隐藏/已退出进程（psscan）', category: 'security', icon: '👻', view: 'csv', vfsPath: ['sys', 'findevil', 'psscan.csv'] },
  { id: 'memnixfs-findevil_hidden_modules', name: '隐藏内核模块', description: '检测隐藏的内核模块（rootkit）', category: 'security', icon: '🕳️', view: 'csv', vfsPath: ['sys', 'findevil', 'hidden_modules.csv'] },
  { id: 'memnixfs-findevil_check_syscall', name: '系统调用挂钩', description: '检测系统调用表挂钩', category: 'security', icon: '🪝', view: 'csv', vfsPath: ['sys', 'findevil', 'check_syscall.csv'] },
  { id: 'memnixfs-findevil_ebpf', name: 'eBPF 程序', description: '枚举加载的 eBPF 程序', category: 'security', icon: '🐝', view: 'csv', vfsPath: ['sys', 'findevil', 'ebpf.csv'] },
  { id: 'memnixfs-findevil_kprobes', name: 'kprobes 探针', description: '枚举内核 kprobes 探针', category: 'security', icon: '🎯', view: 'csv', vfsPath: ['sys', 'findevil', 'kprobes.csv'] },

  // —— 文件系统浏览（直接浏览挂载盘）——
  { id: 'memnixfs-fs_browse', name: '文件系统浏览', description: '用文件管理器浏览挂载盘（M:\\fs、M:\\proc 等）', category: 'filesystem', icon: '🗂️', view: 'file-browser' },
];

export class MemNixFSArea {
  static getFeatures(): FeatureConfig[] {
    return memnixfsForensicItems.map((item) => ({
      icon: item.icon,
      title: item.name,
      desc: item.description,
      feature: item.id,
      category: item.category,
    }));
  }

  static getConfig() {
    return {
      name: 'MemNixFS',
      desc: 'Linux 内存文件系统取证',
      icon: '🐧',
      color: '#a78bfa',
    };
  }
}

export default memnixfsForensicItems;

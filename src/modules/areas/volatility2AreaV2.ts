/**
 * Volatility2 V2 区域定义
 * 新版工作区域 - 内嵌CSV查看器，无需打开新窗口
 * 与 V1 不同的是，V2 版本需要先执行命令才能生成数据
 */

import { FeatureConfig } from '../core/types';

// 定义Vol2功能与文件的映射关系
export interface Vol2FeatureMapping {
  plugin: string;       // Vol2 插件名
  displayName: string;  // 显示名称
  type: 'csv' | 'text'; // 输出文件类型
  outputFile: string;   // 输出文件名
}

// 所有功能与Vol2插件的映射
export const VOL2_FEATURE_MAP: Record<string, Vol2FeatureMapping> = {
  // 系统信息类
  'vol2v2-imageinfo': { plugin: 'imageinfo', displayName: '镜像信息', type: 'text', outputFile: 'vol2_imageinfo.txt' },
  'vol2v2-verinfo': { plugin: 'verinfo', displayName: '版本信息', type: 'csv', outputFile: 'vol2_verinfo.csv' },
  'vol2v2-shutdowntime': { plugin: 'shutdowntime', displayName: '关机时间', type: 'text', outputFile: 'vol2_shutdowntime.txt' },
  'vol2v2-atoms': { plugin: 'atoms', displayName: '原子表', type: 'csv', outputFile: 'vol2_atoms.csv' },
  'vol2v2-atomscan': { plugin: 'atomscan', displayName: '原子扫描', type: 'csv', outputFile: 'vol2_atomscan.csv' },
  'vol2v2-vboxinfo': { plugin: 'vboxinfo', displayName: 'VirtualBox信息', type: 'text', outputFile: 'vol2_vboxinfo.txt' },

  // 进程分析类
  'vol2v2-pslist': { plugin: 'pslist', displayName: '进程列表', type: 'csv', outputFile: 'vol2_pslist.csv' },
  'vol2v2-psscan': { plugin: 'psscan', displayName: '进程扫描', type: 'csv', outputFile: 'vol2_psscan.csv' },
  'vol2v2-psxview': { plugin: 'psxview', displayName: '进程交叉视图', type: 'csv', outputFile: 'vol2_psxview.csv' },
  'vol2v2-handles': { plugin: 'handles', displayName: '句柄信息', type: 'csv', outputFile: 'vol2_handles.csv' },
  'vol2v2-privs': { plugin: 'privs', displayName: '进程权限', type: 'csv', outputFile: 'vol2_privs.csv' },
  'vol2v2-cmdline': { plugin: 'cmdline', displayName: '命令行参数', type: 'csv', outputFile: 'vol2_cmdline.csv' },
  'vol2v2-cmdscan': { plugin: 'cmdscan', displayName: '命令扫描', type: 'text', outputFile: 'vol2_cmdscan.txt' },
  'vol2v2-consoles': { plugin: 'consoles', displayName: '控制台缓冲', type: 'text', outputFile: 'vol2_consoles.txt' },
  'vol2v2-envars': { plugin: 'envars', displayName: '环境变量', type: 'csv', outputFile: 'vol2_envars.csv' },
  'vol2v2-dlllist': { plugin: 'dlllist', displayName: 'DLL列表', type: 'csv', outputFile: 'vol2_dlllist.csv' },

  // 内存分析类
  'vol2v2-vadinfo': { plugin: 'vadinfo', displayName: 'VAD信息', type: 'text', outputFile: 'vol2_vadinfo.txt' },
  'vol2v2-modules': { plugin: 'modules', displayName: '内核模块', type: 'csv', outputFile: 'vol2_modules.csv' },
  'vol2v2-unloadedmodules': { plugin: 'unloadedmodules', displayName: '已卸载模块', type: 'csv', outputFile: 'vol2_unloadedmodules.csv' },
  'vol2v2-bigpools': { plugin: 'bigpools', displayName: '大内存池', type: 'csv', outputFile: 'vol2_bigpools.csv' },

  // 网络分析类
  'vol2v2-netscan': { plugin: 'netscan', displayName: '网络扫描', type: 'csv', outputFile: 'vol2_netscan.csv' },

  // 文件系统类
  'vol2v2-filescan': { plugin: 'filescan', displayName: '文件扫描', type: 'csv', outputFile: 'vol2_filescan.csv' },
  'vol2v2-mftparser': { plugin: 'mftparser', displayName: 'MFT解析', type: 'csv', outputFile: 'vol2_mftparser.csv' },
  'vol2v2-shellbags': { plugin: 'shellbags', displayName: 'ShellBags', type: 'csv', outputFile: 'vol2_shellbags.csv' },

  // 注册表类
  'vol2v2-printkey': { plugin: 'printkey', displayName: '注册表键值', type: 'text', outputFile: 'vol2_printkey.txt' },
  'vol2v2-dumpregistry': { plugin: 'dumpregistry', displayName: '注册表转储', type: 'text', outputFile: 'vol2_dumpregistry.txt' },
  'vol2v2-shimcache': { plugin: 'shimcache', displayName: '兼容缓存', type: 'csv', outputFile: 'vol2_shimcache.csv' },
  'vol2v2-auditpol': { plugin: 'auditpol', displayName: '审计策略', type: 'text', outputFile: 'vol2_auditpol.txt' },
  'vol2v2-userassist': { plugin: 'userassist', displayName: '用户活动', type: 'csv', outputFile: 'vol2_userassist.csv' },

  // 安全分析类
  'vol2v2-hashdump': { plugin: 'hashdump', displayName: '密码哈希', type: 'text', outputFile: 'vol2_hashdump.txt' },
  'vol2v2-malfind': { plugin: 'malfind', displayName: '恶意代码检测', type: 'text', outputFile: 'vol2_malfind.txt' },
  'vol2v2-apihooks': { plugin: 'apihooks', displayName: 'API钩子', type: 'text', outputFile: 'vol2_apihooks.txt' },
  'vol2v2-mutantscan': { plugin: 'mutantscan', displayName: '互斥体扫描', type: 'csv', outputFile: 'vol2_mutantscan.csv' },
  'vol2v2-eventhooks': { plugin: 'eventhooks', displayName: '事件钩子', type: 'text', outputFile: 'vol2_eventhooks.txt' },
  'vol2v2-messagehooks': { plugin: 'messagehooks', displayName: '消息钩子', type: 'text', outputFile: 'vol2_messagehooks.txt' },
  'vol2v2-symlinkscan': { plugin: 'symlinkscan', displayName: '符号链接扫描', type: 'csv', outputFile: 'vol2_symlinkscan.csv' },
  'vol2v2-truecryptsummary': { plugin: 'truecryptsummary', displayName: 'TrueCrypt摘要', type: 'text', outputFile: 'vol2_truecryptsummary.txt' },
  'vol2v2-truecryptmaster': { plugin: 'truecryptmaster', displayName: 'TrueCrypt主密码', type: 'text', outputFile: 'vol2_truecryptmaster.txt' },
  'vol2v2-truecryptpassphrase': { plugin: 'truecryptpassphrase', displayName: 'TrueCrypt密码短语', type: 'text', outputFile: 'vol2_truecryptpassphrase.txt' },
  'vol2v2-mimikatz': { plugin: 'mimikatz', displayName: 'Mimikatz', type: 'text', outputFile: 'vol2_mimikatz.txt' },

  // 内核分析类
  'vol2v2-ssdt': { plugin: 'ssdt', displayName: 'SSDT', type: 'text', outputFile: 'vol2_ssdt.txt' },
  'vol2v2-timers': { plugin: 'timers', displayName: '内核定时器', type: 'csv', outputFile: 'vol2_timers.csv' },
  'vol2v2-gditimers': { plugin: 'gditimers', displayName: 'GDI定时器', type: 'csv', outputFile: 'vol2_gditimers.csv' },
  'vol2v2-driverscan': { plugin: 'driverscan', displayName: '驱动扫描', type: 'csv', outputFile: 'vol2_driverscan.csv' },
  'vol2v2-driverirp': { plugin: 'driverirp', displayName: '驱动IRP', type: 'text', outputFile: 'vol2_driverirp.txt' },
  'vol2v2-callbacks': { plugin: 'callbacks', displayName: '回调函数', type: 'text', outputFile: 'vol2_callbacks.txt' },

  // GUI分析类
  'vol2v2-windows': { plugin: 'windows', displayName: '窗口信息', type: 'text', outputFile: 'vol2_windows.txt' },
  'vol2v2-wintree': { plugin: 'wintree', displayName: '窗口层次', type: 'text', outputFile: 'vol2_wintree.txt' },
  'vol2v2-deskscan': { plugin: 'deskscan', displayName: '桌面扫描', type: 'text', outputFile: 'vol2_deskscan.txt' },
  'vol2v2-session': { plugin: 'sessions', displayName: '会话信息', type: 'text', outputFile: 'vol2_sessions.txt' },
  'vol2v2-clipboard': { plugin: 'clipboard', displayName: '剪贴板', type: 'text', outputFile: 'vol2_clipboard.txt' },
  'vol2v2-editbox': { plugin: 'editbox', displayName: '编辑框', type: 'text', outputFile: 'vol2_editbox.txt' },

  // 服务分析类
  'vol2v2-svcscan': { plugin: 'svcscan', displayName: '服务扫描', type: 'csv', outputFile: 'vol2_svcscan.csv' },

  // 浏览器取证类
  'vol2v2-iehistory': { plugin: 'iehistory', displayName: 'IE历史', type: 'text', outputFile: 'vol2_iehistory.txt' },
  'vol2v2-chromehistory': { plugin: 'chromehistory', displayName: 'Chrome', type: 'text', outputFile: 'vol2_chromehistory.txt' },
  'vol2v2-firefoxhistory': { plugin: 'firefoxhistory', displayName: 'Firefox', type: 'text', outputFile: 'vol2_firefoxhistory.txt' },

  // 时间线类
  'vol2v2-timeliner': { plugin: 'timeliner', displayName: '时间线', type: 'csv', outputFile: 'vol2_timeliner.csv' },
};

export class Volatility2AreaV2 {
  static getFeatures(): FeatureConfig[] {
    return [
      // 系统信息类
      { icon: '🖥️', title: '镜像信息', desc: '获取内存镜像的基本信息和元数据', feature: 'vol2v2-imageinfo', category: 'system-info' },
      { icon: 'ℹ️', title: '版本信息', desc: '显示版本信息', feature: 'vol2v2-verinfo', category: 'system-info' },
      { icon: '⏹️', title: '关机时间', desc: '获取系统关机时间', feature: 'vol2v2-shutdowntime', category: 'system-info' },
      { icon: '⚛️', title: '原子表', desc: '显示原子表信息', feature: 'vol2v2-atoms', category: 'system-info' },
      { icon: '🔬', title: '原子扫描', desc: '扫描原子表', feature: 'vol2v2-atomscan', category: 'system-info' },
      { icon: '📦', title: 'VirtualBox信息', desc: '获取VirtualBox内存镜像信息', feature: 'vol2v2-vboxinfo', category: 'system-info' },

      // 进程分析类
      { icon: '📋', title: '进程列表', desc: '列出所有活动进程及其详细信息', feature: 'vol2v2-pslist', category: 'process' },
      { icon: '🔍', title: '进程扫描', desc: '扫描内存中的进程结构体', feature: 'vol2v2-psscan', category: 'process' },
      { icon: '👁️', title: '进程交叉视图', desc: '交叉验证进程列表的完整性', feature: 'vol2v2-psxview', category: 'process' },
      { icon: '🎯', title: '句柄信息', desc: '显示进程的句柄信息', feature: 'vol2v2-handles', category: 'process' },
      { icon: '🔑', title: '进程权限', desc: '显示进程的权限信息', feature: 'vol2v2-privs', category: 'process' },
      { icon: '⌨️', title: '命令行参数', desc: '显示进程的命令行参数', feature: 'vol2v2-cmdline', category: 'process' },
      { icon: '🔎', title: '命令扫描', desc: '扫描命令行历史', feature: 'vol2v2-cmdscan', category: 'process' },
      { icon: '💻', title: '控制台缓冲', desc: '提取控制台缓冲区信息', feature: 'vol2v2-consoles', category: 'process' },
      { icon: '🌱', title: '环境变量', desc: '显示进程的环境变量', feature: 'vol2v2-envars', category: 'process' },
      { icon: '📚', title: 'DLL列表', desc: '列出进程加载的DLL模块', feature: 'vol2v2-dlllist', category: 'process' },

      // 内存分析类
      { icon: '🗺️', title: 'VAD信息', desc: '显示虚拟地址描述符信息', feature: 'vol2v2-vadinfo', category: 'memory' },
      { icon: '🧩', title: '内核模块', desc: '显示内核模块列表', feature: 'vol2v2-modules', category: 'memory' },
      { icon: '📦', title: '已卸载模块', desc: '显示已卸载的模块', feature: 'vol2v2-unloadedmodules', category: 'memory' },
      { icon: '🏊', title: '大内存池', desc: '显示大池分配信息', feature: 'vol2v2-bigpools', category: 'memory' },

      // 网络分析类
      { icon: '🌐', title: '网络扫描', desc: '扫描网络连接和套接字信息', feature: 'vol2v2-netscan', category: 'network' },

      // 文件系统类
      { icon: '🗂️', title: '文件扫描', desc: '扫描文件对象和文件句柄', feature: 'vol2v2-filescan', category: 'filesystem' },
      { icon: '🗃️', title: 'MFT解析', desc: '解析NTFS主文件表', feature: 'vol2v2-mftparser', category: 'filesystem' },
      { icon: '🏠', title: 'ShellBags', desc: '提取Shell文件夹信息', feature: 'vol2v2-shellbags', category: 'filesystem' },

      // 注册表类
      { icon: '📜', title: '注册表键值', desc: '打印注册表键值', feature: 'vol2v2-printkey', category: 'registry' },
      { icon: '💿', title: '注册表转储', desc: '转储注册表内容', feature: 'vol2v2-dumpregistry', category: 'registry' },
      { icon: '🔄', title: '兼容缓存', desc: '提取应用程序兼容性缓存', feature: 'vol2v2-shimcache', category: 'registry' },
      { icon: '🔐', title: '审计策略', desc: '提取审计策略信息', feature: 'vol2v2-auditpol', category: 'registry' },
      { icon: '👤', title: '用户活动', desc: '提取用户活动记录', feature: 'vol2v2-userassist', category: 'registry' },

      // 安全分析类
      { icon: '🔐', title: '密码哈希', desc: '提取系统密码哈希值', feature: 'vol2v2-hashdump', category: 'security' },
      { icon: '🔒', title: '恶意代码检测', desc: '检测隐藏和注入的代码', feature: 'vol2v2-malfind', category: 'security' },
      { icon: '🪝', title: 'API钩子', desc: '检测API钩子', feature: 'vol2v2-apihooks', category: 'security' },
      { icon: '🔐', title: '互斥体扫描', desc: '扫描互斥体对象', feature: 'vol2v2-mutantscan', category: 'security' },
      { icon: '📡', title: '事件钩子', desc: '检测事件钩子', feature: 'vol2v2-eventhooks', category: 'security' },
      { icon: '💬', title: '消息钩子', desc: '检测消息钩子', feature: 'vol2v2-messagehooks', category: 'security' },
      { icon: '🔗', title: '符号链接扫描', desc: '扫描符号链接', feature: 'vol2v2-symlinkscan', category: 'security' },
      { icon: '🔒', title: 'TrueCrypt摘要', desc: '提取TrueCrypt加密信息', feature: 'vol2v2-truecryptsummary', category: 'security' },
      { icon: '🔑', title: 'TrueCrypt主密码', desc: '提取TrueCrypt主密码', feature: 'vol2v2-truecryptmaster', category: 'security' },
      { icon: '🔑', title: 'TrueCrypt密码短语', desc: '提取TrueCrypt密码短语', feature: 'vol2v2-truecryptpassphrase', category: 'security' },
      { icon: '🔑', title: 'Mimikatz', desc: '提取密码和哈希值', feature: 'vol2v2-mimikatz', category: 'security' },

      // 内核分析类
      { icon: '🔧', title: 'SSDT', desc: '显示系统服务描述符表', feature: 'vol2v2-ssdt', category: 'kernel' },
      { icon: '⏰', title: '内核定时器', desc: '显示内核定时器信息', feature: 'vol2v2-timers', category: 'kernel' },
      { icon: '🎨', title: 'GDI定时器', desc: '显示GDI定时器信息', feature: 'vol2v2-gditimers', category: 'kernel' },
      { icon: '🚗', title: '驱动扫描', desc: '扫描驱动程序对象', feature: 'vol2v2-driverscan', category: 'kernel' },
      { icon: '📞', title: '驱动IRP', desc: '显示驱动程序IRP信息', feature: 'vol2v2-driverirp', category: 'kernel' },
      { icon: '📞', title: '回调函数', desc: '显示回调函数信息', feature: 'vol2v2-callbacks', category: 'kernel' },

      // GUI分析类
      { icon: '🪟', title: '窗口信息', desc: '列出窗口信息', feature: 'vol2v2-windows', category: 'gui' },
      { icon: '🌳', title: '窗口层次', desc: '显示窗口层次结构', feature: 'vol2v2-wintree', category: 'gui' },
      { icon: '🖥️', title: '桌面扫描', desc: '扫描桌面对象', feature: 'vol2v2-deskscan', category: 'gui' },
      { icon: '👥', title: '会话信息', desc: '显示会话信息', feature: 'vol2v2-session', category: 'gui' },
      { icon: '📋', title: '剪贴板', desc: '提取剪贴板内容', feature: 'vol2v2-clipboard', category: 'gui' },
      { icon: '✏️', title: '编辑框', desc: '提取编辑框内容', feature: 'vol2v2-editbox', category: 'gui' },

      // 服务分析类
      { icon: '⚙️', title: '服务扫描', desc: '扫描Windows服务信息', feature: 'vol2v2-svcscan', category: 'services' },

      // 浏览器取证类
      { icon: '🌐', title: 'IE历史', desc: '提取IE浏览器历史记录', feature: 'vol2v2-iehistory', category: 'browser-forensics' },
      { icon: '🎯', title: 'Chrome历史', desc: '提取Chrome浏览器历史记录', feature: 'vol2v2-chromehistory', category: 'browser-forensics' },
      { icon: '🦊', title: 'Firefox历史', desc: '提取Firefox浏览器历史记录', feature: 'vol2v2-firefoxhistory', category: 'browser-forensics' },

      // 时间线分析类
      { icon: '📅', title: '时间线', desc: '生成系统活动时间线', feature: 'vol2v2-timeliner', category: 'timeline' },
    ];
  }

  static getConfig() {
    return {
      name: 'Volatility2',
      desc: 'Vol2内存分析框架 (内嵌CSV)',
      icon: '/assets/vol2.png',
      color: '#ff6b6b'
    };
  }

  /**
   * 判断是否是V2版本的功能
   */
  static isV2Feature(feature: string): boolean {
    return feature.startsWith('vol2v2-');
  }

  /**
   * 获取功能对应的Vol2插件映射
   */
  static getFeatureMapping(feature: string): Vol2FeatureMapping | null {
    return VOL2_FEATURE_MAP[feature] || null;
  }
}

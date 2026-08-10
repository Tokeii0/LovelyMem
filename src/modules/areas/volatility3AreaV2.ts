/**
 * Volatility3 V2 区域定义
 * 新版工作区域 - 内嵌CSV查看器，无需打开新窗口
 * 与 V1 不同的是，V2 版本需要先执行命令才能生成数据
 */

import { FeatureConfig } from '../core/types';

// 定义Vol3功能与文件的映射关系
export interface Vol3FeatureMapping {
  plugin: string;       // Vol3 插件名
  displayName: string;  // 显示名称
  type: 'csv' | 'text'; // 输出文件类型
  outputFile: string;   // 输出文件名
}

// 所有功能与Vol3插件的映射
export const VOL3_FEATURE_MAP: Record<string, Vol3FeatureMapping> = {
  // 系统信息类
  'vol3v2-info': { plugin: 'windows.info', displayName: '系统信息', type: 'text', outputFile: 'info.txt' },
  'vol3v2-crashinfo': { plugin: 'windows.crashinfo', displayName: '崩溃信息', type: 'text', outputFile: 'crashinfo.txt' },
  'vol3v2-statistics': { plugin: 'windows.statistics', displayName: '内存统计', type: 'csv', outputFile: 'statistics.csv' },
  'vol3v2-verinfo': { plugin: 'windows.verinfo', displayName: '版本信息', type: 'csv', outputFile: 'verinfo.csv' },
  'vol3v2-banners': { plugin: 'banners', displayName: '系统标识', type: 'text', outputFile: 'banners.txt' },

  // 进程分析类
  'vol3v2-pslist': { plugin: 'windows.pslist', displayName: '进程列表', type: 'csv', outputFile: 'pslist.csv' },
  'vol3v2-pstree': { plugin: 'windows.pstree', displayName: '进程树', type: 'csv', outputFile: 'pstree.csv' },
  'vol3v2-psscan': { plugin: 'windows.psscan', displayName: '进程扫描', type: 'csv', outputFile: 'psscan.csv' },
  'vol3v2-psxview': { plugin: 'windows.psxview', displayName: '进程交叉视图', type: 'csv', outputFile: 'psxview.csv' },
  'vol3v2-cmdline': { plugin: 'windows.cmdline', displayName: '命令行参数', type: 'csv', outputFile: 'cmdline.csv' },
  'vol3v2-envars': { plugin: 'windows.envars', displayName: '环境变量', type: 'text', outputFile: 'envars.txt' },
  'vol3v2-handles': { plugin: 'windows.handles', displayName: '句柄信息', type: 'csv', outputFile: 'handles.csv' },
  'vol3v2-joblinks': { plugin: 'windows.joblinks', displayName: '作业链接', type: 'csv', outputFile: 'joblinks.csv' },
  'vol3v2-threads': { plugin: 'windows.threads', displayName: '线程信息', type: 'csv', outputFile: 'threads.csv' },
  'vol3v2-thrdscan': { plugin: 'windows.thrdscan', displayName: '线程扫描', type: 'csv', outputFile: 'thrdscan.csv' },
  'vol3v2-suspended_threads': { plugin: 'windows.suspended_threads', displayName: '挂起线程', type: 'csv', outputFile: 'suspended_threads.csv' },
  'vol3v2-hollowprocesses': { plugin: 'windows.hollowprocesses', displayName: '进程镂空检测', type: 'csv', outputFile: 'hollowprocesses.csv' },
  'vol3v2-processghosting': { plugin: 'windows.processghosting', displayName: '进程镜像替换', type: 'csv', outputFile: 'processghosting.csv' },
  'vol3v2-privileges': { plugin: 'windows.privileges', displayName: '进程权限', type: 'csv', outputFile: 'privileges.csv' },

  // 内存分析类
  'vol3v2-modules': { plugin: 'windows.modules', displayName: '内核模块', type: 'csv', outputFile: 'modules.csv' },
  'vol3v2-modscan': { plugin: 'windows.modscan', displayName: '模块扫描', type: 'csv', outputFile: 'modscan.csv' },
  'vol3v2-unloadedmodules': { plugin: 'windows.unloadedmodules', displayName: '已卸载模块', type: 'csv', outputFile: 'unloadedmodules.csv' },
  'vol3v2-dlllist': { plugin: 'windows.dlllist', displayName: 'DLL列表', type: 'csv', outputFile: 'dlllist.csv' },
  'vol3v2-ldrmodules': { plugin: 'windows.ldrmodules', displayName: '模块比较', type: 'csv', outputFile: 'ldrmodules.csv' },
  'vol3v2-vadinfo': { plugin: 'windows.vadinfo', displayName: 'VAD信息', type: 'csv', outputFile: 'vadinfo.csv' },
  'vol3v2-vadwalk': { plugin: 'windows.vadwalk', displayName: 'VAD遍历', type: 'csv', outputFile: 'vadwalk.csv' },
  'vol3v2-bigpools': { plugin: 'windows.bigpools', displayName: '大内存池', type: 'csv', outputFile: 'bigpools.csv' },
  'vol3v2-poolscanner': { plugin: 'windows.poolscanner', displayName: '内存池扫描', type: 'csv', outputFile: 'poolscanner.csv' },
  'vol3v2-virtmap': { plugin: 'windows.virtmap', displayName: '虚拟内存映射', type: 'csv', outputFile: 'virtmap.csv' },

  // 网络分析类
  'vol3v2-netstat': { plugin: 'windows.netstat', displayName: '网络状态', type: 'csv', outputFile: 'netstat.csv' },
  'vol3v2-netscan': { plugin: 'windows.netscan', displayName: '网络扫描', type: 'csv', outputFile: 'netscan.csv' },

  // 文件系统类
  'vol3v2-filescan': { plugin: 'windows.filescan', displayName: '文件扫描', type: 'csv', outputFile: 'filescan.csv' },
  'vol3v2-symlinkscan': { plugin: 'windows.symlinkscan', displayName: '符号链接扫描', type: 'csv', outputFile: 'symlinkscan.csv' },

  // 注册表类
  'vol3v2-registry.hivelist': { plugin: 'windows.registry.hivelist', displayName: '注册表列表', type: 'csv', outputFile: 'registry_hivelist.csv' },
  'vol3v2-registry.hivescan': { plugin: 'windows.registry.hivescan', displayName: '注册表扫描', type: 'csv', outputFile: 'registry_hivescan.csv' },
  'vol3v2-registry.printkey': { plugin: 'windows.registry.printkey', displayName: '注册表键值', type: 'text', outputFile: 'registry_printkey.txt' },
  'vol3v2-printkey': { plugin: 'printkey', displayName: '打印键值', type: 'text', outputFile: 'printkey.txt' },
  'vol3v2-registry.certificates': { plugin: 'windows.registry.certificates', displayName: '注册表证书', type: 'csv', outputFile: 'registry_certificates.csv' },
  'vol3v2-registry.userassist': { plugin: 'windows.registry.userassist', displayName: '用户活动记录', type: 'csv', outputFile: 'registry_userassist.csv' },
  'vol3v2-shimcachemem': { plugin: 'windows.shimcachemem', displayName: '应用兼容缓存', type: 'csv', outputFile: 'shimcachemem.csv' },
  'vol3v2-registry.amcache': { plugin: 'windows.registry.amcache', displayName: 'Amcache 程序执行', type: 'csv', outputFile: 'registry_amcache.csv' },

  // 安全分析类
  'vol3v2-malfind': { plugin: 'windows.malfind', displayName: '恶意代码检测', type: 'csv', outputFile: 'malfind.csv' },
  'vol3v2-hashdump': { plugin: 'windows.hashdump', displayName: '密码哈希', type: 'text', outputFile: 'hashdump.txt' },
  'vol3v2-cachedump': { plugin: 'windows.cachedump', displayName: '域缓存凭据', type: 'text', outputFile: 'cachedump.txt' },
  'vol3v2-lsadump': { plugin: 'windows.lsadump', displayName: 'LSA密钥', type: 'text', outputFile: 'lsadump.txt' },
  'vol3v2-getsids': { plugin: 'windows.getsids', displayName: '安全标识符', type: 'text', outputFile: 'getsids.txt' },
  'vol3v2-getservicesids': { plugin: 'windows.getservicesids', displayName: '服务SID', type: 'text', outputFile: 'getservicesids.txt' },
  'vol3v2-skeleton_key_check': { plugin: 'windows.skeleton_key_check', displayName: '骨架密钥检测', type: 'csv', outputFile: 'skeleton_key_check.csv' },
  'vol3v2-truecrypt': { plugin: 'windows.truecrypt.Passphrase', displayName: 'TrueCrypt检测', type: 'csv', outputFile: 'truecrypt.csv' },
  'vol3v2-suspicious_threads': { plugin: 'windows.suspicious_threads', displayName: '可疑线程', type: 'csv', outputFile: 'suspicious_threads.csv' },
  'vol3v2-mutantscan': { plugin: 'windows.mutantscan', displayName: '互斥体扫描', type: 'csv', outputFile: 'mutantscan.csv' },

  // 内核分析类
  'vol3v2-callbacks': { plugin: 'windows.callbacks', displayName: '回调函数', type: 'csv', outputFile: 'callbacks.csv' },
  'vol3v2-ssdt': { plugin: 'windows.ssdt', displayName: 'SSDT', type: 'csv', outputFile: 'ssdt.csv' },
  'vol3v2-iat': { plugin: 'windows.iat', displayName: '导入地址表', type: 'csv', outputFile: 'iat.csv' },
  'vol3v2-direct_system_calls': { plugin: 'windows.direct_system_calls', displayName: '直接系统调用', type: 'csv', outputFile: 'direct_system_calls.csv' },
  'vol3v2-indirect_system_calls': { plugin: 'windows.indirect_system_calls', displayName: '间接系统调用', type: 'csv', outputFile: 'indirect_system_calls.csv' },
  'vol3v2-devicetree': { plugin: 'windows.devicetree', displayName: '设备树', type: 'csv', outputFile: 'devicetree.csv' },
  'vol3v2-driverirp': { plugin: 'windows.driverirp', displayName: '驱动IRP', type: 'csv', outputFile: 'driverirp.csv' },
  'vol3v2-drivermodule': { plugin: 'windows.drivermodule', displayName: '驱动模块', type: 'csv', outputFile: 'drivermodule.csv' },
  'vol3v2-driverscan': { plugin: 'windows.driverscan', displayName: '驱动扫描', type: 'csv', outputFile: 'driverscan.csv' },
  'vol3v2-kpcrs': { plugin: 'windows.kpcrs', displayName: '处理器控制区域', type: 'csv', outputFile: 'kpcrs.csv' },
  'vol3v2-timers': { plugin: 'windows.timers', displayName: '内核定时器', type: 'csv', outputFile: 'timers.csv' },
  'vol3v2-mbrscan': { plugin: 'windows.mbrscan', displayName: 'MBR扫描', type: 'csv', outputFile: 'mbrscan.csv' },

  // 服务分析类
  'vol3v2-svclist': { plugin: 'windows.svclist', displayName: '服务列表', type: 'csv', outputFile: 'svclist.csv' },
  'vol3v2-svcdiff': { plugin: 'windows.svcdiff', displayName: '服务差异', type: 'csv', outputFile: 'svcdiff.csv' },
  'vol3v2-sessions': { plugin: 'windows.sessions', displayName: '会话信息', type: 'csv', outputFile: 'sessions.csv' },
};

export class Volatility3AreaV2 {
  static getFeatures(): FeatureConfig[] {
    return [
      // 系统信息类
      {
        icon: '⚡',
        title: '系统信息',
        desc: '获取Windows系统信息和版本详情',
        feature: 'vol3v2-info',
        category: 'system-info'
      },
      {
        icon: '📋',
        title: '崩溃信息',
        desc: '提取系统崩溃信息和错误详情',
        feature: 'vol3v2-crashinfo',
        category: 'system-info'
      },
      {
        icon: '📊',
        title: '内存统计',
        desc: '生成内存使用统计信息',
        feature: 'vol3v2-statistics',
        category: 'system-info'
      },
      {
        icon: 'ℹ️',
        title: '版本信息',
        desc: '版本信息分析',
        feature: 'vol3v2-verinfo',
        category: 'system-info'
      },
      {
        icon: '🎋',
        title: '系统标识',
        desc: '显示系统标识信息',
        feature: 'vol3v2-banners',
        category: 'system-info'
      },

      // 进程分析类
      {
        icon: '📋',
        title: '进程列表',
        desc: '高性能进程列表分析',
        feature: 'vol3v2-pslist',
        category: 'process'
      },
      {
        icon: '🔍',
        title: '进程树',
        desc: '进程树结构可视化分析',
        feature: 'vol3v2-pstree',
        category: 'process'
      },
      {
        icon: '🔎',
        title: '进程扫描',
        desc: '扫描进程结构体',
        feature: 'vol3v2-psscan',
        category: 'process'
      },
      {
        icon: '🌳',
        title: '进程交叉视图',
        desc: '进程交叉视图分析',
        feature: 'vol3v2-psxview',
        category: 'process'
      },
      {
        icon: '⌨️',
        title: '命令行参数',
        desc: '显示进程命令行参数',
        feature: 'vol3v2-cmdline',
        category: 'process'
      },
      {
        icon: '🌱',
        title: '环境变量',
        desc: '显示进程环境变量',
        feature: 'vol3v2-envars',
        category: 'process'
      },
      {
        icon: '🎯',
        title: '句柄信息',
        desc: '系统句柄和对象分析',
        feature: 'vol3v2-handles',
        category: 'process'
      },
      {
        icon: '🔗',
        title: '作业链接',
        desc: '作业对象链接分析',
        feature: 'vol3v2-joblinks',
        category: 'process'
      },
      {
        icon: '🧵',
        title: '线程信息',
        desc: '线程信息分析',
        feature: 'vol3v2-threads',
        category: 'process'
      },
      {
        icon: '🔍',
        title: '线程扫描',
        desc: '扫描线程结构体',
        feature: 'vol3v2-thrdscan',
        category: 'process'
      },
      {
        icon: '⏸️',
        title: '挂起线程',
        desc: '检测挂起的线程',
        feature: 'vol3v2-suspended_threads',
        category: 'process'
      },
      {
        icon: '👻',
        title: '进程镂空检测',
        desc: '检测进程镂空技术',
        feature: 'vol3v2-hollowprocesses',
        category: 'process'
      },
      {
        icon: '👻',
        title: '进程镜像替换',
        desc: '检测进程镜像替换',
        feature: 'vol3v2-processghosting',
        category: 'process'
      },
      {
        icon: '🛡️',
        title: '进程权限',
        desc: '进程权限和特权分析',
        feature: 'vol3v2-privileges',
        category: 'process'
      },

      // 内存分析类
      {
        icon: '📚',
        title: '内核模块',
        desc: '显示内核模块列表',
        feature: 'vol3v2-modules',
        category: 'memory'
      },
      {
        icon: '🔍',
        title: '模块扫描',
        desc: '扫描内核模块',
        feature: 'vol3v2-modscan',
        category: 'memory'
      },
      {
        icon: '📦',
        title: '已卸载模块',
        desc: '显示已卸载的模块',
        feature: 'vol3v2-unloadedmodules',
        category: 'memory'
      },
      {
        icon: '📚',
        title: 'DLL列表',
        desc: '列出进程加载的DLL模块',
        feature: 'vol3v2-dlllist',
        category: 'memory'
      },
      {
        icon: '📖',
        title: '模块比较',
        desc: '比较不同模块列表',
        feature: 'vol3v2-ldrmodules',
        category: 'memory'
      },
      {
        icon: '🗺️',
        title: 'VAD信息',
        desc: '显示虚拟地址描述符信息',
        feature: 'vol3v2-vadinfo',
        category: 'memory'
      },
      {
        icon: '🚶',
        title: 'VAD遍历',
        desc: '遍历虚拟地址空间',
        feature: 'vol3v2-vadwalk',
        category: 'memory'
      },
      {
        icon: '🌊',
        title: '大内存池',
        desc: '显示大内存池分配',
        feature: 'vol3v2-bigpools',
        category: 'memory'
      },
      {
        icon: '🔍',
        title: '内存池扫描',
        desc: '内存池扫描工具',
        feature: 'vol3v2-poolscanner',
        category: 'memory'
      },
      {
        icon: '🗺️',
        title: '虚拟内存映射',
        desc: '虚拟内存映射',
        feature: 'vol3v2-virtmap',
        category: 'memory'
      },

      // 网络分析类
      {
        icon: '🌐',
        title: '网络状态',
        desc: '网络连接状态深度分析',
        feature: 'vol3v2-netstat',
        category: 'network'
      },
      {
        icon: '🔍',
        title: '网络扫描',
        desc: '扫描网络连接信息',
        feature: 'vol3v2-netscan',
        category: 'network'
      },

      // 文件系统类
      {
        icon: '🗂️',
        title: '文件扫描',
        desc: '文件系统对象扫描分析',
        feature: 'vol3v2-filescan',
        category: 'filesystem'
      },
      {
        icon: '🔍',
        title: '符号链接扫描',
        desc: '扫描符号链接',
        feature: 'vol3v2-symlinkscan',
        category: 'filesystem'
      },

      // 注册表类
      {
        icon: '📋',
        title: '注册表列表',
        desc: '列出注册表配置单元',
        feature: 'vol3v2-registry.hivelist',
        category: 'registry'
      },
      {
        icon: '🔍',
        title: '注册表扫描',
        desc: '扫描注册表配置单元',
        feature: 'vol3v2-registry.hivescan',
        category: 'registry'
      },
      {
        icon: '🔑',
        title: '注册表键值',
        desc: '打印注册表项',
        feature: 'vol3v2-registry.printkey',
        category: 'registry'
      },
      {
        icon: '🔑',
        title: '打印键值',
        desc: '打印指定注册表键值',
        feature: 'vol3v2-printkey',
        category: 'registry'
      },
      {
        icon: '📜',
        title: '注册表证书',
        desc: '提取注册表证书',
        feature: 'vol3v2-registry.certificates',
        category: 'registry'
      },
      {
        icon: '👤',
        title: '用户活动记录',
        desc: '用户辅助活动记录',
        feature: 'vol3v2-registry.userassist',
        category: 'registry'
      },
      {
        icon: '🔄',
        title: '应用兼容缓存',
        desc: '内存中的应用兼容缓存',
        feature: 'vol3v2-shimcachemem',
        category: 'registry'
      },
      {
        icon: '🗂️',
        title: 'Amcache 程序执行',
        desc: 'Amcache.hve 中的程序执行痕迹（路径/SHA1/时间）',
        feature: 'vol3v2-registry.amcache',
        category: 'registry'
      },

      // 安全分析类
      {
        icon: '🔒',
        title: '恶意代码检测',
        desc: '先进恶意代码检测算法',
        feature: 'vol3v2-malfind',
        category: 'security'
      },
      {
        icon: '🔐',
        title: '密码哈希',
        desc: '转储密码哈希',
        feature: 'vol3v2-hashdump',
        category: 'security'
      },
      {
        icon: '🗃️',
        title: '域缓存凭据',
        desc: '转储域缓存凭据',
        feature: 'vol3v2-cachedump',
        category: 'security'
      },
      {
        icon: '🔑',
        title: 'LSA密钥',
        desc: '转储LSA密钥',
        feature: 'vol3v2-lsadump',
        category: 'security'
      },
      {
        icon: '🆔',
        title: '安全标识符',
        desc: '获取安全标识符',
        feature: 'vol3v2-getsids',
        category: 'security'
      },
      {
        icon: '⚙️',
        title: '服务SID',
        desc: '获取服务SID',
        feature: 'vol3v2-getservicesids',
        category: 'security'
      },
      {
        icon: '🔍',
        title: '骨架密钥检测',
        desc: '检测骨架密钥攻击',
        feature: 'vol3v2-skeleton_key_check',
        category: 'security'
      },
      {
        icon: '🔒',
        title: 'TrueCrypt检测',
        desc: 'TrueCrypt加密检测',
        feature: 'vol3v2-truecrypt',
        category: 'security'
      },
      {
        icon: '🕵️',
        title: '可疑线程',
        desc: '检测可疑线程',
        feature: 'vol3v2-suspicious_threads',
        category: 'security'
      },
      {
        icon: '🔒',
        title: '互斥体扫描',
        desc: '扫描互斥体对象',
        feature: 'vol3v2-mutantscan',
        category: 'security'
      },

      // 内核分析类
      {
        icon: '📞',
        title: '回调函数',
        desc: '显示回调函数信息',
        feature: 'vol3v2-callbacks',
        category: 'kernel'
      },
      {
        icon: '🔧',
        title: 'SSDT',
        desc: '系统服务描述符表',
        feature: 'vol3v2-ssdt',
        category: 'kernel'
      },
      {
        icon: '🏗️',
        title: '导入地址表',
        desc: '导入地址表分析',
        feature: 'vol3v2-iat',
        category: 'kernel'
      },
      {
        icon: '📊',
        title: '直接系统调用',
        desc: '检测直接系统调用',
        feature: 'vol3v2-direct_system_calls',
        category: 'kernel'
      },
      {
        icon: '🔀',
        title: '间接系统调用',
        desc: '检测间接系统调用',
        feature: 'vol3v2-indirect_system_calls',
        category: 'kernel'
      },
      {
        icon: '🌳',
        title: '设备树',
        desc: '设备树结构分析',
        feature: 'vol3v2-devicetree',
        category: 'kernel'
      },
      {
        icon: '🚗',
        title: '驱动IRP',
        desc: '驱动IRP处理分析',
        feature: 'vol3v2-driverirp',
        category: 'kernel'
      },
      {
        icon: '🔧',
        title: '驱动模块',
        desc: '驱动模块信息',
        feature: 'vol3v2-drivermodule',
        category: 'kernel'
      },
      {
        icon: '🔍',
        title: '驱动扫描',
        desc: '扫描驱动对象',
        feature: 'vol3v2-driverscan',
        category: 'kernel'
      },
      {
        icon: '💎',
        title: '处理器控制区域',
        desc: '处理器控制区域',
        feature: 'vol3v2-kpcrs',
        category: 'kernel'
      },
      {
        icon: '⏰',
        title: '内核定时器',
        desc: '内核定时器信息',
        feature: 'vol3v2-timers',
        category: 'kernel'
      },
      {
        icon: '🚀',
        title: 'MBR扫描',
        desc: '主引导记录扫描',
        feature: 'vol3v2-mbrscan',
        category: 'kernel'
      },

      // 服务分析类
      {
        icon: '⚙️',
        title: '服务列表',
        desc: '服务列表信息',
        feature: 'vol3v2-svclist',
        category: 'services'
      },
      {
        icon: '🔄',
        title: '服务差异',
        desc: '服务差异分析',
        feature: 'vol3v2-svcdiff',
        category: 'services'
      },
      {
        icon: '👥',
        title: '会话信息',
        desc: '会话信息分析',
        feature: 'vol3v2-sessions',
        category: 'services'
      },
    ];
  }

  static getConfig() {
    return {
      name: 'Volatility3',
      desc: '下一代内存分析框架 (内嵌CSV)',
      icon: '/assets/vol3.png',
      color: '#4ecdc4'
    };
  }

  /**
   * 判断是否是V2版本的功能
   */
  static isV2Feature(feature: string): boolean {
    return feature.startsWith('vol3v2-');
  }

  /**
   * 获取功能对应的Vol3插件映射
   */
  static getFeatureMapping(feature: string): Vol3FeatureMapping | null {
    return VOL3_FEATURE_MAP[feature] || null;
  }
}

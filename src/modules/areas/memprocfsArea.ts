import { FeatureConfig } from '../core/types';

export class MemProcFSArea {
  static getFeatures(): FeatureConfig[] {
    return [
      // 基础信息与系统态势感知
      {
        icon: '🖥️',
        title: '系统信息',
        desc: '获取操作系统基本配置、内核版本、内存和安全加固情况',
        feature: 'memprocfs-sys_info',
        category: 'system-info'
      },
      // 内存虚拟文件系统浏览
      {
        icon: '🗂️',
        title: '内存文件浏览器',
        desc: '树状浏览内存映射的虚拟文件系统，快速定位痕迹数据',
        feature: 'memory-file-browser',
        category: 'memory'
      },
      // 进程管理与分析
      {
        icon: '🧊',
        title: '进程信息',
        desc: '列出系统所有进程、父子关系、命令行，发现恶意进程',
        feature: 'memprocfs-proc_info',
        category: 'process'
      },
      //模块信息
      {
        icon: '🧩',
        title: '模块信息',
        desc: '列出系统所有模块、父子关系，发现恶意模块',
        feature: 'memprocfs-module_info',
        category: 'process'
      },
      // 网络连接分析
      {
        icon: '🌐',
        title: '网络信息',
        desc: '分析系统网络连接、监听端口、地址及协议',
        feature: 'memprocfs-net_info',
        category: 'network'
      },
      // 计划任务&自动化
      {
        icon: '📅',
        title: '任务列表',
        desc: '提取系统计划任务和自动执行程序，排查异常任务',
        feature: 'memprocfs-tasks',
        category: 'services'
      },
      // 驱动程序检测
      {
        icon: '🔩',
        title: '驱动程序',
        desc: '分析内核与用户态驱动模块，检测未知/未签名驱动',
        feature: 'memprocfs-drivers',
        category: 'security'
      },
      // 句柄信息分析
      {
        icon: '🪝',
        title: '句柄信息',
        desc: '枚举进程句柄表，查找进程间挂钩与注入行为',
        feature: 'memprocfs-handles',
        category: 'process'
      },
      // 服务管理分析
      {
        icon: '📡',
        title: '服务列表',
        desc: '展示系统服务加载状态、启动方式，检测后门服务',
        feature: 'memprocfs-services',
        category: 'services'
      },
      // DNS缓存与通信溯源
      {
        icon: '🧭',
        title: 'DNS解析',
        desc: '追踪系统DNS解析记录，发现C2通信域名',
        feature: 'memprocfs-netdns',
        category: 'network'
      },
      // 文件提取能力
      {
        icon: '📦',
        title: '内存文件',
        desc: '展示已导出的所有内存文件内容',
        feature: 'memprocfs-all_files',
        category: 'forensics'
      },
      // Yara规则主动威胁发现
      {
        icon: '🕵️‍♂️',
        title: 'Yara扫描',
        desc: '使用Yara规则对内存和文件进行恶意代码扫描',
        feature: 'memprocfs-yara_scan',
        category: 'security'
      },
      // Yara结果深度报告
      {
        icon: '📑',
        title: 'Yara详情',
        desc: '查看Yara扫描命中的规则、位置和样本摘要',
        feature: 'memprocfs-yara_detail',
        category: 'security'
      },
      // 恶意样本自动检测
      {
        icon: '🧬',
        title: '恶意软件检测',
        desc: '自动检测系统中的恶意样本和持久化植入项',
        feature: 'memprocfs-malware_detect',
        category: 'security'
      },
      // 日志导出
      {
        icon: '📜',
        title: '导出全部Eventlog',
        desc: '一键导出操作系统中的全部事件日志',
        feature: 'memprocfs-export_eventlog',
        category: 'forensics'
      },
      // 注册表导出
      {
        icon: '🗄️',
        title: '导出全部注册表',
        desc: '批量导出所有注册表配置',
        feature: 'memprocfs-export_registry',
        category: 'registry'
      },
      // 系统证书链导出
      {
        icon: '🎫',
        title: '导出全部证书',
        desc: '导出系统已安装的根证书、公钥和信任链',
        feature: 'memprocfs-export_certs',
        category: 'forensics'
      },
      // 产品ID、激活信息
      {
        icon: '🆔',
        title: '获取产品id',
        desc: '提取操作系统的产品标识、授权和激活信息',
        feature: 'memprocfs-product_id',
        category: 'system-info'
      },
      // 物理内存结构导出
      {
        icon: '🧬',
        title: '获取DTB',
        desc: '导出内存目录表基址（Directory Table Base）',
        feature: 'memprocfs-get_dtb',
        category: 'forensics'
      },

      // 时间线取证系列
      {
        icon: '📈',
        title: '网络时间线',
        desc: '梳理主机网络活动的全时序历史',
        feature: 'memprocfs-timeline_network',
        category: 'timeline'
      },
      {
        icon: '🗃️',
        title: 'NTFS文件时间线',
        desc: '分析NTFS文件系统的所有变更操作',
        feature: 'memprocfs-timeline_ntfs',
        category: 'timeline'
      },
      {
        icon: '⚡',
        title: '进程时间线',
        desc: '还原所有进程的启动、关闭、父子关系',
        feature: 'memprocfs-timeline_process',
        category: 'timeline'
      },
      {
        icon: '🌍',
        title: 'Web时间线',
        desc: '还原浏览器访问历史、Cookie、下载记录',
        feature: 'memprocfs-timeline_web',
        category: 'timeline'
      },
      {
        icon: '⏱️',
        title: '任务时间线',
        desc: '提取所有计划任务的变动与触发历史',
        feature: 'memprocfs-timeline_tasks',
        category: 'timeline'
      },
      {
        icon: '🗃️',
        title: '注册表时间线',
        desc: '展示注册表关键项的创建、修改、访问历史',
        feature: 'memprocfs-timeline_registry',
        category: 'timeline'
      },
      {
        icon: '🚀',
        title: 'Prefetch时间线',
        desc: '分析Prefetch文件加载历史',
        feature: 'memprocfs-timeline_prefetch',
        category: 'timeline'
      },
      // Bitlocker密钥导出
      {
        icon: '🛡️',
        title: 'Bitlocker密钥',
        desc: '识别并导出Bitlocker磁盘加密密钥',
        feature: 'memprocfs-bitlocker_key',
        category: 'forensics'
      },
      // 账户信息
      {
        icon: '🧑‍💼',
        title: '获取账户信息',
        desc: '提取操作系统中所有本地账户及其属性',
        feature: 'memprocfs-accounts',
        category: 'system-info'
      },
      // 活动日志
      {
        icon: '📊',
        title: '获取活动信息',
        desc: '分析用户操作活动记录',
        feature: 'memprocfs-activity',
        category: 'timeline'
      },
      // 文件分析
      {
        icon: '📁',
        title: '分析文件',
        desc: '列出与案情相关的所有采集文件',
        feature: 'memprocfs-analysis_file',
        category: 'filesystem'
      },
      // 应用兼容性
      {
        icon: '💾',
        title: '分析应用兼容性',
        desc: '解析系统AppCompat数据',
        feature: 'memprocfs-analysis_appcompat',
        category: 'forensics'
      },
      // 命令行分析
      {
        icon: '📜',
        title: '分析命令行',
        desc: '还原系统执行过的命令行参数',
        feature: 'memprocfs-analysis_cmdline',
        category: 'forensics'
      },
      // Crashdump分析
      {
        icon: '💥',
        title: '分析Crashdump',
        desc: '分析系统Crashdump文件',
        feature: 'memprocfs-analysis_crashdump',
        category: 'forensics'
      },
      // 环境变量
      {
        icon: '🌎',
        title: '分析环境变量',
        desc: '导出各种运行环境变量',
        feature: 'memprocfs-analysis_environ',
        category: 'system-info'
      },
      // Eventlog分析
      {
        icon: '📑',
        title: '分析Eventlog',
        desc: '分析系统安全、应用和系统事件日志',
        feature: 'memprocfs-analysis_eventlog',
        category: 'timeline'
      },
      // 浏览器扩展
      {
        icon: '🧩',
        title: '分析浏览器扩展',
        desc: '枚举各主流浏览器的已安装扩展',
        feature: 'memprocfs-analysis_extensions',
        category: 'browser-forensics'
      },
      // 浏览器配置
      {
        icon: '🌐',
        title: '分析浏览器配置',
        desc: '导出已安装浏览器的主页、代理、搜索等配置',
        feature: 'memprocfs-analysis_browser_config',
        category: 'browser-forensics'
      },
      // 补丁分析
      {
        icon: '🛠️',
        title: '分析补丁',
        desc: '识别系统已安装的补丁包',
        feature: 'memprocfs-analysis_patches',
        category: 'system-info'
      },
      // 系统策略
      {
        icon: '📋',
        title: '分析策略',
        desc: '提取Windows本地安全策略和组策略设置',
        feature: 'memprocfs-analysis_policies',
        category: 'system-info'
      },
      // 打印机分析
      {
        icon: '🖨️',
        title: '分析打印机',
        desc: '收集打印相关的设备及历史信息',
        feature: 'memprocfs-analysis_printers',
        category: 'system-info'
      },
      // 隐私分析
      {
        icon: '🙈',
        title: '分析隐私',
        desc: '检测用户隐私相关配置与使用痕迹',
        feature: 'memprocfs-analysis_privacy',
        category: 'system-info'
      },
      // 安全设置
      {
        icon: '🛡️',
        title: '分析安全',
        desc: '分析系统安全相关配置与日志',
        feature: 'memprocfs-analysis_security',
        category: 'security'
      },
      // 共享资源
      {
        icon: '🔗',
        title: '分析共享',
        desc: '定位网络和本地共享资源及其权限关系',
        feature: 'memprocfs-analysis_shares',
        category: 'network'
      },
      // Shimcache分析
      {
        icon: '🗂️',
        title: '分析Shimcache',
        desc: '解析系统Shimcache，识别近期执行的程序',
        feature: 'memprocfs-analysis_shimcache',
        category: 'forensics'
      },
      // 软件列表
      {
        icon: '📦',
        title: '分析软件',
        desc: '列出系统安装软件及其关键属性',
        feature: 'memprocfs-analysis_software',
        category: 'system-info'
      },
      // 启动项
      {
        icon: '🚦',
        title: '分析启动项',
        desc: '检测系统自动启动程序配置',
        feature: 'memprocfs-analysis_startup',
        category: 'system-info'
      },
      // 时区信息
      {
        icon: '⏰',
        title: '分析时区',
        desc: '导出系统当前和历史时区设置',
        feature: 'memprocfs-analysis_timezone',
        category: 'system-info'
      },
      // USB存储
      {
        icon: '💽',
        title: '分析USB存储',
        desc: '还原所有接入过的USB存储设备',
        feature: 'memprocfs-analysis_usbstor',
        category: 'forensics'
      },
      // WMI信息
      {
        icon: '🔗',
        title: '分析WMI',
        desc: '收集Windows Management Instrumentation管理对象信息',
        feature: 'memprocfs-analysis_wmi',
        category: 'system-info'
      },
      // 虚拟化
      {
        icon: '🥽',
        title: '分析虚拟化',
        desc: '检测主机与各类虚拟化环境信息',
        feature: 'memprocfs-analysis_virtualization',
        category: 'system-info'
      },
      // 无线网络
      {
        icon: '📡',
        title: '分析无线网络',
        desc: '列出并分析系统连接过的无线网络包括SSID、连接时间及安全性属性等。',
        feature: 'memprocfs-analysis_wireless',
        category: 'network'
      },
      // IE浏览器历史
      {
        icon: '🧭',
        title: 'IE浏览器历史',
        desc: '还原和分析Internet Explorer浏览器的历史记录',
        feature: 'memprocfs-analysis_ie_browser_history',
        category: 'browser-forensics'
      },
      // 国产浏览器（360/QQ/UC/2345等）
      {
        icon: '🌏',
        title: '国产浏览器配置',
        desc: '深入解析主流国产浏览器（如360、QQ、UC、2345等）的配置。',
        feature: 'memprocfs-analysis_chinabrowser',
        category: 'browser-forensics'
      },
      // 国产云盘（百度网盘、阿里云盘、迅雷）
      {
        icon: '☁️',
        title: '国产云盘配置',
        desc: '检测本地国产云盘（如百度网盘、阿里云盘、迅雷云盘等）的配置。',
        feature: 'memprocfs-analysis_chinacloud',
        category: 'forensics'
      },
      // 国产媒体娱乐App
      {
        icon: '🎬',
        title: '国产媒体娱乐应用配置',
        desc: '自动提取各类本地媒体与娱乐App（如视频/音乐播放器、直播软件等）的配置。',
        feature: 'memprocfs-analysis_chinamedia',
        category: 'forensics'
      },
      // 国产应用（钉钉/百度网盘/迅雷等）
      {
        icon: '📱',
        title: '国产应用软件配置',
        desc: '检测常见国产应用（如钉钉、百度网盘、迅雷等）的配置。',
        feature: 'memprocfs-analysis_chinaapp',
        category: 'forensics'
      },
      // 国产IM软件（QQ/WeChat/DingTalk等）
      {
        icon: '💬',
        title: '国产IM软件配置',
        desc: '还原国产即时通讯软件（如QQ、微信、钉钉等）的配置。',
        feature: 'memprocfs-analysis_chinaim',
        category: 'forensics'
      },
      // Google Chrome
      {
        icon: '🌐',
        title: 'Google Chrome浏览器配置',
        desc: '详细扫描Google Chrome浏览器的配置。',
        feature: 'memprocfs-analysis_chrome',
        category: 'browser-forensics'
      },
      // Firefox
      {
        icon: '🦊',
        title: 'Firefox浏览器配置',
        desc: '获取和解析Firefox浏览器中的配置。',
        feature: 'memprocfs-analysis_firefox',
        category: 'browser-forensics'
      },
      // 剪贴板
      {
        icon: '📋',
        title: '剪贴板历史与配置',
        desc: '提取操作系统剪贴板中内容',
        feature: 'memprocfs-analysis_clipboard',
        category: 'forensics'
      },
      // 下载管理器和浏览器下载
      {
        icon: '⬇️',
        title: '下载管理器及浏览器下载目录',
        desc: '统计本地下载管理器及各浏览器的下载目录',
        feature: 'memprocfs-analysis_download',
        category: 'browser-forensics'
      },
      // Edge
      {
        icon: '🅴',
        title: 'Edge浏览器配置',
        desc: '解析Microsoft Edge浏览器的配置。',
        feature: 'memprocfs-analysis_edge',
        category: 'browser-forensics'
      },
      // 文件关联
      {
        icon: '🗂️',
        title: '文件关联配置',
        desc: '检查操作系统常用文件类型与应用程序的关联关系，分析是否存在异常篡改（如以恶意程序替换正常文件打开方式等）。',
        feature: 'memprocfs-analysis_fileassoc',
        category: 'system-info'
      },
      // MRU
      {
        icon: '🔢',
        title: 'MRU（最近使用）配置',
        desc: '提取系统及各应用的最近使用（Most Recently Used, MRU）列表，追踪用户最近操作过的文档、文件夹与程序，辅助时间轴复原。',
        feature: 'memprocfs-analysis_mru',
        category: 'forensics'
      },
      // OneDrive
      {
        icon: '☁️',
        title: 'OneDrive配置',
        desc: '分析微软OneDrive云盘客户端的配置。',
        feature: 'memprocfs-analysis_onedrive',
        category: 'forensics'
      },
      // RDP
      {
        icon: '🖥️',
        title: 'RDP配置',
        desc: '提取Windows远程桌面（Remote Desktop Protocol）连接配置、历史登录主机、凭据信息和可疑远程操作行为。',
        feature: 'memprocfs-analysis_rdp',
        category: 'network'
      },
      // 最近打开的文档
      {
        icon: '📂',
        title: '分析最近打开的文档',
        desc: '汇总用户或系统近期访问过的文档、图片、表格等各类文件，便于快速重建用户操作时间线及查找重要数据。',
        feature: 'memprocfs-analysis_recently_opened_documents',
        category: 'forensics'
      },
      // RunMRU
      {
        icon: '🏃',
        title: 'RunMRU相关配置',
        desc: '检索Windows"运行"对话框输入历史，追踪用户手动启动过的程序及命令，为漏洞利用与痕迹溯源提供支撑。',
        feature: 'memprocfs-analysis_runmru',
        category: 'forensics'
      },
      // ShellBags
      {
        icon: '👜',
        title: 'ShellBags配置',
        desc: '恢复和分析ShellBags注册表项，追踪用户访问过的文件夹、移动存储设备使用历史，揭示潜在隐藏或已删除目录行为。',
        feature: 'memprocfs-analysis_shellbags',
        category: 'registry'
      },
      // TypedPaths
      {
        icon: '📁',
        title: 'TypedPaths配置',
        desc: '获取资源管理器地址栏输入的历史路径，辅助分析用户曾经直接访问的文件夹和网络位置。',
        feature: 'memprocfs-analysis_typedpaths',
        category: 'forensics'
      },
      // UserAssist
      {
        icon: '🧑‍💻',
        title: 'UserAssist配置',
        desc: '解码UserAssist注册表数据，提取用户交互过的应用程序统计与使用频次，还原桌面/菜单点击历史。',
        feature: 'memprocfs-analysis_userassist',
        category: 'forensics'
      },
      // WeChat
      {
        icon: '💬',
        title: 'WeChat相关配置',
        desc: '微信的配置',
        feature: 'memprocfs-analysis_wechat',
        category: 'forensics'
      },
      // Steam
      {
        icon: '🎮',
        title: 'Steam配置',
        desc: 'Steam的库存游戏等配置',
        feature: 'memprocfs-analysis_steam',
        category: 'forensics'
      },
      // Epic
      {
        icon: '🎮',
        title: 'Epic配置',
        desc: 'Epic的相关配置',
        feature: 'memprocfs-analysis_epic',
        category: 'forensics'
      },
      // WeGame
      {
        icon: '🎮',
        title: 'WeGame配置',
        desc: 'WeGame的相关配置',
        feature: 'memprocfs-analysis_wegame',
        category: 'forensics'
      },
      // 米哈游游戏
      {
        icon: '🎮',
        title: '米哈游游戏配置',
        desc: '米哈游游戏的相关配置',
        feature: 'memprocfs-analysis_mihoyo',
        category: 'forensics'
      },
    ];
  }

  static getConfig() {
    return {
      name: 'MemProcFS(手动版本)',
      desc: '内存进程文件系统',
      icon: '/assets/memprocfs.png',
      color: '#667eea'
    };
  }
} 
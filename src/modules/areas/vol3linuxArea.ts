import { FeatureInfo } from '../core/types';

export const vol3linuxFeatures: FeatureInfo[] = [
    // 系统基础信息
    { 
        id: 'vol3linux-banners', 
        name: '内核横幅(Banners)', 
        description: '检查内核横幅信息', 
        category: 'system-info' 
    },
    { 
        id: 'vol3linux-boottime', 
        name: '启动时间(Boot Time)', 
        description: '显示系统启动时间', 
        category: 'system-info' 
    },
    { 
        id: 'vol3linux-iomem', 
        name: 'IO内存映射(IO Memory)', 
        description: '列出系统IO内存映射', 
        category: 'system-info' 
    },
    { 
        id: 'vol3linux-vmcoreinfo', 
        name: 'VM核心信息(VM Core Info)', 
        description: '显示VM核心信息', 
        category: 'system-info' 
    },
    { 
        id: 'vol3linux-kmsg', 
        name: '内核消息(Kmsg)', 
        description: '提取内核消息', 
        category: 'system-info' 
    },
    { 
        id: 'vol3linux-kallsyms', 
        name: '内核符号表(Kallsyms)', 
        description: '显示内核符号表', 
        category: 'system-info' 
    },

    // 进程信息
    { 
        id: 'vol3linux-pslist', 
        name: '进程列表(Process List)', 
        description: '列出系统进程', 
        category: 'process' 
    },
    { 
        id: 'vol3linux-psscan', 
        name: '进程扫描(Process Scan)', 
        description: '扫描进程结构', 
        category: 'process' 
    },
    { 
        id: 'vol3linux-pstree', 
        name: '进程树(Process Tree)', 
        description: '显示进程树', 
        category: 'process' 
    },
    { 
        id: 'vol3linux-psaux', 
        name: '进程辅助信息(Process Aux)', 
        description: '显示进程辅助信息', 
        category: 'process' 
    },
    { 
        id: 'vol3linux-proc_maps', 
        name: '进程内存映射(Process Maps)', 
        description: '显示进程内存映射', 
        category: 'process' 
    },
    { 
        id: 'vol3linux-pscallstack', 
        name: '进程调用栈(Process Call Stack)', 
        description: '显示进程调用栈', 
        category: 'process' 
    },
    { 
        id: 'vol3linux-pidhashtable', 
        name: 'PID哈希表(PID Hash Table)', 
        description: '显示PID哈希表', 
        category: 'process' 
    },
    { 
        id: 'vol3linux-capabilities', 
        name: '进程权限(Capabilities)', 
        description: '显示进程权限', 
        category: 'process' 
    },
    { 
        id: 'vol3linux-ptrace', 
        name: 'Ptrace调试', 
        description: '检查ptrace关系', 
        category: 'process' 
    },

    // 用户与环境
    { 
        id: 'vol3linux-bash', 
        name: 'Bash历史(Bash History)', 
        description: '提取bash历史记录', 
        category: 'forensics' 
    },
    { 
        id: 'vol3linux-envars', 
        name: '环境变量(Environment Variables)', 
        description: '显示环境变量', 
        category: 'system-info' 
    },

    // 网络与通信
    { 
        id: 'vol3linux-ip_addr', 
        name: 'IP地址(IP Address)', 
        description: '显示网络接口IP地址', 
        category: 'network' 
    },
    { 
        id: 'vol3linux-ip_link', 
        name: 'IP链路(IP Link)', 
        description: '显示网络接口链路信息', 
        category: 'network' 
    },
    { 
        id: 'vol3linux-sockstat', 
        name: '套接字状态(Socket Status)', 
        description: '显示套接字状态', 
        category: 'network' 
    },

    // 文件系统
    { 
        id: 'vol3linux-mountinfo', 
        name: '挂载信息(Mount Info)', 
        description: '显示挂载点信息', 
        category: 'filesystem' 
    },
    { 
        id: 'vol3linux-lsof', 
        name: '打开文件(List Open Files)', 
        description: '列出打开的文件', 
        category: 'filesystem' 
    },
    { 
        id: 'vol3linux-pagecache_files', 
        name: '页面缓存文件(Page Cache Files)', 
        description: '显示页面缓存中的文件', 
        category: 'filesystem' 
    },
    { 
        id: 'vol3linux-pagecache_inodepages', 
        name: '页面缓存Inode页面(Page Cache Inode Pages)', 
        description: '显示页面缓存inode页面', 
        category: 'filesystem' 
    },
    { 
        id: 'vol3linux-pagecache_recoverfs', 
        name: '页面缓存恢复文件系统(Page Cache Recover FS)', 
        description: '从页面缓存恢复文件系统', 
        category: 'filesystem' 
    },

    // 内核与模块
    { 
        id: 'vol3linux-elfs', 
        name: 'ELF文件(ELF Files)', 
        description: '列出内存中的ELF文件', 
        category: 'kernel' 
    },
    { 
        id: 'vol3linux-lsmod', 
        name: '模块列表(List Modules)', 
        description: '列出加载的内核模块', 
        category: 'kernel' 
    },
    { 
        id: 'vol3linux-kthreads', 
        name: '内核线程(Kernel Threads)', 
        description: '显示内核线程', 
        category: 'kernel' 
    },
    { 
        id: 'vol3linux-module_extract', 
        name: '模块提取(Module Extract)', 
        description: '提取内核模块', 
        category: 'kernel' 
    },
    { 
        id: 'vol3linux-modxview', 
        name: '模块查看器(Module XView)', 
        description: '查看模块详细信息', 
        category: 'kernel' 
    },
    { 
        id: 'vol3linux-library_list', 
        name: '库列表(Library List)', 
        description: '列出共享库', 
        category: 'kernel' 
    },

    // 图形和输入
    { 
        id: 'vol3linux-fbdev', 
        name: '帧缓冲设备(Frame Buffer)', 
        description: '显示帧缓冲设备信息', 
        category: 'gui' 
    },

    // 跟踪与性能
    { 
        id: 'vol3linux-ebpf', 
        name: 'eBPF程序(eBPF)', 
        description: '显示eBPF程序', 
        category: 'kernel' 
    },
    { 
        id: 'vol3linux-ftrace', 
        name: 'Ftrace跟踪(Ftrace)', 
        description: '检查ftrace跟踪', 
        category: 'kernel' 
    },
    { 
        id: 'vol3linux-perf_events', 
        name: '性能事件(Perf Events)', 
        description: '显示性能事件', 
        category: 'kernel' 
    },
    { 
        id: 'vol3linux-tracepoints', 
        name: '跟踪点(Tracepoints)', 
        description: '显示跟踪点', 
        category: 'kernel' 
    },

    // Malware分析（新版本）
    { 
        id: 'vol3linux-malware_check_afinfo', 
        name: '恶意软件-检查地址族(Malware - Check AF Info)', 
        description: '检查地址族信息', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_check_creds', 
        name: '恶意软件-检查凭据(Malware - Check Credentials)', 
        description: '检查进程凭据共享', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_check_idt', 
        name: '恶意软件-检查IDT(Malware - Check IDT)', 
        description: '检查中断描述符表篡改', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_check_syscall', 
        name: '恶意软件-检查系统调用(Malware - Check Syscall)', 
        description: '检查系统调用表钩子', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_check_modules', 
        name: '恶意软件-检查模块(Malware - Check Modules)', 
        description: '比较模块列表与sysfs信息', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_hidden_modules', 
        name: '恶意软件-隐藏模块(Malware - Hidden Modules)', 
        description: '扫描内存查找隐藏内核模块', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_keyboard_notifiers', 
        name: '恶意软件-键盘通知器(Malware - Keyboard Notifiers)', 
        description: '解析键盘通知器调用链', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_malfind', 
        name: '恶意软件-Malfind(Malware - Malfind)', 
        description: '查找包含注入代码的进程内存', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_modxview', 
        name: '恶意软件-模块查看器(Malware - Mod XView)', 
        description: '集中展示模块存在和污染信息', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_netfilter', 
        name: '恶意软件-Netfilter(Malware - Netfilter)', 
        description: '列出Netfilter钩子', 
        category: 'malware' 
    },
    { 
        id: 'vol3linux-malware_tty_check', 
        name: '恶意软件-TTY检查(Malware - TTY Check)', 
        description: '检查TTY设备钩子', 
        category: 'malware' 
    },
];

export default vol3linuxFeatures;

import { FeatureConfig } from '../core/types';

export class Volatility3Area {
  static getFeatures(): FeatureConfig[] {
    return [
      // 系统信息类
      { 
        icon: '⚡', 
        title: 'windows.info', 
        desc: '获取Windows系统信息和版本详情', 
        feature: 'vol3-info',
        category: 'system-info'
      },
      { 
        icon: '📋', 
        title: 'windows.crashinfo', 
        desc: '提取系统崩溃信息和错误详情', 
        feature: 'vol3-crashinfo',
        category: 'system-info'
      },
      { 
        icon: '📊', 
        title: 'windows.statistics', 
        desc: '生成内存使用统计信息', 
        feature: 'vol3-statistics',
        category: 'system-info'
      },
      { 
        icon: 'ℹ️', 
        title: 'windows.verinfo', 
        desc: '版本信息分析', 
        feature: 'vol3-verinfo',
        category: 'system-info'
      },
      { 
        icon: '🎋', 
        title: 'banners', 
        desc: '显示系统标识信息', 
        feature: 'vol3-banners',
        category: 'system-info'
      },

      // 进程分析类
      { 
        icon: '📋', 
        title: 'windows.pslist', 
        desc: '高性能进程列表分析', 
        feature: 'vol3-pslist',
        category: 'process'
      },
      { 
        icon: '🔍', 
        title: 'windows.pstree', 
        desc: '进程树结构可视化分析', 
        feature: 'vol3-pstree',
        category: 'process'
      },
      { 
        icon: '🔎', 
        title: 'windows.psscan', 
        desc: '扫描进程结构体', 
        feature: 'vol3-psscan',
        category: 'process'
      },
      { 
        icon: '🌳', 
        title: 'windows.psxview', 
        desc: '进程交叉视图分析', 
        feature: 'vol3-psxview',
        category: 'process'
      },
      { 
        icon: '⌨️', 
        title: 'windows.cmdline', 
        desc: '显示进程命令行参数', 
        feature: 'vol3-cmdline',
        category: 'process'
      },
      { 
        icon: '🌱', 
        title: 'windows.envars', 
        desc: '显示进程环境变量', 
        feature: 'vol3-envars',
        category: 'process'
      },
      { 
        icon: '🎯', 
        title: 'windows.handles', 
        desc: '系统句柄和对象分析', 
        feature: 'vol3-handles',
        category: 'process'
      },
      { 
        icon: '🔗', 
        title: 'windows.joblinks', 
        desc: '作业对象链接分析', 
        feature: 'vol3-joblinks',
        category: 'process'
      },
      { 
        icon: '🧵', 
        title: 'windows.threads', 
        desc: '线程信息分析', 
        feature: 'vol3-threads',
        category: 'process'
      },
      { 
        icon: '🔍', 
        title: 'windows.thrdscan', 
        desc: '扫描线程结构体', 
        feature: 'vol3-thrdscan',
        category: 'process'
      },
      { 
        icon: '⏸️', 
        title: 'windows.suspended_threads', 
        desc: '检测挂起的线程', 
        feature: 'vol3-suspended_threads',
        category: 'process'
      },
      { 
        icon: '👻', 
        title: 'windows.hollowprocesses', 
        desc: '检测进程镂空技术', 
        feature: 'vol3-hollowprocesses',
        category: 'process'
      },
      { 
        icon: '👻', 
        title: 'windows.processghosting', 
        desc: '检测进程镜像替换', 
        feature: 'vol3-processghosting',
        category: 'process'
      },
      { 
        icon: '🛡️', 
        title: 'windows.privileges', 
        desc: '进程权限和特权分析', 
        feature: 'vol3-privileges',
        category: 'process'
      },

      // 内存分析类
      { 
        icon: '📚', 
        title: 'windows.modules', 
        desc: '显示内核模块列表', 
        feature: 'vol3-modules',
        category: 'memory'
      },
      { 
        icon: '🔍', 
        title: 'windows.modscan', 
        desc: '扫描内核模块', 
        feature: 'vol3-modscan',
        category: 'memory'
      },
      { 
        icon: '📦', 
        title: 'windows.unloadedmodules', 
        desc: '显示已卸载的模块', 
        feature: 'vol3-unloadedmodules',
        category: 'memory'
      },
      { 
        icon: '📚', 
        title: 'windows.dlllist', 
        desc: '列出进程加载的DLL模块', 
        feature: 'vol3-dlllist',
        category: 'memory'
      },
      { 
        icon: '📖', 
        title: 'windows.ldrmodules', 
        desc: '比较不同模块列表', 
        feature: 'vol3-ldrmodules',
        category: 'memory'
      },
      { 
        icon: '🗺️', 
        title: 'windows.vadinfo', 
        desc: '显示虚拟地址描述符信息', 
        feature: 'vol3-vadinfo',
        category: 'memory'
      },
      { 
        icon: '🚶', 
        title: 'windows.vadwalk', 
        desc: '遍历虚拟地址空间', 
        feature: 'vol3-vadwalk',
        category: 'memory'
      },
      { 
        icon: '🔎', 
        title: 'windows.vadregexscan', 
        desc: '在VAD中进行正则扫描', 
        feature: 'vol3-vadregexscan',
        category: 'memory'
      },
      { 
        icon: '🌊', 
        title: 'windows.bigpools', 
        desc: '显示大内存池分配', 
        feature: 'vol3-bigpools',
        category: 'memory'
      },
      { 
        icon: '🔍', 
        title: 'windows.poolscanner', 
        desc: '内存池扫描工具', 
        feature: 'vol3-poolscanner',
        category: 'memory'
      },
      { 
        icon: '🗺️', 
        title: 'windows.virtmap', 
        desc: '虚拟内存映射', 
        feature: 'vol3-virtmap',
        category: 'memory'
      },

      // 网络分析类
      { 
        icon: '🌐', 
        title: 'windows.netstat', 
        desc: '网络连接状态深度分析', 
        feature: 'vol3-netstat',
        category: 'network'
      },
      { 
        icon: '🔍', 
        title: 'windows.netscan', 
        desc: '扫描网络连接信息', 
        feature: 'vol3-netscan',
        category: 'network'
      },

      // 文件系统类
      { 
        icon: '🗂️', 
        title: 'windows.filescan', 
        desc: '文件系统对象扫描分析', 
        feature: 'vol3-filescan',
        category: 'filesystem'
      },
      { 
        icon: '🔍', 
        title: 'windows.symlinkscan', 
        desc: '扫描符号链接', 
        feature: 'vol3-symlinkscan',
        category: 'filesystem'
      },

      // 注册表类
      { 
        icon: '📋', 
        title: 'windows.registry.hivelist', 
        desc: '列出注册表配置单元', 
        feature: 'vol3-registry.hivelist',
        category: 'registry'
      },
      { 
        icon: '🔍', 
        title: 'windows.registry.hivescan', 
        desc: '扫描注册表配置单元', 
        feature: 'vol3-registry.hivescan',
        category: 'registry'
      },
      { 
        icon: '🔑', 
        title: 'windows.registry.printkey', 
        desc: '打印注册表项', 
        feature: 'vol3-registry.printkey',
        category: 'registry'
      },
      { 
        icon: '🔑', 
        title: 'printkey', 
        desc: '打印指定注册表键值', 
        feature: 'vol3-printkey',
        category: 'registry'
      },
      { 
        icon: '📜', 
        title: 'windows.registry.certificates', 
        desc: '提取注册表证书', 
        feature: 'vol3-registry.certificates',
        category: 'registry'
      },
      { 
        icon: '👤', 
        title: 'windows.registry.userassist', 
        desc: '用户辅助活动记录', 
        feature: 'vol3-registry.userassist',
        category: 'registry'
      },
      { 
        icon: '🔧', 
        title: 'windows.registry.getcellroutine', 
        desc: '获取注册表单元例程', 
        feature: 'vol3-registry.getcellroutine',
        category: 'registry'
      },
      { 
        icon: '🔄', 
        title: 'windows.shimcachemem', 
        desc: '内存中的应用兼容缓存', 
        feature: 'vol3-shimcachemem',
        category: 'registry'
      },

      // 安全分析类
      { 
        icon: '🔒', 
        title: 'windows.malfind', 
        desc: '先进恶意代码检测算法', 
        feature: 'vol3-malfind',
        category: 'security'
      },
      { 
        icon: '🔐', 
        title: 'windows.hashdump', 
        desc: '转储密码哈希', 
        feature: 'vol3-hashdump',
        category: 'security'
      },
      { 
        icon: '🗃️', 
        title: 'windows.cachedump', 
        desc: '转储域缓存凭据', 
        feature: 'vol3-cachedump',
        category: 'security'
      },
      { 
        icon: '🔑', 
        title: 'windows.lsadump', 
        desc: '转储LSA密钥', 
        feature: 'vol3-lsadump',
        category: 'security'
      },
      { 
        icon: '🆔', 
        title: 'windows.getsids', 
        desc: '获取安全标识符', 
        feature: 'vol3-getsids',
        category: 'security'
      },
      { 
        icon: '⚙️', 
        title: 'windows.getservicesids', 
        desc: '获取服务SID', 
        feature: 'vol3-getservicesids',
        category: 'security'
      },
      { 
        icon: '🔍', 
        title: 'windows.skeleton_key_check', 
        desc: '检测骨架密钥攻击', 
        feature: 'vol3-skeleton_key_check',
        category: 'security'
      },
      { 
        icon: '🔒', 
        title: 'windows.truecrypt.Passphrase', 
        desc: 'TrueCrypt加密检测', 
        feature: 'vol3-truecrypt',
        category: 'security'
      },
      { 
        icon: '🕵️', 
        title: 'windows.suspicious_threads', 
        desc: '检测可疑线程', 
        feature: 'vol3-suspicious_threads',
        category: 'security'
      },
      { 
        icon: '🔒', 
        title: 'windows.mutantscan', 
        desc: '扫描互斥体对象', 
        feature: 'vol3-mutantscan',
        category: 'security'
      },

      // 内核分析类
      { 
        icon: '📞', 
        title: 'windows.callbacks', 
        desc: '显示回调函数信息', 
        feature: 'vol3-callbacks',
        category: 'kernel'
      },
      { 
        icon: '🔧', 
        title: 'windows.ssdt', 
        desc: '系统服务描述符表', 
        feature: 'vol3-ssdt',
        category: 'kernel'
      },
      { 
        icon: '🏗️', 
        title: 'windows.iat', 
        desc: '导入地址表分析', 
        feature: 'vol3-iat',
        category: 'kernel'
      },
      { 
        icon: '📊', 
        title: 'windows.direct_system_calls', 
        desc: '检测直接系统调用', 
        feature: 'vol3-direct_system_calls',
        category: 'kernel'
      },
      { 
        icon: '🔀', 
        title: 'windows.indirect_system_calls', 
        desc: '检测间接系统调用', 
        feature: 'vol3-indirect_system_calls',
        category: 'kernel'
      },
      { 
        icon: '🌳', 
        title: 'windows.devicetree', 
        desc: '设备树结构分析', 
        feature: 'vol3-devicetree',
        category: 'kernel'
      },
      { 
        icon: '🚗', 
        title: 'windows.driverirp', 
        desc: '驱动IRP处理分析', 
        feature: 'vol3-driverirp',
        category: 'kernel'
      },
      { 
        icon: '🔧', 
        title: 'windows.drivermodule', 
        desc: '驱动模块信息', 
        feature: 'vol3-drivermodule',
        category: 'kernel'
      },
      { 
        icon: '🔍', 
        title: 'windows.driverscan', 
        desc: '扫描驱动对象', 
        feature: 'vol3-driverscan',
        category: 'kernel'
      },
      { 
        icon: '💎', 
        title: 'windows.kpcrs', 
        desc: '处理器控制区域', 
        feature: 'vol3-kpcrs',
        category: 'kernel'
      },
      { 
        icon: '⏰', 
        title: 'windows.timers', 
        desc: '内核定时器信息', 
        feature: 'vol3-timers',
        category: 'kernel'
      },
      { 
        icon: '🚀', 
        title: 'windows.mbrscan', 
        desc: '主引导记录扫描', 
        feature: 'vol3-mbrscan',
        category: 'kernel'
      },

      // GUI分析类
      { 
        icon: '🪟', 
        title: 'windows.windows.Windows', 
        desc: '窗口信息分析', 
        feature: 'vol3-windows',
        category: 'gui'
      },
      { 
        icon: '🖥️', 
        title: 'windows.deskscan', 
        desc: '桌面对象扫描', 
        feature: 'vol3-deskscan',
        category: 'gui'
      },
      { 
        icon: '🖼️', 
        title: 'windows.desktops', 
        desc: '桌面信息分析', 
        feature: 'vol3-desktops',
        category: 'gui'
      },
      { 
        icon: '🚉', 
        title: 'windows.windowstations', 
        desc: '窗口站信息', 
        feature: 'vol3-windowstations',
        category: 'gui'
      },

      // 服务分析类
      { 
        icon: '⚙️', 
        title: 'windows.svclist', 
        desc: '服务列表信息', 
        feature: 'vol3-svclist',
        category: 'services'
      },
      { 
        icon: '🔄', 
        title: 'windows.svcdiff', 
        desc: '服务差异分析', 
        feature: 'vol3-svcdiff',
        category: 'services'
      },
      { 
        icon: '👥', 
        title: 'windows.sessions', 
        desc: '会话信息分析', 
        feature: 'vol3-sessions',
        category: 'services'
      }
    ];
  }

  static getConfig() {
    return {
      name: 'Volatility3(手动版本)',
      desc: '下一代内存分析框架',
      icon: '/assets/vol3.png',
      color: '#4ecdc4',

    };
  }

  static renderAdvancedPanel(): string {
    return `
      <div class="advanced-vol3-panel">
        <div class="panel-section">
          <h4>🔧 高级配置</h4>
          <div class="vol3-options">
            <label class="config-item">
              <input type="checkbox" id="vol3-parallel"> 并行处理
            </label>
            <label class="config-item">
              <input type="checkbox" id="vol3-cache"> 智能缓存
            </label>
            <label class="config-item">
              <input type="checkbox" id="vol3-autodetect"> 自动检测
            </label>
          </div>
        </div>
        <div class="panel-section">
          <h4>⚡ 性能优化</h4>
          <div class="performance-options">
            <label>线程数: <input type="range" min="1" max="16" value="4" class="thread-slider"></label>
            <label>内存限制: <select class="memory-limit">
              <option value="1GB">1GB</option>
              <option value="2GB">2GB</option>
              <option value="4GB" selected>4GB</option>
              <option value="8GB">8GB</option>
            </select></label>
          </div>
        </div>
      </div>
    `;
  }
} 
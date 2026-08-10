import { FeatureConfig } from '../core/types';

export class Volatility2Area {
  static getFeatures(): FeatureConfig[] {
    return [
      // 系统信息类
      { 
        icon: '🖥️', 
        title: 'imageinfo', 
        desc: '获取内存镜像的基本信息和元数据', 
        feature: 'vol2-imageinfo',
        category: 'system-info'
      },
      { 
        icon: 'ℹ️', 
        title: 'verinfo', 
        desc: '显示版本信息', 
        feature: 'vol2-verinfo',
        category: 'system-info'
      },
      { 
        icon: '⏹️', 
        title: 'shutdowntime', 
        desc: '获取系统关机时间', 
        feature: 'vol2-shutdowntime',
        category: 'system-info'
      },
      { 
        icon: '⚛️', 
        title: 'atoms', 
        desc: '显示原子表信息', 
        feature: 'vol2-atoms',
        category: 'system-info'
      },
      { 
        icon: '🔬', 
        title: 'atomscan', 
        desc: '扫描原子表', 
        feature: 'vol2-atomscan',
        category: 'system-info'
      },
      {
        icon: '📦',
        title: 'vboxinfo',
        desc: '获取VirtualBox内存镜像信息',
        feature: 'vol2-vboxinfo',
        category: 'system-info'
      },

      // 进程分析类
      { 
        icon: '📋', 
        title: 'pslist', 
        desc: '列出所有活动进程及其详细信息', 
        feature: 'vol2-pslist',
        category: 'process'
      },
      { 
        icon: '🔍', 
        title: 'psscan', 
        desc: '扫描内存中的进程结构体', 
        feature: 'vol2-psscan',
        category: 'process'
      },
      { 
        icon: '👁️', 
        title: 'psxview', 
        desc: '交叉验证进程列表的完整性', 
        feature: 'vol2-psxview',
        category: 'process'
      },
      { 
        icon: '🎯', 
        title: 'handles', 
        desc: '显示进程的句柄信息', 
        feature: 'vol2-handles',
        category: 'process'
      },
      { 
        icon: '🔑', 
        title: 'privs', 
        desc: '显示进程的权限信息', 
        feature: 'vol2-privs',
        category: 'process'
      },
      { 
        icon: '⌨️', 
        title: 'cmdline', 
        desc: '显示进程的命令行参数', 
        feature: 'vol2-cmdline',
        category: 'process'
      },
      { 
        icon: '🔎', 
        title: 'cmdscan', 
        desc: '扫描命令行历史', 
        feature: 'vol2-cmdscan',
        category: 'process'
      },
      { 
        icon: '💻', 
        title: 'consoles', 
        desc: '提取控制台缓冲区信息', 
        feature: 'vol2-consoles',
        category: 'process'
      },
      { 
        icon: '🌱', 
        title: 'envars', 
        desc: '显示进程的环境变量', 
        feature: 'vol2-envars',
        category: 'process'
      },
      { 
        icon: '📚', 
        title: 'dlllist', 
        desc: '列出进程加载的DLL模块', 
        feature: 'vol2-dlllist',
        category: 'process'
      },

      // 内存分析类
      { 
        icon: '🗺️', 
        title: 'vadinfo', 
        desc: '显示虚拟地址描述符信息', 
        feature: 'vol2-vadinfo',
        category: 'memory'
      },
      { 
        icon: '🧩', 
        title: 'modules', 
        desc: '显示内核模块列表', 
        feature: 'vol2-modules',
        category: 'memory'
      },
      { 
        icon: '📦', 
        title: 'unloadedmodules', 
        desc: '显示已卸载的模块', 
        feature: 'vol2-unloadedmodules',
        category: 'memory'
      },
      { 
        icon: '🏊', 
        title: 'bigpools', 
        desc: '显示大池分配信息', 
        feature: 'vol2-bigpools',
        category: 'memory'
      },

      // 网络分析类
      { 
        icon: '🌐', 
        title: 'netscan', 
        desc: '扫描网络连接和套接字信息', 
        feature: 'vol2-netscan',
        category: 'network'
      },

      // 文件系统类
      { 
        icon: '🗂️', 
        title: 'filescan', 
        desc: '扫描文件对象和文件句柄', 
        feature: 'vol2-filescan',
        category: 'filesystem'
      },
      { 
        icon: '🗃️', 
        title: 'mftparser', 
        desc: '解析NTFS主文件表', 
        feature: 'vol2-mftparser',
        category: 'filesystem'
      },
      { 
        icon: '🏠', 
        title: 'shellbags', 
        desc: '提取Shell文件夹信息', 
        feature: 'vol2-shellbags',
        category: 'filesystem'
      },

      // 注册表类
      { 
        icon: '📜', 
        title: 'printkey', 
        desc: '打印注册表键值', 
        feature: 'vol2-printkey',
        category: 'registry'
      },
      { 
        icon: '💿', 
        title: 'dumpregistry', 
        desc: '转储注册表内容', 
        feature: 'vol2-dumpregistry',
        category: 'registry'
      },
      { 
        icon: '🔄', 
        title: 'shimcache', 
        desc: '提取应用程序兼容性缓存', 
        feature: 'vol2-shimcache',
        category: 'registry'
      },
      { 
        icon: '🔐', 
        title: 'auditpol', 
        desc: '提取审计策略信息', 
        feature: 'vol2-auditpol',
        category: 'registry'
      },
      { 
        icon: '👤', 
        title: 'userassist', 
        desc: '提取用户活动记录', 
        feature: 'vol2-userassist',
        category: 'registry'
      },

      // 安全分析类
      { 
        icon: '🔐', 
        title: 'hashdump', 
        desc: '提取系统密码哈希值', 
        feature: 'vol2-hashdump',
        category: 'security'
      },
      { 
        icon: '🔒', 
        title: 'malfind', 
        desc: '检测隐藏和注入的代码', 
        feature: 'vol2-malfind',
        category: 'security'
      },
      { 
        icon: '🪝', 
        title: 'apihooks', 
        desc: '检测API钩子', 
        feature: 'vol2-apihooks',
        category: 'security'
      },
      { 
        icon: '🔐', 
        title: 'mutantscan', 
        desc: '扫描互斥体对象', 
        feature: 'vol2-mutantscan',
        category: 'security'
      },
      { 
        icon: '📡', 
        title: 'eventhooks', 
        desc: '检测事件钩子', 
        feature: 'vol2-eventhooks',
        category: 'security'
      },
      { 
        icon: '💬', 
        title: 'messagehooks', 
        desc: '检测消息钩子', 
        feature: 'vol2-messagehooks',
        category: 'security'
      },
      { 
        icon: '🔗', 
        title: 'symlinkscan', 
        desc: '扫描符号链接', 
        feature: 'vol2-symlinkscan',
        category: 'security'
      },
      { 
        icon: '🔒', 
        title: 'truecryptsummary', 
        desc: '提取TrueCrypt加密信息', 
        feature: 'vol2-truecryptsummary',
        category: 'security'
      },
      {
        icon: '🔑', 
        title: 'truecryptmaster', 
        desc: '提取TrueCrypt主密码', 
        feature: 'vol2-truecryptmaster',
        category: 'security'
      },
      { 
        icon: '🔑', 
        title: 'truecryptpassphrase', 
        desc: '提取TrueCrypt密码短语', 
        feature: 'vol2-truecryptpassphrase',
        category: 'security'
      },

      // 内核分析类
      { 
        icon: '🔧', 
        title: 'ssdt', 
        desc: '显示系统服务描述符表', 
        feature: 'vol2-ssdt',
        category: 'kernel'
      },
      { 
        icon: '⏰', 
        title: 'timers', 
        desc: '显示内核定时器信息', 
        feature: 'vol2-timers',
        category: 'kernel'
      },
      { 
        icon: '🎨', 
        title: 'gditimers', 
        desc: '显示GDI定时器信息', 
        feature: 'vol2-gditimers',
        category: 'kernel'
      },
      { 
        icon: '🚗', 
        title: 'driverscan', 
        desc: '扫描驱动程序对象', 
        feature: 'vol2-driverscan',
        category: 'kernel'
      },
      { 
        icon: '📞', 
        title: 'driverirp', 
        desc: '显示驱动程序IRP信息', 
        feature: 'vol2-driverirp',
        category: 'kernel'
      },
      { 
        icon: '📞', 
        title: 'callbacks', 
        desc: '显示回调函数信息', 
        feature: 'vol2-callbacks',
        category: 'kernel'
      },

      // GUI分析类
      { 
        icon: '🪟', 
        title: 'windows', 
        desc: '列出窗口信息', 
        feature: 'vol2-windows',
        category: 'gui'
      },
      { 
        icon: '🌳', 
        title: 'wintree', 
        desc: '显示窗口层次结构', 
        feature: 'vol2-wintree',
        category: 'gui'
      },
      { 
        icon: '🖥️', 
        title: 'deskscan', 
        desc: '扫描桌面对象', 
        feature: 'vol2-deskscan',
        category: 'gui'
      },
      { 
        icon: '👥', 
        title: 'session', 
        desc: '显示会话信息', 
        feature: 'vol2-session',
        category: 'gui'
      },
      { 
        icon: '📋', 
        title: 'clipboard', 
        desc: '提取剪贴板内容', 
        feature: 'vol2-clipboard',
        category: 'gui'
      },
      { 
        icon: '✏️', 
        title: 'editbox', 
        desc: '提取编辑框内容', 
        feature: 'vol2-editbox',
        category: 'gui'
      },
      //mimikatz
      { 
        icon: '🔑', 
        title: 'mimikatz', 
        desc: '提取密码和哈希值', 
        feature: 'vol2-mimikatz',
        category: 'security'
      },

      // 服务分析类
      { 
        icon: '⚙️', 
        title: 'svcscan', 
        desc: '扫描Windows服务信息', 
        feature: 'vol2-svcscan',
        category: 'services'
      },

      // 浏览器取证类
      { 
        icon: '🌐', 
        title: 'iehistory', 
        desc: '提取IE浏览器历史记录', 
        feature: 'vol2-iehistory',
        category: 'browser-forensics'
      },
      { 
        icon: '🎯', 
        title: 'chromehistory', 
        desc: '提取Chrome浏览器历史记录', 
        feature: 'vol2-chromehistory',
        category: 'browser-forensics'
      },
      { 
        icon: '🦊', 
        title: 'firefoxhistory', 
        desc: '提取Firefox浏览器历史记录', 
        feature: 'vol2-firefoxhistory',
        category: 'browser-forensics'
      },

      // 时间线分析类
      { 
        icon: '📅', 
        title: 'timeliner', 
        desc: '生成系统活动时间线', 
        feature: 'vol2-timeliner',
        category: 'timeline'
      }
    ];
  }

  static getConfig() {
    return {
      name: 'Volatility2(手动版本)',
      desc: 'Vol2内存分析框架',
      icon: '/assets/vol2.png',
      color: '#ff6b6b',

    };
  }

  static renderAdvancedPanel(): string {
    return `
      <div class="advanced-vol2-panel">
        <div class="panel-section">
          <h4>🔧 分析选项</h4>
          <div class="analysis-options">
            <select class="profile-select">
              <option value="Win7SP1x64">Win7SP1x64</option>
              <option value="Win7SP1x86">Win7SP1x86</option>
              <option value="Win10x64">Win10x64</option>
              <option value="WinXPSP2x86">WinXPSP2x86</option>
            </select>
            <label class="config-item">
              <input type="checkbox" id="vol2-verbose"> 详细输出
            </label>
          </div>
        </div>
        <div class="panel-section">
          <h4>📊 输出格式</h4>
          <div class="output-options">
            <label><input type="radio" name="format" value="text" checked> 文本</label>
            <label><input type="radio" name="format" value="json"> JSON</label>
            <label><input type="radio" name="format" value="xlsx"> Excel</label>
          </div>
        </div>
      </div>
    `;
  }

  static renderFeatureConfig(feature: string): string {
    const configs: { [key: string]: string } = {
      'imageinfo': `
        <div class="feature-config">
          <h4>🖥️ 镜像信息配置</h4>
          <div class="config-row">
            <label>Profile:</label>
            <select>
              <option value="auto" selected>自动检测</option>
              <option value="Win7SP1x64">Win7SP1x64</option>
              <option value="Win10x64">Win10x64</option>
            </select>
          </div>
          <div class="config-row">
            <label class="checkbox-label">
              <input type="checkbox" checked> 详细信息
            </label>
          </div>
        </div>
      `,
      'pslist': `
        <div class="feature-config">
          <h4>📋 进程列表配置</h4>
          <div class="config-row">
            <label>输出格式:</label>
            <select>
              <option value="table" selected>表格</option>
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div class="config-row">
            <label class="checkbox-label">
              <input type="checkbox"> 显示完整路径
            </label>
          </div>
        </div>
      `
    };
    
    return configs[feature] || `
      <div class="feature-config">
        <h4>⚙️ ${feature} 配置</h4>
        <div class="config-row">
          <label class="checkbox-label">
            <input type="checkbox" checked> 详细输出
          </label>
        </div>
        <div class="config-row">
          <label class="checkbox-label">
            <input type="checkbox"> 保存到文件
          </label>
        </div>
      </div>
    `;
  }
} 
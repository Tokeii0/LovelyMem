import { FeatureConfig } from '../core/types';

export class Volatility2LinuxArea {
  static getFeatures(): FeatureConfig[] {
    return [
      { 
        icon: '🐧', 
        title: 'linux_banner', 
        desc: '获取Linux内核版本和系统信息', 
        feature: 'banner',
        category: 'info'
      },
      { 
        icon: '📋', 
        title: 'linux_pslist', 
        desc: '列出Linux系统进程信息', 
        feature: 'pslist_linux',
        category: 'process'
      },
      { 
        icon: '🔍', 
        title: 'linux_pstree', 
        desc: '显示Linux进程树结构', 
        feature: 'pstree_linux',
        category: 'process'
      },
      { 
        icon: '🌐', 
        title: 'linux_netstat', 
        desc: '分析Linux网络连接状态', 
        feature: 'netstat_linux',
        category: 'network'
      },
      { 
        icon: '📁', 
        title: 'linux_mount', 
        desc: '查看Linux文件系统挂载信息', 
        feature: 'mount_linux',
        category: 'system'
      },
      { 
        icon: '🔐', 
        title: 'linux_bash', 
        desc: '提取Bash命令历史记录', 
        feature: 'bash',
        category: 'forensic'
      },
      { 
        icon: '🛠️', 
        title: 'linux_lsmod', 
        desc: '列出已加载的内核模块', 
        feature: 'lsmod',
        category: 'system'
      },
      { 
        icon: '⚙️', 
        title: 'linux_proc_maps', 
        desc: '分析进程内存映射', 
        feature: 'proc_maps',
        category: 'memory'
      }
    ];
  }

  static getConfig() {
    return {
      name: 'Vol2 Linux',
      desc: 'Linux内存分析专版',
      icon: '/assets/vol2linux.png',
      color: '#fd79a8',

    };
  }

  static renderAdvancedPanel(): string {
    return `
      <div class="advanced-vol2linux-panel">
        <div class="panel-section">
          <h4>🐧 Linux配置</h4>
          <div class="linux-options">
            <select class="distro-select">
              <option value="ubuntu">Ubuntu</option>
              <option value="debian">Debian</option>
              <option value="centos">CentOS</option>
              <option value="redhat">RedHat</option>
              <option value="kali">Kali Linux</option>
            </select>
            <input type="text" class="kernel-version" placeholder="内核版本...">
          </div>
        </div>
        <div class="panel-section">
          <h4>🔧 分析模式</h4>
          <div class="analysis-modes">
            <label><input type="radio" name="linux-mode" value="standard" checked> 标准模式</label>
            <label><input type="radio" name="linux-mode" value="deep"> 深度分析</label>
            <label><input type="radio" name="linux-mode" value="quick"> 快速扫描</label>
          </div>
        </div>
      </div>
    `;
  }

  static renderFeatureConfig(feature: string): string {
    return `
      <div class="feature-config">
        <h4>⚙️ ${feature} 配置</h4>
        <div class="config-row">
          <label>分析模式:</label>
          <select>
            <option value="standard" selected>标准模式</option>
            <option value="deep">深度分析</option>
            <option value="quick">快速扫描</option>
          </select>
        </div>
        <div class="config-row">
          <label class="checkbox-label">
            <input type="checkbox" checked> 详细输出
          </label>
        </div>
      </div>
    `;
  }
} 
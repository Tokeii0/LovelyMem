import { vol3linuxFeatures } from './vol3linuxArea';
import { FeatureConfig } from '../core/types';

export class Volatility3LinuxArea {
  static getFeatures(): FeatureConfig[] {
    // 将 vol3linuxFeatures 转换为 FeatureConfig 格式
    return vol3linuxFeatures.map(feature => ({
      icon: this.getCategoryIcon(feature.category),
      title: feature.name,
      desc: feature.description,
      feature: feature.id,
      category: feature.category
    }));
  }

  static getCategoryIcon(category: string): string {
    const iconMap: { [key: string]: string } = {
      'system-info': '🔧',
      'process': '🐧',
      'network': '🌐',
      'filesystem': '💾',
      'kernel': '⚙️',
      'gui': '🖥️',
      'forensics': '🔍',
      'security': '🛡️',
      'malware': '🦠',
      'security-deprecated': '⚠️',
    };
    return iconMap[category] || '📋';
  }

  static getConfig() {
    return {
      name: 'Vol3 Linux',
      desc: '新一代Linux内存分析',
      icon: '/assets/vol3linux.png',
      color: '#a29bfe',
    };
  }

  static renderAdvancedPanel(): string {
    return `
      <div class="advanced-vol3linux-panel">
        <div class="panel-section">
          <h4> Linux</h4>
          <h4>🚀 Linux高级选项</h4>
          <div class="vol3linux-options">
            <label class="config-item">
              <input type="checkbox" id="linux-symbols"> 符号表解析
            </label>
            <label class="config-item">
              <input type="checkbox" id="linux-kallsyms"> Kallsyms支持
            </label>
            <label class="config-item">
              <input type="checkbox" id="linux-debug"> 调试信息
            </label>
          </div>
        </div>
        <div class="panel-section">
          <h4>🐧 内核配置</h4>
          <div class="kernel-config">
            <input type="text" class="system-map" placeholder="System.map路径...">
            <select class="arch-select">
              <option value="x86_64">x86_64</option>
              <option value="x86">x86</option>
              <option value="arm64">ARM64</option>
              <option value="arm">ARM</option>
            </select>
          </div>
        </div>
        <div class="panel-section">
          <h4>🔧 代理设置</h4>
          <div class="proxy-config">
            <label class="config-item">
              <input type="checkbox" id="vol3linux-use-proxy" checked> 使用远程符号表
            </label>
            <input type="text" class="proxy-url" id="vol3linux-proxy-url" placeholder="代理URL...">
          </div>
        </div>
      </div>
    `;
  }
} 
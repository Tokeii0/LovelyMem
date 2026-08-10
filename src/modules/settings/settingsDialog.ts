/**
 * 设置弹窗模块
 * 负责设置界面的渲染、交互、加载与保存（从 manager.ts 迁出，manager.ts 现为薄壳入口）
 */

import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings } from '../core/settingsHelper';
import { updateStatus } from '../utils/helpers';
import { detectPlatform } from '../../utils/platformDetection';
import { IconParkHelper } from '../utils/iconparkHelper';
import { setLanguage as setAppLanguage, translate } from '../../i18n';

import { friendlyError } from '../utils/errorMessage';

interface SettingsValidationIssue {
  field: string;
}

interface SettingsValidationResult {
  is_valid: boolean;
  issues: SettingsValidationIssue[];
}

interface ToolchainInstallResult {
  tool_id: string;
  setting_key: string;
  path: string;
  version: string;
  source_url: string;
  related_paths?: Record<string, string>;
}

interface ToolchainDownloadProgress {
  tool_id: string;
  stage: string;
  downloaded?: number;
  total?: number;
  downloaded_bytes?: number;
  total_bytes?: number;
  message?: string;
}

/**
 * 获取图标 SVG HTML
 * @param iconName 图标名称
 * @param size 图标尺寸，默认 16
 */
function getIcon(iconName: string, size: number = 16): string {
  return IconParkHelper.getSvgString(iconName, { size, strokeWidth: 3 });
}

export class SettingsDialog {

  /**
   * 显示自定义提示弹窗（替代 alert）
   */
  private showAlert(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', title?: string): Promise<void> {
    return new Promise((resolve) => {
      const iconMap: Record<string, string> = {
        success: 'check-circle',
        error: 'close-circle',
        info: 'info',
        warning: 'attention'
      };
      const titleMap: Record<string, string> = {
        success: '成功',
        error: '错误',
        info: '提示',
        warning: '警告'
      };

      const overlay = document.createElement('div');
      overlay.className = 'custom-dialog-overlay';
      overlay.innerHTML = `
        <div class="custom-dialog-box">
          <div class="custom-dialog-icon ${type}">
            ${getIcon(iconMap[type], 24)}
          </div>
          <div class="custom-dialog-title"></div>
          <div class="custom-dialog-message"></div>
          <div class="custom-dialog-buttons">
            <button class="custom-dialog-btn custom-dialog-btn-ok">确定</button>
          </div>
        </div>
      `;

      const titleElement = overlay.querySelector('.custom-dialog-title');
      const messageElement = overlay.querySelector('.custom-dialog-message');
      if (titleElement) titleElement.textContent = title || titleMap[type];
      if (messageElement) messageElement.textContent = message;

      const close = () => {
        overlay.remove();
        resolve();
      };

      overlay.querySelector('.custom-dialog-btn-ok')?.addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      document.body.appendChild(overlay);
      (overlay.querySelector('.custom-dialog-btn-ok') as HTMLButtonElement)?.focus();
    });
  }

  /**
   * 显示自定义确认弹窗（替代 confirm）
   */
  private showConfirm(message: string, options?: {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      const { title = '确认', confirmText = '确定', cancelText = '取消', danger = false } = options || {};

      const overlay = document.createElement('div');
      overlay.className = 'custom-dialog-overlay';
      overlay.innerHTML = `
        <div class="custom-dialog-box">
          <div class="custom-dialog-icon ${danger ? 'warning' : 'info'}">
            ${getIcon(danger ? 'attention' : 'help', 24)}
          </div>
          <div class="custom-dialog-title"></div>
          <div class="custom-dialog-message"></div>
          <div class="custom-dialog-buttons">
            <button class="custom-dialog-btn custom-dialog-btn-cancel"></button>
            <button class="custom-dialog-btn custom-dialog-btn-confirm ${danger ? 'danger' : ''}"></button>
          </div>
        </div>
      `;

      const titleElement = overlay.querySelector('.custom-dialog-title');
      const messageElement = overlay.querySelector('.custom-dialog-message');
      const cancelButton = overlay.querySelector('.custom-dialog-btn-cancel');
      const confirmButton = overlay.querySelector('.custom-dialog-btn-confirm');
      if (titleElement) titleElement.textContent = title;
      if (messageElement) messageElement.textContent = message;
      if (cancelButton) cancelButton.textContent = cancelText;
      if (confirmButton) confirmButton.textContent = confirmText;

      const close = (result: boolean) => {
        overlay.remove();
        resolve(result);
      };

      overlay.querySelector('.custom-dialog-btn-cancel')?.addEventListener('click', () => close(false));
      overlay.querySelector('.custom-dialog-btn-confirm')?.addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });

      document.body.appendChild(overlay);
      (overlay.querySelector('.custom-dialog-btn-confirm') as HTMLButtonElement)?.focus();
    });
  }

  /**
   * 显示设置对话框
   */
  async showSettingsDialog(): Promise<void> {
    // 移除现有的设置弹窗与遮罩（支持导入/重置后重新渲染，避免遮罩叠加）
    const existingDialog = document.querySelector('.settings-dialog');
    if (existingDialog) {
      existingDialog.remove();
    }
    document.querySelector('.settings-overlay')?.remove();

    // 创建设置弹窗
    const dialog = document.createElement('div');
    dialog.className = 'settings-dialog';

    try {
      // 加载当前设置
      const settings = await loadAppSettings();

      // 加载自定义工具
      // 平台检测：macOS 下隐藏 Python2 与 Volatility2 相关设置
      const { isMacOS } = detectPlatform();

      const customTools = await invoke('load_custom_tools') as any[];
      const aiProviders = await invoke('load_ai_providers') as any[];
      const currentProvider = await invoke('get_current_ai_provider') as any;
      
      // 设置校验（驱动右侧环境状态就绪度与卡片状态点）
      let validation: any = { is_valid: true, issues: [], summary: '' };
      try {
        validation = await invoke('validate_app_settings_command');
      } catch (e) {
        console.warn('设置校验失败:', e);
      }

      dialog.innerHTML = `
          <div class="settings-modal">
            <div class="settings-header">
              <div class="settings-header__title">
                <span class="section-icon">${getIcon('setting', 20)}</span>
                <div class="settings-header__text">
                  <h2>应用设置</h2>
                  <span class="settings-subtitle">配置取证环境与分析工具链</span>
                </div>
              </div>
              <div class="settings-search-wrapper">
                <span class="search-icon">${getIcon('search', 14)}</span>
                <input type="text" class="settings-search-input" placeholder="搜索设置、路径或工具..." id="settings-search">
                <span class="settings-search-kbd">Ctrl + K</span>
              </div>
              <div class="header-buttons">
                <button class="one-click-detect-btn" data-action="one-click-detect"><span class="btn-icon">${getIcon('shield', 14)}</span> 一键检测</button>
                <button class="close-btn" data-action="close">${getIcon('close', 14)}</button>
              </div>
            </div>
            <div class="settings-body">
              <div class="settings-sidebar">
                <div class="settings-nav-title">设置分类</div>
                <nav class="settings-nav">
                  <button class="settings-nav-item active" data-category="general">
                    <span class="nav-icon">${getIcon('setting', 18)}</span>
                    <span class="nav-text"><span class="nav-label">常规</span><span class="nav-desc">语言与界面</span></span>
                  </button>
                  <button class="settings-nav-item" data-category="tools">
                    <span class="nav-icon">${getIcon('tool', 18)}</span>
                    <span class="nav-text"><span class="nav-label">工具链</span><span class="nav-desc">外部工具与路径</span></span>
                  </button>
                  <button class="settings-nav-item" data-category="yara">
                    <span class="nav-icon">${getIcon('shield', 18)}</span>
                    <span class="nav-text"><span class="nav-label">规则库</span><span class="nav-desc">YARA 与规则配置</span></span>
                  </button>
                  <button class="settings-nav-item" data-category="output">
                    <span class="nav-icon">${getIcon('folder-open', 18)}</span>
                    <span class="nav-text"><span class="nav-label">输出</span><span class="nav-desc">报告与导出设置</span></span>
                  </button>
                  <button class="settings-nav-item" data-category="ai">
                    <span class="nav-icon">${getIcon('robot', 18)}</span>
                    <span class="nav-text"><span class="nav-label">AI</span><span class="nav-desc">智能分析与助手</span></span>
                  </button>
                  <button class="settings-nav-item" data-category="custom-tools">
                    <span class="nav-icon">${getIcon('tool', 18)}</span>
                    <span class="nav-text"><span class="nav-label">工具</span><span class="nav-desc">自定义工具管理</span></span>
                  </button>
                </nav>
              </div>
              <div class="settings-panel">
                <div class="settings-panel-content active" data-category="general">
                  <div class="settings-section">
                    <h3><span class="section-icon">${getIcon('setting', 16)}</span> 语言设置</h3>
                    <div class="setting-item">
                      <label for="language">界面语言</label>
                      <select id="language">
                        <option value="zh-CN" ${settings.language !== 'en-US' ? 'selected' : ''}>简体中文</option>
                        <option value="en-US" ${settings.language === 'en-US' ? 'selected' : ''}>English</option>
                      </select>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 选择应用界面使用的语言。保存后会同步更新所有已打开的窗口。</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="settings-panel-content" data-category="tools">
                  <div class="settings-section toolchain-section">
                    <div class="toolchain-head">
                      <h3>工具链配置 <span class="toolchain-badge">${(validation?.issues || []).length} 项待检查</span></h3>
                      <p class="toolchain-head__desc">配置外部取证工具路径，确保分析功能正常运行。</p>
                    </div>
                    <div class="toolchain-grid">
                      <div class="toolchain-cards">
                        ${this.renderToolCards(settings, validation, isMacOS)}
                        <button class="add-tool-card" data-action="add-tool">
                          <span class="add-tool-card__plus">${getIcon('plus', 18)}</span>
                          <span class="add-tool-card__text"><b>添加自定义工具</b><small>添加其他分析工具或脚本</small></span>
                        </button>
                      </div>
                      ${this.renderEnvStatus(settings, validation, isMacOS)}
                    </div>
                    <details class="toolchain-advanced">
                      <summary><span class="adv-icon">${getIcon('setting', 14)}</span> 高级配置（挂载盘符 · Vol2 插件/Profile · MemNixFS 符号等）</summary>
                      <div class="toolchain-advanced__body">
                        <div class="setting-item">
                          <label>MemProcFS 挂载盘符:</label>
                          <div class="path-input-group">
                            <input type="text" id="mount-drive-letter" maxlength="1" value="${(settings.mount_drive_letter || 'M').toUpperCase()}" placeholder="M" style="text-transform:uppercase">
                          </div>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：MemProcFS 将内存镜像挂载到的盘符（单个字母，默认 M）。修改后需重新加载镜像生效。</span>
                          </div>
                        </div>
                        <div class="setting-item">
                          <label>MemProcFS 组件更新地址 (URL):</label>
                          <div class="path-input-group">
                            <input type="text" id="memprocfs-update-url" value="${settings.memprocfs_update_url ?? ''}" placeholder="https://example.com/memprocfs-update.json">
                          </div>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：每次启动会从该地址拉取云端 JSON 清单，对本地 vmm.dll / memprocfs.exe 做 SHA256 校验；不一致时自动结束 MemProcFS 进程并静默下载替换。留空则禁用校验。</span>
                          </div>
                        </div>
                        <div class="setting-item">
                          <label>DumpIt 路径:</label>
                          <div class="path-input-group">
                            <input type="text" id="dumpit-path" value="${settings.dumpit_path || ''}" placeholder="选择 DumpIt 执行文件路径" readonly>
                            <button class="browse-btn" data-setting="dumpit_path">浏览</button>
                          </div>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：DumpIt 用于采集物理内存镜像。它需要按上游许可手动获取，因此不提供自动下载，也不参与环境就绪度统计。</span>
                          </div>
                        </div>
                        ${isMacOS ? '' : `
                        <div class="setting-item">
                          <label>Volatility 2 插件目录:</label>
                          <div class="path-input-group">
                            <input type="text" id="volatility2-plugin" value="${settings.volatility2_plugin || ''}" placeholder="选择 Volatility 2 插件目录" readonly>
                            <button class="browse-btn" data-setting="volatility2_plugin">浏览</button>
                          </div>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：Volatility 2 的插件目录路径，通常包含第三方插件</span>
                          </div>
                        </div>
                        <div class="setting-item">
                          <label>Volatility 2 默认 Profile:</label>
                          <div class="path-input-group">
                            <select id="volatility2-profile" class="config-select">
                              <option value="Win7SP1x64" ${(settings.volatility2_profile || 'Win7SP1x64') === 'Win7SP1x64' ? 'selected' : ''}>Win7SP1x64</option>
                              <option value="Win7SP1x86" ${(settings.volatility2_profile || 'Win7SP1x64') === 'Win7SP1x86' ? 'selected' : ''}>Win7SP1x86</option>
                              <option value="Win10x64" ${(settings.volatility2_profile || 'Win7SP1x64') === 'Win10x64' ? 'selected' : ''}>Win10x64</option>
                              <option value="Win10x86" ${(settings.volatility2_profile || 'Win7SP1x64') === 'Win10x86' ? 'selected' : ''}>Win10x86</option>
                              <option value="WinXPSP2x86" ${(settings.volatility2_profile || 'Win7SP1x64') === 'WinXPSP2x86' ? 'selected' : ''}>WinXPSP2x86</option>
                              <option value="WinXPSP3x86" ${(settings.volatility2_profile || 'Win7SP1x64') === 'WinXPSP3x86' ? 'selected' : ''}>WinXPSP3x86</option>
                            </select>
                          </div>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：这是 Volatility2 的默认 Profile，可在主界面中动态调整</span>
                          </div>
                        </div>
                        `}
                        <div class="setting-item">
                          <label>MemNixFS 符号目录 (ISF):</label>
                          <div class="path-input-group">
                            <input type="text" id="memnixfs-symbols-path" value="${settings.memnixfs_symbols_path || ''}" placeholder="选择 Linux 内核 ISF 符号目录" readonly>
                            <button class="browse-btn" data-setting="memnixfs_symbols_path">浏览</button>
                          </div>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：离线环境必填。ISF 符号文件/目录，用于解析 Linux 内核结构。</span>
                          </div>
                        </div>
                        <div class="setting-item">
                          <label>MemNixFS 符号缓存目录:</label>
                          <div class="path-input-group">
                            <input type="text" id="memnixfs-symbol-cache-path" value="${settings.memnixfs_symbol_cache_path || ''}" placeholder="选择符号缓存目录 (--symbol-cache)" readonly>
                            <button class="browse-btn" data-setting="memnixfs_symbol_cache_path">浏览</button>
                          </div>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：内核符号的下载/复用缓存目录，传给 --symbol-cache。</span>
                          </div>
                        </div>
                        <div class="setting-item">
                          <label>MemNixFS vmlinux (可选):</label>
                          <div class="path-input-group">
                            <input type="text" id="memnixfs-vmlinux-path" value="${settings.memnixfs_vmlinux_path || ''}" placeholder="可选：自定义 vmlinux 路径" readonly>
                            <button class="browse-btn" data-setting="memnixfs_vmlinux_path">浏览</button>
                          </div>
                        </div>
                        <div class="setting-item">
                          <label>MemNixFS 取证模式:</label>
                          <div class="path-input-group">
                            <select id="memnixfs-forensic-mode" class="config-select">
                              <option value="quick" ${(settings.memnixfs_forensic_mode || 'smart') === 'quick' ? 'selected' : ''}>quick（快速）</option>
                              <option value="smart" ${(settings.memnixfs_forensic_mode || 'smart') === 'smart' ? 'selected' : ''}>smart（默认）</option>
                              <option value="full" ${(settings.memnixfs_forensic_mode || 'smart') === 'full' ? 'selected' : ''}>full（完整）</option>
                            </select>
                          </div>
                        </div>
                        <div class="setting-item">
                          <label><input type="checkbox" id="memnixfs-auto-fetch" ${settings.memnixfs_auto_fetch ? 'checked' : ''}> 允许联网自动获取内核符号 (--auto-fetch)</label>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：默认关闭（纯离线）。开启后未配置符号时会联网下载匹配的内核调试符号。</span>
                          </div>
                        </div>
                        <div class="setting-item">
                          <label>MemNixFS 符号代理:</label>
                          <div class="path-input-group">
                            <input type="text" id="memnixfs-proxy" value="${settings.memnixfs_proxy || ''}" placeholder="例如 http://127.0.0.1:7890（拉取符号走代理）">
                          </div>
                          <div class="setting-hint">
                            <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：拉取内核符号会访问 GitHub/ddebs，国内有时不通。填代理地址后，符号下载将通过该代理（HTTP_PROXY/HTTPS_PROXY）。</span>
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
                <div class="settings-panel-content" data-category="yara">
                  <div class="settings-section">
                    <h3><span class="section-icon">${getIcon('search', 16)}</span> YARA规则扫描配置</h3>
                    <div class="setting-item">
                      <label>
                        <input type="checkbox" id="yara-enabled" ${settings.yara_enabled ? 'checked' : ''}>
                        启用YARA规则扫描
                      </label>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('attention', 12)}</span> 注意：开启YARA扫描会显著增加内存镜像加载时间</span>
                      </div>
                    </div>
                    <div class="setting-item">
                      <label>YARA规则文件路径:</label>
                      <div class="path-input-group">
                        <input type="text" id="yara-rules-path" value="${settings.yara_rules_path || ''}" placeholder="选择YARA规则文件" readonly${!settings.yara_enabled ? ' disabled' : ''}>
                        <button class="browse-btn" data-setting="yara_rules_path"${!settings.yara_enabled ? ' disabled' : ''}>浏览</button>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：选择包含YARA规则的.yar文件</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="settings-panel-content" data-category="output">
                  <div class="settings-section">
                    <h3><span class="section-icon">${getIcon('folder-open', 16)}</span> 文件输出配置</h3>
                    <div class="setting-item">
                      <label>文件输出目录:</label>
                      <div class="path-input-group">
                        <input type="text" id="output-path" value="${settings.output_path || ''}" placeholder="选择文件输出目录" readonly>
                        <button class="browse-btn" data-setting="output_path">浏览</button>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：此目录用于存储从内存镜像提取的文件</span>
                      </div>
                    </div>
                    <div class="setting-item">
                      <label>告警目录:</label>
                      <div class="path-input-group">
                        <input type="text" id="warning-path" value="${settings.warning_path || ''}" placeholder="默认：与输出目录同级的 warnings 文件夹" readonly>
                        <button class="browse-btn" data-setting="warning_path">浏览</button>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：留空则自动使用 output_path 同级目录下的 warnings</span>
                      </div>
                    </div>
                    <div class="setting-item">
                      <label>脚本存储路径:</label>
                      <div class="path-input-group">
                        <input type="text" id="scripts-path" value="${settings.scripts_path || 'scripts'}" placeholder="选择Python脚本存储目录" readonly>
                        <button class="browse-btn" data-setting="scripts_path">浏览</button>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：此目录用于存储Python脚本文件</span>
                      </div>
                    </div>
                    <div class="setting-item">
                      <label>扩展程序路径:</label>
                      <div class="path-input-group">
                        <input type="text" id="extensions-path" value="${settings.extensions_path || 'extensions'}" placeholder="选择扩展程序存储目录" readonly>
                        <button class="browse-btn" data-setting="extensions_path">浏览</button>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：此目录用于存储下载的扩展程序文件</span>
                      </div>
                    </div>
                    <div class="setting-item">
                      <label>工具提示规则路径:</label>
                      <div class="path-input-group">
                        <input type="text" id="tooltip-rules-path" value="${settings.tooltip_rules_path || 'tooltip_rules'}" placeholder="选择工具提示规则存储目录" readonly>
                        <button class="browse-btn" data-setting="tooltip_rules_path">浏览</button>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：此目录用于存储CSV工具提示规则文件</span>
                      </div>
                    </div>
                    <div class="setting-item">
                      <label>Markdown报告保存路径:</label>
                      <div class="path-input-group">
                        <input type="text" id="markdown-save-path" value="${settings.markdown_save_path || 'markdown'}" placeholder="选择Markdown报告保存目录" readonly>
                        <button class="browse-btn" data-setting="markdown_save_path">浏览</button>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：此目录用于存储报告编辑器生成的Markdown文件</span>
                      </div>
                    </div>
                  </div>
                  <div class="settings-section">
                    <h3><span class="section-icon">${getIcon('flash', 16)}</span> Volatility 插件结果缓存</h3>
                    <div class="setting-item">
                      <label>
                        <input type="checkbox" id="vol-cache-enabled" ${settings.vol_cache_enabled !== false ? 'checked' : ''}>
                        启用插件结果缓存
                      </label>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 提示：对同一镜像重复执行同一 Vol2/Vol3 插件（相同参数）时直接复用上次结果，避免重跑，秒级返回。修改参数或更换镜像会自动重新执行。</span>
                      </div>
                    </div>
                    <div class="setting-item">
                      <div class="path-input-group">
                        <button class="browse-btn" id="vol-cache-clear-btn">清空插件缓存</button>
                        <span id="vol-cache-stats" style="margin-left:8px;opacity:0.7;"></span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="settings-panel-content" data-category="ai">
                  <div class="settings-section">
                    <h3><span class="section-icon">${getIcon('robot', 16)}</span> AI 配置</h3>
                    <div class="ai-config-grid">
                      <div class="setting-item">
                        <label>默认Agent类型:</label>
                        <div class="path-input-group">
                          <select id="ai-default-agent" class="config-select">
                            <option value="general" ${(settings.ai_default_agent || 'general') === 'general' ? 'selected' : ''}>通用代理</option>
                            <option value="forensic" ${['forensic', 'analyze'].includes(settings.ai_default_agent || 'general') ? 'selected' : ''}>取证分析代理</option>
                            <option value="explore" ${(settings.ai_default_agent || 'general') === 'explore' ? 'selected' : ''}>探索代理</option>
                          </select>
                        </div>
                        <div class="setting-hint">
                          <span><span class="hint-icon">${getIcon('info', 12)}</span> 分析代理专注内存取证；探索代理快速浏览文件</span>
                        </div>
                      </div>
                    </div>
                    <div class="setting-item">
                      <label>Temperature (创造性):</label>
                      <div class="ai-temperature-wrapper">
                        <div class="ai-temp-labels">
                          <span class="ai-temp-label"><span class="ai-temp-icon">${getIcon('check-correct', 12)}</span> 精确</span>
                          <span class="ai-temp-label"><span class="ai-temp-icon">${getIcon('sliders', 12)}</span> 平衡</span>
                          <span class="ai-temp-label"><span class="ai-temp-icon">${getIcon('magic', 12)}</span> 创造</span>
                        </div>
                        <div class="path-input-group" style="align-items: center;">
                          <input type="range" id="ai-temperature" min="0" max="100" value="${Math.round((settings.ai_temperature || 0.7) * 100)}" style="flex: 1;">
                          <span id="ai-temperature-value" class="ai-temp-value">${(settings.ai_temperature || 0.7).toFixed(2)}</span>
                        </div>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 推荐取证分析: 0.2-0.4 | 通用问答: 0.5-0.7 | 创意写作: 0.8-1.0</span>
                      </div>
                    </div>
                    <div class="setting-item">
                      <label>最大输出Token:</label>
                      <div class="path-input-group">
                        <select id="ai-max-tokens" class="config-select">
                          <option value="1000" ${(settings.ai_max_tokens || 2000) === 1000 ? 'selected' : ''}>1000 (快速回复)</option>
                          <option value="2000" ${(settings.ai_max_tokens || 2000) === 2000 ? 'selected' : ''}>2000 (默认)</option>
                          <option value="4000" ${(settings.ai_max_tokens || 2000) === 4000 ? 'selected' : ''}>4000 (详细分析)</option>
                          <option value="8000" ${(settings.ai_max_tokens || 2000) === 8000 ? 'selected' : ''}>8000 (深度报告)</option>
                          <option value="16000" ${(settings.ai_max_tokens || 2000) === 16000 ? 'selected' : ''}>16000 (超长输出)</option>
                        </select>
                      </div>
                      <div class="setting-hint">
                        <span><span class="hint-icon">${getIcon('info', 12)}</span> 控制AI单次回复的最大长度，更大的值需要更高的模型支持</span>
                      </div>
                    </div>
                    <div class="ai-providers-section">
                      <div class="ai-providers-header">
                        <div class="ai-providers-title">
                          <span class="section-icon">${getIcon('cloud-server', 16)}</span>
                          <span>AI 提供商管理</span>
                        </div>
                        <div class="ai-providers-header-actions">
                          <button class="ai-provider-header-btn secondary" data-action="test-all-ai-providers"><span class="btn-icon">${getIcon('connection-point', 12)}</span> 一键检测</button>
                          <button class="ai-provider-header-btn primary" data-action="add-ai-provider"><span class="btn-icon">${getIcon('plus', 12)}</span> 添加提供商</button>
                        </div>
                      </div>
                      <div class="ai-providers-desc">
                        <span class="ai-providers-intro">管理多个AI服务提供商，支持 OpenAI、Claude、DeepSeek、Ollama 等</span>
                        <span class="ai-provider-referral">
                          推荐中转站：
                          <a href="https://clawnode.cn/register?aff=EOlT" target="_blank" rel="noopener noreferrer">
                            clawnode.cn
                          </a>
                        </span>
                      </div>
                      <div class="custom-tools-list" id="ai-providers-list">
                        <!-- AI提供商列表将在这里显示 -->
                      </div>
                    </div>
                  </div>
                </div>
                <div class="settings-panel-content" data-category="custom-tools">
                  <div class="settings-section">
                    <h3><span class="section-icon">${getIcon('tool', 16)}</span> 自定义工具管理</h3>
                    <div class="setting-item">
                      <div class="custom-tools-header">
                        <span>管理命令终端中可快速运行的自定义工具</span>
                        <button class="add-tool-btn" data-action="add-tool"><span class="btn-icon">${getIcon('plus', 12)}</span> 添加工具</button>
                      </div>
                      <div class="custom-tools-list" id="custom-tools-list">
                        <!-- 工具列表将在这里显示 -->
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="settings-footer">
              <div class="settings-footer__saved">${getIcon('check-circle', 13)} 上次保存 ${SettingsDialog.formatSavedTime()}</div>
              <div class="settings-actions">
                <button class="cancel-btn" data-action="cancel">取消</button>
                <button class="save-btn" data-action="save">保存更改</button>
              </div>
            </div>
          </div>
      `;

      // 创建覆盖层
      const overlay = document.createElement('div');
      overlay.className = 'settings-overlay';

      // 先添加覆盖层，再添加对话框
      document.body.appendChild(overlay);
      document.body.appendChild(dialog);

      // 延迟绑定事件，确保DOM完全渲染
      setTimeout(() => {
        this.bindSettingsEvents(dialog, overlay);
      }, 50);

      // 加载自定义工具列表
      this.loadCustomToolsList(dialog, customTools);

      // 加载AI提供商列表
      this.loadAiProvidersList(dialog, aiProviders, currentProvider?.id);

    } catch (error) {
      console.error('加载设置失败:', error);
      this.showAlert('加载设置失败', 'error');
    }
  }

  /**
   * 绑定设置相关事件
   */
  private bindSettingsEvents(dialog: HTMLElement, overlay: HTMLElement): void {
    let isProcessing = false; // 防止重复处理

    // 统一的点击事件处理器
    dialog.addEventListener('click', async (e) => {
      // 防止重复处理
      if (isProcessing) {
        return;
      }

      const target = e.target as HTMLElement;
      const actionElement = target.closest('[data-action]') as HTMLElement | null;
      const action = actionElement?.getAttribute('data-action') || null;

      // 处理 data-action 属性的按钮
      if (action) {
        isProcessing = true;

        try {
          if (action === 'close' || action === 'cancel') {
            overlay.remove();
            dialog.remove();
          } else if (action === 'save') {
            await this.saveSettings(dialog, overlay);
          } else if (action === 'add-tool') {
            this.showCustomToolEditor(dialog);
          } else if (action === 'edit-tool') {
            const toolId = actionElement?.getAttribute('data-tool-id');
            if (toolId) {
              this.showCustomToolEditor(dialog, toolId);
            }
          } else if (action === 'delete-tool') {
            const toolId = actionElement?.getAttribute('data-tool-id');
            if (toolId) {
              this.deleteCustomTool(dialog, toolId);
            }
          } else if (action === 'toggle-tool') {
            const toolId = actionElement?.getAttribute('data-tool-id');
            if (toolId) {
              this.toggleCustomTool(dialog, toolId);
            }
          } else if (action === 'add-ai-provider') {
            this.showAiProviderEditor(dialog);
          } else if (action === 'edit-ai-provider') {
            const providerId = actionElement?.getAttribute('data-provider-id');
            if (providerId) {
              this.showAiProviderEditor(dialog, providerId);
            }
          } else if (action === 'delete-ai-provider') {
            const providerId = actionElement?.getAttribute('data-provider-id');
            if (providerId) {
              this.deleteAiProvider(dialog, providerId);
            }
          } else if (action === 'toggle-ai-provider') {
            const providerId = actionElement?.getAttribute('data-provider-id');
            if (providerId) {
              this.toggleAiProvider(dialog, providerId);
            }
          } else if (action === 'set-current-ai-provider') {
            const providerId = actionElement?.getAttribute('data-provider-id');
            if (providerId) {
              this.setCurrentAiProvider(dialog, providerId);
            }
          } else if (action === 'test-all-ai-providers') {
            // 一键检测所有提供商
            const btn = actionElement as HTMLButtonElement;
            btn.disabled = true;
            btn.innerHTML = `<span class="btn-icon">${getIcon('loading', 12)}</span> 检测中...`;
            try {
              const providers = await invoke('load_ai_providers') as any[];
              for (const provider of providers) {
                const statusEl = dialog.querySelector(`#status-${provider.id}`) as HTMLElement;
                if (statusEl) {
                  statusEl.className = 'ai-provider-status testing';
                  statusEl.textContent = '检测中...';
                }
                try {
                  const result = await invoke('test_ai_connection', {
                    baseUrl: provider.base_url,
                    apiKey: provider.api_key || '',
                    model: provider.model
                  }) as any;
                  if (statusEl) {
                    if (result.success) {
                      statusEl.className = 'ai-provider-status success';
                      statusEl.innerHTML = `<span class="status-icon">${getIcon('check-circle', 12)}</span> 连接正常 (${result.latency_ms}ms)`;
                    } else {
                      statusEl.className = 'ai-provider-status error';
                      statusEl.innerHTML = `<span class="status-icon">${getIcon('close-circle', 12)}</span> ${result.message}`;
                      statusEl.title = result.message;
                    }
                  }
                } catch (e) {
                  if (statusEl) {
                    statusEl.className = 'ai-provider-status error';
                    statusEl.innerHTML = `<span class="status-icon">${getIcon('close-circle', 12)}</span> ${e}`;
                    statusEl.title = String(e);
                  }
                }
              }
            } finally {
              btn.disabled = false;
              btn.innerHTML = `<span class="btn-icon">${getIcon('connection-point', 12)}</span> 一键检测`;
            }
          } else if (action === 'auto-config') {
            await this.performAutoConfig(dialog);
          } else if (action === 'one-click-detect') {
            await this.handleOneClickDetect(dialog);
          } else if (action === 'download-tool') {
            const toolId = actionElement?.getAttribute('data-tool-id');
            if (toolId) {
              await this.handleDownloadTool(toolId, dialog, actionElement as HTMLButtonElement);
            }
          } else if (action === 'download-all-tools') {
            await this.handleDownloadAllTools(dialog, actionElement as HTMLButtonElement);
          } else if (action === 'browse-path') {
            const settingKey = actionElement?.getAttribute('data-setting');
            if (settingKey) {
              await this.browseForFile(settingKey, dialog);
              await this.refreshEnvStatus(dialog);
            }
          } else if (action === 'copy-path') {
            const targetId = actionElement?.getAttribute('data-target');
            if (targetId) await this.handleCopyPath(targetId, dialog);
          } else if (action === 'import-config') {
            await this.handleImportConfig();
          } else if (action === 'export-config') {
            await this.handleExportConfig();
          } else if (action === 'reset-paths') {
            await this.handleResetPaths();
          }
        } finally {
          // 延迟重置处理状态，防止快速连击
          setTimeout(() => {
            isProcessing = false;
          }, 300);
        }
      }
      // 处理浏览按钮
      else if (target.closest('.browse-btn')) {
        isProcessing = true;

        try {
          console.log('点击了浏览按钮');

          // 检查按钮是否被禁用
          const button = target.closest('.browse-btn') as HTMLButtonElement;
          if (button.disabled) {
            console.log('按钮被禁用，忽略点击');
            return;
          }

          const settingKey = target.getAttribute('data-setting');
          console.log('设置键:', settingKey);

          if (settingKey) {
            await this.browseForFile(settingKey, dialog);
          }
        } finally {
          setTimeout(() => {
            isProcessing = false;
          }, 300);
        }
      }
    });

    // YARA启用状态变化事件
    const yaraEnabledCheckbox = dialog.querySelector('#yara-enabled') as HTMLInputElement;
    const yaraRulesPathInput = dialog.querySelector('#yara-rules-path') as HTMLInputElement;
    const yaraRulesPathButton = dialog.querySelector('[data-setting="yara_rules_path"]') as HTMLButtonElement;

    if (yaraEnabledCheckbox && yaraRulesPathInput && yaraRulesPathButton) {
      console.log('YARA控件找到，初始状态:', yaraEnabledCheckbox.checked);

      // 设置初始状态
      const updateYaraControls = () => {
        const isEnabled = yaraEnabledCheckbox.checked;
        yaraRulesPathInput.disabled = !isEnabled;
        yaraRulesPathButton.disabled = !isEnabled;
        console.log('YARA控件状态更新，启用:', isEnabled);

        // 如果禁用了YARA，清空路径
        if (!isEnabled) {
          yaraRulesPathInput.value = '';
        }
      };

      // 立即设置初始状态
      updateYaraControls();

      // 监听变化事件
      yaraEnabledCheckbox.addEventListener('change', updateYaraControls);
    } else {
      console.error('YARA控件未找到:', {
        checkbox: !!yaraEnabledCheckbox,
        input: !!yaraRulesPathInput,
        button: !!yaraRulesPathButton
      });
    }

    // Volatility 插件缓存：加载统计 + 清空按钮
    const volCacheStatsSpan = dialog.querySelector('#vol-cache-stats') as HTMLSpanElement;
    const volCacheClearBtn = dialog.querySelector('#vol-cache-clear-btn') as HTMLButtonElement;
    const refreshVolCacheStats = async () => {
      if (!volCacheStatsSpan) return;
      try {
        const stats: any = await invoke('get_vol_cache_stats');
        const mb = (stats.db_size_bytes / (1024 * 1024)).toFixed(2);
        volCacheStatsSpan.textContent = `当前缓存 ${stats.entries} 条 · ${mb} MB`;
      } catch {
        volCacheStatsSpan.textContent = '';
      }
    };
    refreshVolCacheStats();
    if (volCacheClearBtn) {
      volCacheClearBtn.addEventListener('click', async () => {
        try {
          const deleted: number = await invoke('clear_vol_cache');
          if (volCacheStatsSpan) volCacheStatsSpan.textContent = `已清空 ${deleted} 条缓存`;
          setTimeout(refreshVolCacheStats, 1200);
        } catch (err) {
          if (volCacheStatsSpan) volCacheStatsSpan.textContent = `清空失败: ${err}`;
        }
      });
    }

    // AI Temperature滑动条事件
    const temperatureSlider = dialog.querySelector('#ai-temperature') as HTMLInputElement;
    const temperatureValue = dialog.querySelector('#ai-temperature-value') as HTMLSpanElement;
    if (temperatureSlider && temperatureValue) {
      temperatureSlider.addEventListener('input', () => {
        const value = parseInt(temperatureSlider.value) / 100;
        temperatureValue.textContent = value.toFixed(2);
      });
    }

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) {
        overlay.remove();
        dialog.remove();
      }
    });

    // 专门为关闭按钮添加直接事件监听器，确保立即响应
    const closeBtn = dialog.querySelector('.close-btn[data-action="close"]') as HTMLElement;
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        overlay.remove();
        dialog.remove();
      }, { capture: true }); // 使用捕获阶段，确保优先处理
    }

    // ESC键关闭
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        overlay.remove();
        dialog.remove();
        document.removeEventListener('keydown', handleKeyDown);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        // Ctrl/Cmd + K 聚焦搜索框
        event.preventDefault();
        (dialog.querySelector('#settings-search') as HTMLInputElement)?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // ==================== 侧边栏分类切换 ====================
    const navItems = dialog.querySelectorAll('.settings-nav-item');
    const panels = dialog.querySelectorAll('.settings-panel-content');
    let currentActiveCategory = 'general';

    const switchCategory = (categoryId: string) => {
      currentActiveCategory = categoryId;
      // 更新导航激活状态
      navItems.forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-category') === categoryId);
      });
      // 切换面板显示
      panels.forEach(panel => {
        const el = panel as HTMLElement;
        if (el.getAttribute('data-category') === categoryId) {
          el.classList.add('active');
          // 触发进入动画
          el.classList.remove('panel-enter');
          void el.offsetHeight; // 触发 reflow
          el.classList.add('panel-enter');
        } else {
          el.classList.remove('active', 'panel-enter');
        }
      });
    };

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        const cat = item.getAttribute('data-category');
        if (cat) switchCategory(cat);
      });
    });

    // ==================== 搜索过滤 ====================
    const searchInput = dialog.querySelector('#settings-search') as HTMLInputElement;
    const sidebar = dialog.querySelector('.settings-sidebar') as HTMLElement;

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();

        if (!query) {
          // 清空搜索：恢复正常侧边栏导航
          if (sidebar) sidebar.style.opacity = '';
          // 隐藏所有 panel，仅显示当前激活的
          panels.forEach(panel => {
            const el = panel as HTMLElement;
            el.classList.toggle('active', el.getAttribute('data-category') === currentActiveCategory);
            // 恢复所有 setting-item / 工具卡片 可见
            el.querySelectorAll('.setting-item, .tool-card').forEach(item => {
              (item as HTMLElement).style.display = '';
            });
            // 恢复 section 标题可见
            const section = el.querySelector('.settings-section') as HTMLElement;
            if (section) section.style.display = '';
          });
          // 恢复侧边栏激活状态
          navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-category') === currentActiveCategory);
          });
          return;
        }

        // 搜索模式：淡化侧边栏，显示匹配结果
        if (sidebar) sidebar.style.opacity = '0.5';
        navItems.forEach(item => (item as HTMLElement).classList.remove('active'));

        panels.forEach(panel => {
          const el = panel as HTMLElement;
          const items = el.querySelectorAll('.setting-item, .tool-card');
          let hasVisible = false;

          items.forEach(item => {
            const text = (item as HTMLElement).textContent?.toLowerCase() || '';
            const match = text.includes(query);
            (item as HTMLElement).style.display = match ? '' : 'none';
            if (match) hasVisible = true;
          });

          // 显示/隐藏整个面板
          el.classList.toggle('active', hasVisible);
          const section = el.querySelector('.settings-section') as HTMLElement;
          if (section) section.style.display = hasVisible ? '' : 'none';
        });
      });
    }
  }

  // ============ 设计稿重做：工具链卡片 / 环境状态 / 快速操作 ============

  /** 工具链卡片描述表（卡片内嵌真实 input，沿用原有 ID 以兼容保存逻辑） */
  private toolchainTools(isMacOS: boolean) {
    const tools = [
      { id: 'python3', field: 'python3_path', inputId: 'python3-path', setting: 'python3_path', label: 'Python 3', tag: '脚本运行', glyph: 'Py3', mac: true },
      { id: 'python2', field: 'python2_path', inputId: 'python2-path', setting: 'python2_path', label: 'Python 2', tag: '旧版脚本', glyph: 'Py2', mac: false },
      { id: 'memprocfs', field: 'memprocfs_path', inputId: 'memprocfs-path', setting: 'memprocfs_path', label: 'MemProcFS', tag: 'Windows 内存分析核心', glyph: 'M', mac: true },
      { id: 'volatility2', field: 'volatility2_path', inputId: 'volatility2-path', setting: 'volatility2_path', label: 'Volatility 2', tag: '内存分析', glyph: 'V2', mac: false },
      { id: 'volatility3', field: 'volatility3_path', inputId: 'volatility3-path', setting: 'volatility3_path', label: 'Volatility 3', tag: '内存分析', glyph: 'V3', mac: true },
      { id: 'memnixfs', field: 'memnixfs_path', inputId: 'memnixfs-path', setting: 'memnixfs_path', label: 'MemNixFS', tag: 'Linux 取证', glyph: 'N', mac: true },
    ];
    return tools.filter(t => (isMacOS ? t.mac : true));
  }

  /** 环境状态清单的关键工具（DumpIt 为采集工具，不参与就绪度统计） */
  private envStatusTools(isMacOS: boolean) {
    const tools = [
      { field: 'python3_path', label: 'Python 3', mac: true },
      { field: 'memprocfs_path', label: 'MemProcFS', mac: true },
      { field: 'volatility3_path', label: 'Volatility 3', mac: true },
      { field: 'volatility2_path', label: 'Volatility 2', mac: false },
      { field: 'memnixfs_path', label: 'MemNixFS', mac: true },
    ];
    return tools.filter(t => (isMacOS ? t.mac : true));
  }

  /** 由设置值 + 校验结果推导单个字段的状态 */
  private toolState(field: string, settings: any, validation: any): { state: 'ok' | 'empty' | 'error'; text: string } {
    const value = (settings?.[field] || '').toString().trim();
    if (!value) return { state: 'empty', text: '未设置' };
    const errTypes = ['FileNotExists', 'DirectoryNotExists', 'InvalidPath', 'PythonEnvMissing'];
    const issues = (validation?.issues || []) as any[];
    const bad = issues.some(i => i.field === field && errTypes.includes(i.issue_type));
    return bad ? { state: 'error', text: '异常' } : { state: 'ok', text: '已配置' };
  }

  /** 渲染工具链卡片列表 */
  private renderToolCards(settings: any, validation: any, isMacOS: boolean): string {
    const copyIcon = getIcon('copy', 14);
    const folderIcon = getIcon('folder', 14);
    const downloadIcon = getIcon('download', 14);
    const oneClickDownloadSupported = detectPlatform().isWindows;
    return this.toolchainTools(isMacOS).map(t => {
      const value = settings?.[t.field] || '';
      const st = this.toolState(t.field, settings, validation);
      const downloadTitle = oneClickDownloadSupported ? '从官方源一键下载' : '当前平台暂不支持一键下载';
      return `
        <div class="tool-card" data-tool="${t.field}" data-tool-id="${t.id}">
          <span class="tool-status-dot ${st.state}" title="${st.text}"></span>
          <div class="tool-card__icon">${t.glyph}</div>
          <div class="tool-card__main">
            <div class="tool-card__title">${t.label}<span class="tool-tag">${t.tag}</span></div>
            <input type="text" id="${t.inputId}" class="tool-card__path" value="${value}" placeholder="未设置路径" readonly>
            <div class="tool-card__progress" aria-live="polite"></div>
          </div>
          <div class="tool-card__actions">
            <button class="tool-icon-btn tool-download-btn" data-action="download-tool" data-tool-id="${t.id}" title="${downloadTitle}" aria-label="${downloadTitle}" ${oneClickDownloadSupported ? '' : 'disabled'}>${downloadIcon}</button>
            <button class="tool-icon-btn" data-action="copy-path" data-target="${t.inputId}" title="复制路径">${copyIcon}</button>
            <button class="tool-icon-btn" data-action="browse-path" data-setting="${t.setting}" title="浏览">${folderIcon}</button>
          </div>
        </div>`;
    }).join('');
  }

  /** 计算就绪度百分比 */
  private computeReadiness(settings: any, validation: any, isMacOS: boolean): number {
    const tools = this.envStatusTools(isMacOS);
    if (tools.length === 0) return 100;
    const ok = tools.filter(t => this.toolState(t.field, settings, validation).state === 'ok').length;
    return Math.round((ok / tools.length) * 100);
  }

  /** 渲染就绪度环形进度 */
  private renderReadinessRing(readiness: number): string {
    const r = 52;
    const c = 2 * Math.PI * r;
    const off = c * (1 - readiness / 100);
    const color = readiness >= 80 ? 'var(--success-color)' : readiness >= 50 ? 'var(--warning-color)' : 'var(--error-color)';
    return `
      <div class="readiness-ring">
        <svg viewBox="0 0 120 120" class="readiness-ring__svg">
          <circle class="readiness-ring__bg" cx="60" cy="60" r="${r}"></circle>
          <circle class="readiness-ring__fg" cx="60" cy="60" r="${r}" stroke="${color}"
            stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
        </svg>
        <div class="readiness-ring__center">
          <span class="readiness-ring__num">${readiness}%</span>
          <span class="readiness-ring__label">就绪度</span>
        </div>
      </div>`;
  }

  /** 渲染右侧环境状态内容（便于刷新复用） */
  private renderEnvStatusInner(settings: any, validation: any, isMacOS: boolean): string {
    const readiness = this.computeReadiness(settings, validation, isMacOS);
    const list = this.envStatusTools(isMacOS).map(t => {
      const st = this.toolState(t.field, settings, validation);
      return `
        <div class="env-status-item">
          <span class="env-status-dot ${st.state}"></span>
          <span class="env-status-name">${t.label}</span>
          <span class="env-status-state ${st.state}">${st.text}</span>
        </div>`;
    }).join('');
    return `
      ${this.renderReadinessRing(readiness)}
      <div class="env-status-list">${list}</div>
      <div class="quick-actions">
        <div class="quick-actions__title">快速操作</div>
        <button class="quick-action-btn" data-action="download-all-tools" ${detectPlatform().isWindows ? '' : 'disabled'}>
          <span class="qa-icon">${getIcon('download', 16)}</span>
          <span class="qa-text"><b>下载全部缺失工具</b><small>${detectPlatform().isWindows ? '从官方源依次下载并自动配置' : '当前平台暂不支持一键下载'}</small></span>
          <span class="qa-arrow">${getIcon('right', 14)}</span>
        </button>
        <button class="quick-action-btn" data-action="auto-config">
          <span class="qa-icon">${getIcon('refresh', 16)}</span>
          <span class="qa-text"><b>自动修复</b><small>检测并尝试修复问题路径</small></span>
          <span class="qa-arrow">${getIcon('right', 14)}</span>
        </button>
        <button class="quick-action-btn" data-action="import-config">
          <span class="qa-icon">${getIcon('download', 16)}</span>
          <span class="qa-text"><b>导入配置</b><small>从文件导入工具链配置</small></span>
          <span class="qa-arrow">${getIcon('right', 14)}</span>
        </button>
        <button class="quick-action-btn" data-action="export-config">
          <span class="qa-icon">${getIcon('upload', 16)}</span>
          <span class="qa-text"><b>导出配置</b><small>保存当前配置到文件</small></span>
          <span class="qa-arrow">${getIcon('right', 14)}</span>
        </button>
        <button class="quick-action-btn" data-action="reset-paths">
          <span class="qa-icon">${getIcon('delete', 16)}</span>
          <span class="qa-text"><b>重置路径</b><small>清除所有自定义路径设置</small></span>
          <span class="qa-arrow">${getIcon('right', 14)}</span>
        </button>
      </div>`;
  }

  /** 渲染右侧环境状态面板 */
  private renderEnvStatus(settings: any, validation: any, isMacOS: boolean): string {
    return `
      <aside class="env-status">
        <div class="env-status__head"><span class="section-icon">${getIcon('shield', 16)}</span> 环境状态</div>
        <div class="env-status__body">${this.renderEnvStatusInner(settings, validation, isMacOS)}</div>
      </aside>`;
  }

  /** 刷新环境状态 + 卡片状态点 + 待检查徽章，返回待检查数量 */
  private async refreshEnvStatus(dialog: HTMLElement): Promise<number> {
    const { isMacOS } = detectPlatform();
    const settings = await this.buildUpdatedSettings(dialog);
    let validation: any = { issues: [] };
    try { validation = await invoke('validate_app_settings_command'); } catch (e) { console.warn('设置校验失败:', e); }

    const body = dialog.querySelector('.env-status__body') as HTMLElement | null;
    if (body) body.innerHTML = this.renderEnvStatusInner(settings, validation, isMacOS);

    dialog.querySelectorAll('.tool-card').forEach(card => {
      const field = (card as HTMLElement).getAttribute('data-tool') || '';
      const dot = card.querySelector('.tool-status-dot') as HTMLElement | null;
      if (field && dot) {
        const st = this.toolState(field, settings, validation);
        dot.className = `tool-status-dot ${st.state}`;
        dot.title = st.text;
      }
    });

    const pending = (validation?.issues || []).length;
    const badge = dialog.querySelector('.toolchain-badge') as HTMLElement | null;
    if (badge) badge.textContent = `${pending} 项待检查`;
    return pending;
  }

  /** 更新底部「上次保存」时间 */
  private updateLastSavedFooter(dialog: HTMLElement): void {
    const el = dialog.querySelector('.settings-footer__saved') as HTMLElement | null;
    if (el) el.innerHTML = `${getIcon('check-circle', 13)} 上次保存 ${SettingsDialog.formatSavedTime()}`;
  }

  /** 读取并格式化最近保存时间（HH:MM），无记录返回占位符 */
  private static formatSavedTime(): string {
    const raw = localStorage.getItem('settings-last-saved');
    if (!raw) return '--:--';
    const d = new Date(Number(raw));
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** 复制路径到剪贴板 */
  private async handleCopyPath(targetId: string, dialog: HTMLElement): Promise<void> {
    const input = dialog.querySelector(`#${targetId}`) as HTMLInputElement | null;
    const value = input?.value?.trim();
    if (!value) { this.showAlert('该工具尚未设置路径', 'warning'); return; }
    try {
      await navigator.clipboard.writeText(value);
      updateStatus('已复制路径到剪贴板');
    } catch (e) {
      console.error('复制失败:', e);
      this.showAlert('复制失败', 'error');
    }
  }

  /** 安装前展示第三方来源、许可证及兼容性提示。 */
  private toolInstallNotice(toolId: string, label: string): string {
    const common = `将从项目官方源下载 ${label}，校验完整性后安装到 Lovelymem V2 的应用数据目录，并自动回填路径。不会把工具加入系统 PATH。`;
    const notices: Record<string, string> = {
      python3: `${common}\n\n许可证：PSF License。`,
      python2: `${common}\n\n许可证：PSF License。\n警告：Python 2 已停止维护，不再接收安全更新；这里只用于兼容 Volatility 2。`,
      memprocfs: `${common}\n\n许可证：AGPL-3.0（包内部分组件可能采用其他许可证）。程序现有取证流程会传入 Elastic License 2.0 接受参数，以启用内置 FindEvil Yara 规则；继续前请审阅上游 LICENSE/NOTICE。缺少 Python 3 时会一并安装，用于配置 MemProcFS 的 Python 环境。Windows 挂载功能仍需单独安装 Dokany 2。`,
      volatility2: `${common}\n\n许可证：GPL-2.0。运行该工具还需要 Python 2；缺少时会一并安装固定版本。`,
      volatility3: `${common}\n\n许可证：Volatility Software License (VSL)。运行该工具还需要 Python 3；缺少时会一并安装固定版本。`,
      memnixfs: `${common}\n\n许可证：Apache-2.0。Windows 挂载功能还需要 WinFsp；出于驱动安装与权限安全考虑，本功能不会自动安装 WinFsp。`,
    };
    return translate(notices[toolId] || common);
  }

  /** 将后端下载阶段转换为稳定、可翻译的界面文案。 */
  private formatToolDownloadProgress(progress: ToolchainDownloadProgress): string {
    const downloaded = progress.downloaded ?? progress.downloaded_bytes ?? 0;
    const total = progress.total ?? progress.total_bytes ?? 0;
    const stage = progress.stage?.toLowerCase() || '';

    if ((stage === 'download' || stage === 'downloading') && total > 0) {
      const percent = Math.min(100, Math.max(0, Math.round((downloaded / total) * 100)));
      return `${translate('正在下载...')} ${percent}%`;
    }

    const stageText: Record<string, string> = {
      resolve: '正在获取官方版本...',
      resolving: '正在获取官方版本...',
      download: '正在下载...',
      downloading: '正在下载...',
      downloading_dependency: '正在下载工具依赖...',
      verify: '正在校验完整性...',
      verifying: '正在校验完整性...',
      extract: '正在安全解压...',
      extracting: '正在安全解压...',
      install: '正在安装...',
      installing: '正在安装...',
      configure: '正在配置工具环境...',
      configuring: '正在配置工具环境...',
      validate: '正在验证工具可用性...',
      validating: '正在验证工具可用性...',
      checking: '正在验证工具可用性...',
      complete: '安装完成',
      completed: '安装完成',
      error: '安装失败',
    };
    return translate(stageText[stage] || progress.message || '正在处理...');
  }

  /** 把安装器返回的所有设置路径写回当前对话框。 */
  private applyToolInstallResult(result: ToolchainInstallResult, dialog: HTMLElement): void {
    const installedPaths: Record<string, string> = {
      ...(result.related_paths || {}),
      [result.setting_key]: result.path,
    };
    const allTools = this.toolchainTools(false);

    Object.entries(installedPaths).forEach(([settingKey, path]) => {
      if (!settingKey || !path) return;
      const tool = allTools.find(item => item.setting === settingKey);
      const inputId = tool?.inputId || (settingKey === 'volatility2_plugin' ? 'volatility2-plugin' : '');
      if (!inputId) return;
      const input = dialog.querySelector(`#${inputId}`) as HTMLInputElement | null;
      if (input) input.value = path;
    });
  }

  /** 主工具失败时，同步后端已经成功安装并持久化的 Python 依赖。 */
  private async syncInstalledDependencyPath(toolId: string, dialog: HTMLElement): Promise<void> {
    const dependency = toolId === 'volatility2'
      ? { setting: 'python2_path', inputId: 'python2-path' }
      : (toolId === 'volatility3' || toolId === 'memprocfs'
        ? { setting: 'python3_path', inputId: 'python3-path' }
        : null);
    if (!dependency) return;

    const settings = await loadAppSettings() as unknown as Record<string, unknown>;
    const path = String(settings?.[dependency.setting] || '').trim();
    const input = dialog.querySelector(`#${dependency.inputId}`) as HTMLInputElement | null;
    if (path && input) input.value = path;
  }

  /** 执行单个工具安装；调用者负责确认与最终提示。 */
  private async installTool(
    toolId: string,
    dialog: HTMLElement,
    button: HTMLButtonElement,
    refreshUi = true,
  ): Promise<ToolchainInstallResult> {
    if (!detectPlatform().isWindows) {
      throw new Error('当前平台暂不支持一键下载');
    }

    const tool = this.toolchainTools(false).find(item => item.id === toolId);
    if (!tool) throw new Error('未知的工具标识');

    const card = button.closest('.tool-card') as HTMLElement | null;
    const progressElement = card?.querySelector('.tool-card__progress') as HTMLElement | null;
    const originalHtml = button.innerHTML;
    const originalTitle = button.title;
    let unlisten: (() => void) | undefined;

    const setProgress = (message: string, state = '') => {
      if (progressElement) {
        progressElement.textContent = message;
        progressElement.className = `tool-card__progress visible ${state}`.trim();
      }
      button.title = message;
      button.setAttribute('aria-label', message);
    };

    button.disabled = true;
    button.classList.add('is-downloading');
    button.innerHTML = getIcon('loading', 14);
    card?.classList.add('is-installing');
    setProgress(translate('正在准备下载...'));

    try {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<ToolchainDownloadProgress>('toolchain-download-progress', event => {
        const payload = event.payload;
        if (!payload) return;
        if (payload.tool_id === toolId) {
          setProgress(this.formatToolDownloadProgress(payload), payload.stage || '');
          return;
        }
        const dependencyId = toolId === 'volatility2'
          ? 'python2'
          : (toolId === 'volatility3' || toolId === 'memprocfs' ? 'python3' : '');
        if (payload.tool_id === dependencyId) {
          const dependencyLabel = dependencyId === 'python2' ? 'Python 2' : 'Python 3';
          setProgress(`${dependencyLabel}: ${this.formatToolDownloadProgress(payload)}`, payload.stage || '');
        }
      });

      const result = await invoke('install_toolchain_tool', { toolId }) as ToolchainInstallResult;
      if (!result?.setting_key || !result?.path) {
        throw new Error('安装器未返回有效的工具路径');
      }

      this.applyToolInstallResult(result, dialog);
      await this.persistSettings(await this.buildUpdatedSettings(dialog));

      // MemProcFS 需要独立的 Python 子环境；已有 Python 3 时一并配置。
      if (toolId === 'memprocfs' && (dialog.querySelector('#python3-path') as HTMLInputElement | null)?.value.trim()) {
        setProgress(translate('正在配置 MemProcFS Python 环境...'), 'configuring');
        await invoke('fix_memprocfs_python_env');
      }

      if (refreshUi) {
        await this.refreshEnvStatus(dialog);
        this.updateLastSavedFooter(dialog);
      }
      setProgress(translate('安装完成'), 'complete');
      window.setTimeout(() => {
        if (progressElement?.classList.contains('complete')) {
          progressElement.textContent = '';
          progressElement.className = 'tool-card__progress';
        }
      }, 4000);
      return result;
    } catch (error) {
      try {
        await this.syncInstalledDependencyPath(toolId, dialog);
        if (refreshUi) await this.refreshEnvStatus(dialog);
      } catch (syncError) {
        console.warn('[Settings] 同步已安装的工具依赖失败:', syncError);
      }
      setProgress(translate('安装失败'), 'error');
      throw error;
    } finally {
      unlisten?.();
      button.disabled = false;
      button.classList.remove('is-downloading');
      button.innerHTML = originalHtml;
      button.title = originalTitle;
      button.setAttribute('aria-label', originalTitle);
      card?.classList.remove('is-installing');
    }
  }

  /** 单张工具卡的一键下载入口。 */
  private async handleDownloadTool(toolId: string, dialog: HTMLElement, button: HTMLButtonElement): Promise<void> {
    const tool = this.toolchainTools(false).find(item => item.id === toolId);
    if (!tool) {
      await this.showAlert('未知的工具标识', 'error');
      return;
    }

    const confirmed = await this.showConfirm(this.toolInstallNotice(toolId, tool.label), {
      title: `${translate('一键下载')} ${tool.label}`,
      confirmText: translate('下载并安装'),
      cancelText: translate('取消'),
      danger: toolId === 'python2',
    });
    if (!confirmed) return;

    try {
      await this.installTool(toolId, dialog, button);
      await this.showAlert(`${tool.label} ${translate('已下载、校验并自动配置完成。')}`, 'success', translate('工具安装完成'));
    } catch (error) {
      console.error(`[Settings] ${tool.label} 一键下载失败:`, error);
      await this.showAlert(`${tool.label} ${translate('一键下载失败：')}${translate(friendlyError(error).message)}`, 'error', translate('工具安装失败'));
    }
  }

  /** 依次下载所有尚未就绪的内置工具。 */
  private async handleDownloadAllTools(dialog: HTMLElement, button: HTMLButtonElement): Promise<void> {
    if (!detectPlatform().isWindows) {
      await this.showAlert('当前平台暂不支持一键下载', 'warning');
      return;
    }

    const { isMacOS } = detectPlatform();
    const orderedIds = ['python3', 'python2', 'memprocfs', 'volatility2', 'volatility3', 'memnixfs'];
    const visibleTools = this.toolchainTools(isMacOS);
    const missingTools = orderedIds
      .map(id => visibleTools.find(tool => tool.id === id))
      .filter((tool): tool is (typeof visibleTools)[number] => tool !== undefined)
      .filter(tool => {
        const card = dialog.querySelector(`.tool-card[data-tool-id="${tool.id}"]`);
        return !card?.querySelector('.tool-status-dot')?.classList.contains('ok');
      });

    if (missingTools.length === 0) {
      await this.showAlert(translate('全部内置工具均已配置，无需重复下载。'), 'success', translate('工具链已就绪'));
      return;
    }

    const licenseNotices = missingTools
      .map(tool => this.toolInstallNotice(tool.id, tool.label))
      .join('\n\n────────\n\n');
    const notice = `${translate('将按依赖顺序从官方源下载并安装以下工具：')}\n${missingTools.map(tool => `• ${tool.label}`).join('\n')}\n\n${translate('每个下载都会校验完整性，安装路径会自动保存。')}\n\n${translate('请逐项审阅并确认以下第三方许可与依赖说明：')}\n\n${licenseNotices}`;

    const confirmed = await this.showConfirm(notice, {
      title: translate('下载全部缺失工具'),
      confirmText: translate('开始下载'),
      cancelText: translate('取消'),
      danger: missingTools.some(tool => tool.id === 'python2'),
    });
    if (!confirmed) return;

    const originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add('is-downloading');
    const succeeded: string[] = [];
    const failed: string[] = [];

    try {
      for (let index = 0; index < missingTools.length; index++) {
        const tool = missingTools[index];
        button.innerHTML = `<span class="qa-icon">${getIcon('loading', 16)}</span><span class="qa-text"><b>${translate('正在安装')} ${index + 1}/${missingTools.length}</b><small>${tool.label}</small></span>`;
        const toolButton = dialog.querySelector(`.tool-download-btn[data-tool-id="${tool.id}"]`) as HTMLButtonElement | null;
        if (!toolButton) {
          failed.push(`${tool.label}：${translate('未找到下载按钮')}`);
          continue;
        }
        try {
          await this.installTool(tool.id, dialog, toolButton, false);
          succeeded.push(tool.label);
        } catch (error) {
          console.error(`[Settings] ${tool.label} 批量安装失败:`, error);
          failed.push(`${tool.label}：${translate(friendlyError(error).message)}`);
        }
      }
      await this.refreshEnvStatus(dialog);
      this.updateLastSavedFooter(dialog);
    } finally {
      button.disabled = false;
      button.classList.remove('is-downloading');
      button.innerHTML = originalHtml;
    }

    if (failed.length === 0) {
      await this.showAlert(`${translate('已完成工具的下载、校验与自动配置。')} (${succeeded.length})`, 'success', translate('工具链安装完成'));
    } else {
      const summary = `${translate('成功')} ${succeeded.length}，${translate('失败')} ${failed.length}。\n\n${failed.join('\n')}`;
      await this.showAlert(summary, 'warning', translate('工具链安装部分完成'));
    }
  }

  /** 一键检测：重新校验并刷新环境状态 */
  private async handleOneClickDetect(dialog: HTMLElement): Promise<void> {
    const btn = dialog.querySelector('[data-action="one-click-detect"]') as HTMLButtonElement | null;
    const restore = () => { if (btn) { btn.disabled = false; btn.innerHTML = `<span class="btn-icon">${getIcon('shield', 14)}</span> 一键检测`; } };
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="btn-icon">${getIcon('refresh', 14)}</span> 检测中...`; }
    try {
      const pending = await this.refreshEnvStatus(dialog);
      this.showAlert(pending > 0 ? `检测完成：发现 ${pending} 项待处理` : '检测完成：环境配置就绪', pending > 0 ? 'warning' : 'success', '环境检测');
    } finally {
      restore();
    }
  }

  /** 导入配置 */
  private async handleImportConfig(): Promise<void> {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const picked = await open({ title: translate('导入设置配置'), multiple: false, directory: false, filters: [{ name: translate('JSON 配置'), extensions: ['json'] }] });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (!path || typeof path !== 'string') return;

      const ok = await this.showConfirm('导入配置将用文件中的值覆盖当前设置（含主题 / AI / 自定义工具等）。\n\n确定要导入吗？', { title: '导入配置', confirmText: '导入', cancelText: '取消', danger: true });
      if (!ok) return;

      const merged = await invoke('import_settings_command', { path }) as any;
      const { emit } = await import('@tauri-apps/api/event');
      await emit('settings-updated', merged);
      localStorage.setItem('settings-last-saved', String(Date.now()));
      this.showAlert('配置已导入并保存', 'success', '导入完成');
      await this.showSettingsDialog();
    } catch (e) {
      console.error('导入配置失败:', e);
      this.showAlert('导入配置失败: ' + friendlyError(e).message, 'error');
    }
  }

  /** 导出配置 */
  private async handleExportConfig(): Promise<void> {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ title: translate('导出设置配置'), defaultPath: 'lovelymem-settings.json', filters: [{ name: translate('JSON 配置'), extensions: ['json'] }] });
      if (!path) return;
      await invoke('export_settings_command', { path });
      this.showAlert('配置已导出', 'success', '导出完成');
    } catch (e) {
      console.error('导出配置失败:', e);
      this.showAlert('导出配置失败: ' + friendlyError(e).message, 'error');
    }
  }

  /** 重置全部工具 / 路径配置 */
  private async handleResetPaths(): Promise<void> {
    const ok = await this.showConfirm('确定要重置全部工具 / 路径配置为默认值吗？\n（主题、AI、自定义工具等设置不受影响）', { title: '重置路径', confirmText: '重置', cancelText: '取消', danger: true });
    if (!ok) return;
    try {
      const merged = await invoke('reset_tool_paths_command') as any;
      const { emit } = await import('@tauri-apps/api/event');
      await emit('settings-updated', merged);
      localStorage.setItem('settings-last-saved', String(Date.now()));
      this.showAlert('已重置全部工具 / 路径配置', 'success', '重置完成');
      await this.showSettingsDialog();
    } catch (e) {
      console.error('重置路径失败:', e);
      this.showAlert('重置路径失败: ' + friendlyError(e).message, 'error');
    }
  }

  /**
   * 浏览并选择文件
   */
  private async browseForFile(settingKey: string, dialog: HTMLElement): Promise<void> {
    console.log('browseForFile 被调用，settingKey:', settingKey);
    try {
      let title = '';
      let filters: string[] = [];

      switch (settingKey) {
        case 'python2_path':
          title = '选择 Python 2 执行文件';
          // macOS 和 Linux 上的可执行文件通常没有扩展名
          filters = [];
          break;
        case 'python3_path':
          title = '选择 Python 3 执行文件';
          // macOS 和 Linux 上的可执行文件通常没有扩展名
          filters = [];
          break;
        case 'memprocfs_path':
          title = '选择 MemProcFS 执行文件';
          // macOS 上的可执行文件通常没有扩展名，所以不设置过滤器
          filters = [];
          break;
        case 'dumpit_path':
          title = '选择 DumpIt 执行文件';
          filters = [];
          break;
        case 'volatility2_path':
          title = '选择 Volatility 2 路径';
          filters = ['py'];
          break;
        case 'volatility2_plugin':
          title = '选择 Volatility 2 插件目录';
          filters = [];
          break;
        case 'volatility3_path':
          title = '选择 Volatility 3 路径';
          filters = ['py'];
          break;
        case 'memnixfs_path':
          title = '选择 MemNixFS 执行文件';
          filters = [];
          break;
        case 'memnixfs_symbols_path':
          title = '选择 Linux 内核 ISF 符号目录';
          filters = [];
          break;
        case 'memnixfs_vmlinux_path':
          title = '选择 vmlinux 文件';
          filters = [];
          break;
        case 'memnixfs_symbol_cache_path':
          title = '选择 MemNixFS 符号缓存目录';
          filters = [];
          break;
        case 'output_path':
          title = '选择文件输出目录';
          filters = [];
          break;
        case 'warning_path':
          title = '选择告警目录';
          filters = [];
          break;
        case 'scripts_path':
          title = '选择脚本存储目录';
          filters = [];
          break;
        case 'extensions_path':
          title = '选择扩展程序目录';
          filters = [];
          break;
        case 'tooltip_rules_path':
          title = '选择工具提示规则目录';
          filters = [];
          break;
        case 'yara_rules_path':
          title = '选择YARA规则文件';
          filters = ['yar'];
          break;
        case 'markdown_save_path':
          title = '选择Markdown报告保存目录';
          filters = [];
          break;
      }

      let result: string | null = null;
      if (settingKey === 'output_path' ||
          settingKey === 'scripts_path' || settingKey === 'extensions_path' ||
          settingKey === 'tooltip_rules_path' || settingKey === 'volatility2_plugin' ||
          settingKey === 'markdown_save_path' || settingKey === 'warning_path' ||
          settingKey === 'memnixfs_symbols_path' || settingKey === 'memnixfs_symbol_cache_path') {
        result = await invoke('select_folder_path', { title: translate(title) }) as string | null;
      } else {
        result = await invoke('select_file_path', { title: translate(title), filters }) as string | null;
      }

      if (result) {
        console.log(`[Settings] 用户选择了路径: ${result}`);

        // 如果是输出目录，需要验证是否为空文件夹
        if (settingKey === 'output_path') {
          try {
            const isEmpty = await invoke('is_folder_empty', { path: result }) as boolean;
            if (!isEmpty) {
              const confirmResult = await this.showConfirm(
                '选择的目录不为空！\n\n文件输出目录应该是空文件夹，以避免与现有文件冲突。\n继续使用此目录可能会覆盖现有文件。\n\n是否仍要使用此目录？',
                { title: '警告', confirmText: '继续使用', cancelText: '取消', danger: true }
              );
              if (!confirmResult) {
                console.log('用户取消了非空目录的选择');
                return;
              }
            }
          } catch (error) {
            console.error('检查文件夹是否为空时出错:', error);
            this.showAlert('检查文件夹状态失败', 'error');
            return;
          }
        }

        // 根据设置键生成正确的输入框ID
        let inputId: string;
        switch (settingKey) {
          case 'python2_path':
            inputId = 'python2-path';
            break;
          case 'python3_path':
            inputId = 'python3-path';
            break;
          case 'memprocfs_path':
            inputId = 'memprocfs-path';
            break;
          case 'dumpit_path':
            inputId = 'dumpit-path';
            break;
          case 'volatility2_path':
            inputId = 'volatility2-path';
            break;
          case 'volatility2_plugin':
            inputId = 'volatility2-plugin';
            break;
          case 'volatility3_path':
            inputId = 'volatility3-path';
            break;
          case 'memnixfs_path':
            inputId = 'memnixfs-path';
            break;
          case 'memnixfs_symbols_path':
            inputId = 'memnixfs-symbols-path';
            break;
          case 'memnixfs_vmlinux_path':
            inputId = 'memnixfs-vmlinux-path';
            break;
          case 'memnixfs_symbol_cache_path':
            inputId = 'memnixfs-symbol-cache-path';
            break;
          case 'output_path':
            inputId = 'output-path';
            break;
          case 'warning_path':
            inputId = 'warning-path';
            break;
          case 'scripts_path':
            inputId = 'scripts-path';
            break;
          case 'extensions_path':
            inputId = 'extensions-path';
            break;
          case 'tooltip_rules_path':
            inputId = 'tooltip-rules-path';
            break;
          case 'yara_rules_path':
            inputId = 'yara-rules-path';
            break;
          case 'markdown_save_path':
            inputId = 'markdown-save-path';
            break;
          default:
            inputId = settingKey.replace('_path', '-path');
        }

        const input = dialog.querySelector(`#${inputId}`) as HTMLInputElement;
        if (input) {
          input.value = result;
          console.log(`[Settings] 已更新 ${settingKey} 的值: ${result}`);
        } else {
          console.error(`[Settings] 找不到输入框: #${inputId}`);
        }
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      this.showAlert('选择文件失败', 'error');
    }
  }

  /**
   * 保存设置
   */
  private async saveSettings(dialog: HTMLElement, overlay: HTMLElement): Promise<void> {
    try {
      const updatedSettings = await this.buildUpdatedSettings(dialog);
      await this.persistSettings(updatedSettings);

      overlay.remove();
      dialog.remove();
      this.showAlert('设置已保存', 'success');
    } catch (error) {
      console.error('保存设置失败:', error);
      this.showAlert('保存设置失败，请重试', 'error');
    }
  }

  /**
   * 收集设置对话框中的全部字段，合并到现有设置（保留界面未管理的字段）
   */
  private async buildUpdatedSettings(dialog: HTMLElement): Promise<any> {
    // 先加载现有设置，只更新界面上的字段，保留其他字段
    const currentSettings = await loadAppSettings();

    return {
      ...currentSettings,
      language: (dialog.querySelector('#language') as HTMLSelectElement)?.value || 'zh-CN',
      python2_path: (dialog.querySelector('#python2-path') as HTMLInputElement)?.value || '',
      python3_path: (dialog.querySelector('#python3-path') as HTMLInputElement)?.value || '',
      memprocfs_path: (dialog.querySelector('#memprocfs-path') as HTMLInputElement)?.value || '',
      mount_drive_letter: ((dialog.querySelector('#mount-drive-letter') as HTMLInputElement)?.value || 'M').trim().charAt(0).toUpperCase() || 'M',
      dumpit_path: (dialog.querySelector('#dumpit-path') as HTMLInputElement)?.value || '',
      volatility2_path: (dialog.querySelector('#volatility2-path') as HTMLInputElement)?.value || '',
      volatility2_plugin: (dialog.querySelector('#volatility2-plugin') as HTMLInputElement)?.value || '',
      volatility3_path: (dialog.querySelector('#volatility3-path') as HTMLInputElement)?.value || '',
      memnixfs_path: (dialog.querySelector('#memnixfs-path') as HTMLInputElement)?.value || '',
      memnixfs_symbols_path: (dialog.querySelector('#memnixfs-symbols-path') as HTMLInputElement)?.value || '',
      memnixfs_vmlinux_path: (dialog.querySelector('#memnixfs-vmlinux-path') as HTMLInputElement)?.value || '',
      memnixfs_symbol_cache_path: (dialog.querySelector('#memnixfs-symbol-cache-path') as HTMLInputElement)?.value || '',
      memnixfs_forensic_mode: (dialog.querySelector('#memnixfs-forensic-mode') as HTMLSelectElement)?.value || 'smart',
      memnixfs_auto_fetch: (dialog.querySelector('#memnixfs-auto-fetch') as HTMLInputElement)?.checked || false,
      memnixfs_proxy: (dialog.querySelector('#memnixfs-proxy') as HTMLInputElement)?.value || '',
      memprocfs_update_url: (dialog.querySelector('#memprocfs-update-url') as HTMLInputElement)?.value ?? '',
      output_path: (dialog.querySelector('#output-path') as HTMLInputElement)?.value || 'output',
      warning_path: (dialog.querySelector('#warning-path') as HTMLInputElement)?.value || '',
      scripts_path: (dialog.querySelector('#scripts-path') as HTMLInputElement)?.value || 'scripts',
      extensions_path: (dialog.querySelector('#extensions-path') as HTMLInputElement)?.value || 'extensions',
      tooltip_rules_path: (dialog.querySelector('#tooltip-rules-path') as HTMLInputElement)?.value || 'tooltip_rules',
      markdown_save_path: (dialog.querySelector('#markdown-save-path') as HTMLInputElement)?.value || 'markdown',
      volatility2_profile: (dialog.querySelector('#volatility2-profile') as HTMLSelectElement)?.value || 'Win7SP1x64',
      ai_default_agent: (dialog.querySelector('#ai-default-agent') as HTMLSelectElement)?.value || 'general',
      ai_temperature: parseInt((dialog.querySelector('#ai-temperature') as HTMLInputElement)?.value || '70') / 100,
      ai_max_tokens: parseInt((dialog.querySelector('#ai-max-tokens') as HTMLSelectElement)?.value || '2000'),
      yara_enabled: (dialog.querySelector('#yara-enabled') as HTMLInputElement)?.checked || false,
      yara_rules_path: (dialog.querySelector('#yara-rules-path') as HTMLInputElement)?.value || '',
      vol_cache_enabled: (dialog.querySelector('#vol-cache-enabled') as HTMLInputElement)?.checked ?? true,
    };
  }

  /**
   * 持久化设置并广播更新事件（不关闭对话框）
   */
  private async persistSettings(updatedSettings: any): Promise<void> {
    await invoke('save_settings_command', { settings: updatedSettings });
    localStorage.setItem('settings-last-saved', String(Date.now()));

    await setAppLanguage(updatedSettings.language);

    // 发送设置更新事件，以便主应用可以实时更新状态
    const { emit } = await import('@tauri-apps/api/event');
    await emit('settings-updated', updatedSettings);
  }

  /**
   * 加载自定义工具列表
   */
  private loadCustomToolsList(dialog: HTMLElement, customTools: any[]): void {
    const toolsList = dialog.querySelector('#custom-tools-list') as HTMLElement;
    if (!toolsList) return;

    if (customTools.length === 0) {
      toolsList.innerHTML = `
        <div class="no-tools-message">
          <span><span class="hint-icon">${getIcon('info', 12)}</span> 暂无自定义工具，点击上方按钮添加工具</span>
        </div>
      `;
      return;
    }

    toolsList.innerHTML = customTools.map(tool => `
      <div class="custom-tool-item ${!tool.enabled ? 'disabled' : ''}">
        <div class="tool-info">
          <div class="tool-icon">${tool.icon}</div>
          <div class="tool-details">
            <div class="tool-name">${tool.name}</div>
            <div class="tool-description">${tool.description}</div>
            <div class="tool-command"><span class="cmd-icon">${getIcon('folder-open', 12)}</span> ${tool.command}</div>
          </div>
        </div>
        <div class="tool-actions">
          <button class="tool-action-btn ${tool.enabled ? 'enabled' : 'disabled'}"
                  data-action="toggle-tool"
                  data-tool-id="${tool.id}"
                  title="${tool.enabled ? '禁用' : '启用'}">
            ${tool.enabled ? getIcon('check-circle', 14) : getIcon('close-circle', 14)}
          </button>
          <button class="tool-action-btn"
                  data-action="edit-tool"
                  data-tool-id="${tool.id}"
                  title="编辑">
            ${getIcon('edit', 14)}
          </button>
          <button class="tool-action-btn delete"
                  data-action="delete-tool"
                  data-tool-id="${tool.id}"
                  title="删除">
            ${getIcon('delete', 14)}
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * 显示自定义工具编辑器
   */
  private async showCustomToolEditor(dialog: HTMLElement, toolId?: string): Promise<void> {
    let existingTool = null;
    if (toolId) {
      try {
        const tools = await invoke('load_custom_tools') as any[];
        existingTool = tools.find(t => t.id === toolId);
      } catch (error) {
        console.error('加载工具失败:', error);
        return;
      }
    }

    const editorHtml = `
      <div class="tool-editor-overlay">
        <div class="tool-editor-modal">
          <div class="tool-editor-header">
            <h3>${existingTool ? `<span class="editor-title-icon">${getIcon('edit', 16)}</span> 编辑工具` : `<span class="editor-title-icon">${getIcon('plus', 16)}</span> 添加工具`}</h3>
            <button class="close-editor-btn">${getIcon('close', 14)}</button>
          </div>
          <div class="tool-editor-body">
            <form class="tool-form">
              <div class="form-group">
                <label>工具名称:</label>
                <input type="text" name="name" value="${existingTool?.name || ''}" required>
              </div>
              <div class="form-group">
                <label>工具描述:</label>
                <textarea name="description" rows="2">${existingTool?.description || ''}</textarea>
              </div>
              <div class="form-group">
                <label>命令路径:</label>
                <div class="path-input-group">
                  <input type="text" name="command" value="${existingTool?.command || ''}" required readonly>
                  <button type="button" class="browse-tool-btn">浏览</button>
                </div>
              </div>
              <div class="form-group">
                <label>命令参数:</label>
                <input type="text" name="arguments" value="${existingTool?.arguments || ''}"
                       placeholder="使用 {变量名} 作为占位符，如: -f {selected_file}">
                <div class="form-hint">
                  <span class="hint-icon">${getIcon('info', 12)}</span> 可用变量: {selected_file}, {selected_row}, {selected_cell}, {current_image_path} 等
                </div>
              </div>
              <div class="form-group">
                <label>工具图标:</label>
                <input type="text" name="icon" value="${existingTool?.icon || '🛠️'}" maxlength="2">
              </div>
              <div class="form-group">
                <label>
                  <input type="checkbox" name="enabled" ${existingTool?.enabled !== false ? 'checked' : ''}>
                  启用此工具
                </label>
              </div>
            </form>
          </div>
          <div class="tool-editor-footer">
            <button class="cancel-tool-btn">取消</button>
            <button class="save-tool-btn">${existingTool ? '更新' : '添加'}</button>
          </div>
        </div>
      </div>
    `;

    const editorDiv = document.createElement('div');
    editorDiv.innerHTML = editorHtml;
    dialog.appendChild(editorDiv);

    // 绑定编辑器事件
    this.bindToolEditorEvents(dialog, editorDiv, existingTool);
  }

  /**
   * 绑定工具编辑器事件
   */
  private bindToolEditorEvents(dialog: HTMLElement, editorDiv: HTMLElement, existingTool: any): void {
    const closeBtn = editorDiv.querySelector('.close-editor-btn');
    const cancelBtn = editorDiv.querySelector('.cancel-tool-btn');
    const saveBtn = editorDiv.querySelector('.save-tool-btn');
    const browseBtn = editorDiv.querySelector('.browse-tool-btn');
    const form = editorDiv.querySelector('.tool-form') as HTMLFormElement;

    // 关闭编辑器
    const closeEditor = () => {
      editorDiv.remove();
    };

    closeBtn?.addEventListener('click', closeEditor);
    cancelBtn?.addEventListener('click', closeEditor);

    // 浏览文件
    browseBtn?.addEventListener('click', async () => {
      try {
        const result = await invoke('select_file_path', {
          title: translate('选择工具可执行文件'),
          filters: ['exe', 'bat', 'cmd', 'py']
        }) as string | null;

        if (result) {
          const commandInput = form.querySelector('[name="command"]') as HTMLInputElement;
          if (commandInput) {
            commandInput.value = result;
          }
        }
      } catch (error) {
        console.error('选择文件失败:', error);
      }
    });

    // 保存工具
    saveBtn?.addEventListener('click', async () => {
      const formData = new FormData(form);
      const toolData = {
        id: existingTool?.id || this.generateId(),
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        command: formData.get('command') as string,
        arguments: formData.get('arguments') as string,
        icon: formData.get('icon') as string,
        enabled: formData.has('enabled'),
        created_at: existingTool?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log('准备保存工具数据:', toolData);

      if (!toolData.name.trim() || !toolData.command.trim()) {
        this.showAlert('请填写工具名称和命令路径', 'warning');
        return;
      }

      try {
        if (existingTool) {
          console.log('更新现有工具:', existingTool.id);
          await invoke('update_custom_tool', { toolId: existingTool.id, updatedTool: toolData });
          console.log('工具更新成功');
          this.showAlert('工具更新成功', 'success');
        } else {
          console.log('添加新工具');
          await invoke('add_custom_tool', { tool: toolData });
          console.log('工具添加成功');
          this.showAlert('工具添加成功', 'success');
        }

        // 重新加载工具列表
        console.log('重新加载工具列表...');
        const tools = await invoke('load_custom_tools') as any[];
        console.log('加载到的工具:', tools);
        this.loadCustomToolsList(dialog, tools);
        closeEditor();
      } catch (error) {
        console.error('保存工具失败:', error);
        this.showAlert('保存工具失败: ' + error, 'error');
      }
    });
  }

  /**
   * 删除自定义工具
   */
  private async deleteCustomTool(dialog: HTMLElement, toolId: string): Promise<void> {
    try {
      await invoke('delete_custom_tool', { toolId });
      this.showAlert('工具删除成功', 'success');

      // 重新加载工具列表
      const tools = await invoke('load_custom_tools') as any[];
      this.loadCustomToolsList(dialog, tools);
    } catch (error) {
      console.error('删除工具失败:', error);
      this.showAlert('删除工具失败，请重试', 'error');
    }
  }

  /**
   * 切换工具启用状态
   */
  private async toggleCustomTool(dialog: HTMLElement, toolId: string): Promise<void> {
    try {
      const tools = await invoke('load_custom_tools') as any[];
      const tool = tools.find(t => t.id === toolId);

      if (tool) {
        tool.enabled = !tool.enabled;
        tool.updated_at = new Date().toISOString();

        await invoke('update_custom_tool', { toolId, updatedTool: tool });
        this.showAlert(`工具已${tool.enabled ? '启用' : '禁用'}`, 'success');

        // 重新加载工具列表
        const updatedTools = await invoke('load_custom_tools') as any[];
        this.loadCustomToolsList(dialog, updatedTools);
      }
    } catch (error) {
      console.error('切换工具状态失败:', error);
      this.showAlert('操作失败，请重试', 'error');
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return 'tool_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
  }

  /**
   * 执行一键配置
   */
  private async performAutoConfig(dialog: HTMLElement): Promise<void> {
    const autoConfigBtn = dialog.querySelector('[data-action="auto-config"]') as HTMLButtonElement;
    const restoreBtn = () => {
      if (autoConfigBtn) {
        autoConfigBtn.disabled = false;
        autoConfigBtn.innerHTML = `<span class="btn-icon">${getIcon('flash', 14)}</span> 一键配置`;
      }
    };

    try {
      // 显示加载状态
      if (autoConfigBtn) {
        autoConfigBtn.disabled = true;
        autoConfigBtn.innerHTML = `<span class="btn-icon">${getIcon('refresh', 14)}</span> 智能搜索中...`;
      }

      // 智能探测工具路径（多目录搜索 + 校验真实存在）；失败时回退到旧的固定路径推算
      const detected = await this.detectAppPaths();
      console.log('[Settings] 智能探测结果:', detected);

      // inputId → 设置字段 + 友好名称（含 label 的为需要校验存在性的工具项）
      const pathMappings: Array<{ inputId: string; pathKey: string; label?: string }> = [
        { inputId: 'python2-path', pathKey: 'python2_path', label: 'Python 2' },
        { inputId: 'python3-path', pathKey: 'python3_path', label: 'Python 3' },
        { inputId: 'memprocfs-path', pathKey: 'memprocfs_path', label: 'MemProcFS' },
        { inputId: 'dumpit-path', pathKey: 'dumpit_path' },
        { inputId: 'volatility2-path', pathKey: 'volatility2_path', label: 'Volatility 2' },
        { inputId: 'volatility2-plugin', pathKey: 'volatility2_plugin', label: 'Volatility 2 插件目录' },
        { inputId: 'volatility3-path', pathKey: 'volatility3_path', label: 'Volatility 3' },
        { inputId: 'memnixfs-path', pathKey: 'memnixfs_path', label: 'MemNixFS' },
        { inputId: 'output-path', pathKey: 'output_path' },
        { inputId: 'scripts-path', pathKey: 'scripts_path' },
        { inputId: 'extensions-path', pathKey: 'extensions_path' },
        { inputId: 'tooltip-rules-path', pathKey: 'tooltip_rules_path' }
      ];

      let configuredCount = 0;
      const missingTools: string[] = [];
      pathMappings.forEach(({ inputId, pathKey, label }) => {
        const input = dialog.querySelector(`#${inputId}`) as HTMLInputElement;
        const item = detected[pathKey];
        if (input && item && item.found && item.path) {
          // 仅在真实命中时填充，避免写入不存在的路径
          input.value = item.path;
          configuredCount++;
        } else if (label && (!item || !item.found)) {
          // 仅工具项（带 label）在未找到时提示用户手动补充
          missingTools.push(label);
        }
      });

      restoreBtn();

      // 默认保存：匹配完成后直接落盘并广播，无需用户再点"保存设置"
      await this.persistSettings(await this.buildUpdatedSettings(dialog));

      // 刷新右侧环境状态、卡片状态点与底部保存时间
      await this.refreshEnvStatus(dialog);
      this.updateLastSavedFooter(dialog);

      let message = `智能匹配完成，已自动保存！\n\n✅ 成功匹配并保存 ${configuredCount} 项配置`;
      if (missingTools.length > 0) {
        message += `\n\n⚠️ 未找到 ${missingTools.length} 项：${missingTools.join('、')}\n可点击对应的"浏览"按钮手动指定路径。`;
      }
      this.showAlert(message, 'success', '智能配置完成');

    } catch (error) {
      console.error('一键配置失败:', error);
      restoreBtn();
      this.showAlert('一键配置失败: ' + friendlyError(error).message, 'error');
    }
  }

  /**
   * 智能探测应用程序工具路径，失败时回退到旧的固定路径推算逻辑。
   * 统一返回 { [field]: { path, found } } 结构。
   */
  private async detectAppPaths(): Promise<Record<string, { path: string; found: boolean }>> {
    try {
      return await invoke('smart_detect_app_paths') as Record<string, { path: string; found: boolean }>;
    } catch (e) {
      console.warn('[Settings] 智能探测失败，回退到默认路径推算:', e);
      // 回退：旧逻辑不校验存在性，统一标记为 found 以保留原行为
      const legacy = await invoke('get_app_paths') as Record<string, string>;
      const result: Record<string, { path: string; found: boolean }> = {};
      Object.entries(legacy).forEach(([k, v]) => {
        result[k] = { path: v, found: !!v };
      });
      return result;
    }
  }

  /**
   * 加载AI提供商列表
   */
  private async loadAiProvidersList(dialog: HTMLElement, aiProviders: any[], currentProviderId?: string): Promise<void> {
    const providersList = dialog.querySelector('#ai-providers-list') as HTMLElement;
    if (!providersList) return;

    if (aiProviders.length === 0) {
      providersList.innerHTML = `
        <div class="no-tools-message">
          <span><span class="hint-icon">${getIcon('info', 12)}</span> 暂无AI提供商，点击上方按钮添加</span>
        </div>
      `;
      return;
    }

    providersList.innerHTML = aiProviders.map(provider => `
      <div class="ai-provider-card ${!provider.enabled ? 'disabled' : ''} ${provider.id === currentProviderId ? 'current' : ''}" data-provider-id="${provider.id}">
        <div class="ai-provider-info">
          <div class="ai-provider-name">
            ${provider.name}
            ${provider.id === currentProviderId ? '<span class="current-badge">当前使用</span>' : ''}
            ${!provider.enabled ? '<span class="disabled-badge">已禁用</span>' : ''}
          </div>
          <div class="ai-provider-meta">${provider.model} · ${provider.base_url}</div>
          <div class="ai-provider-status" id="status-${provider.id}"></div>
        </div>
        <div class="ai-provider-actions">
          ${provider.id !== currentProviderId ? `<button class="tool-action-btn" data-action="set-current-ai-provider" data-provider-id="${provider.id}" title="设为当前">${getIcon('check', 14)}</button>` : ''}
          <button class="tool-action-btn" data-action="toggle-ai-provider" data-provider-id="${provider.id}" title="${provider.enabled ? '禁用' : '启用'}">${provider.enabled ? getIcon('preview-open', 14) : getIcon('forbid', 14)}</button>
          <button class="tool-action-btn" data-action="edit-ai-provider" data-provider-id="${provider.id}" title="编辑">${getIcon('edit', 14)}</button>
          <button class="tool-action-btn delete" data-action="delete-ai-provider" data-provider-id="${provider.id}" title="删除">${getIcon('delete', 14)}</button>
        </div>
      </div>
    `).join('');
  }

  /**
   * 显示AI提供商编辑器
   */
  private async showAiProviderEditor(dialog: HTMLElement, providerId?: string): Promise<void> {
    let existingProvider = null;
    if (providerId) {
      try {
        const providers = await invoke('load_ai_providers') as any[];
        existingProvider = providers.find(p => p.id === providerId);
      } catch (error) {
        console.error('加载提供商失败:', error);
        return;
      }
    }

    const editorOverlay = document.createElement('div');
    editorOverlay.className = 'settings-overlay';
    editorOverlay.style.zIndex = '10002';

    const editorDialog = document.createElement('div');
    editorDialog.className = 'settings-modal';
    editorDialog.style.position = 'fixed';
    editorDialog.style.top = '50%';
    editorDialog.style.left = '50%';
    editorDialog.style.transform = 'translate(-50%, -50%)';
    editorDialog.style.zIndex = '10003';
    editorDialog.style.maxWidth = '600px';
    editorDialog.style.width = '90%';

    editorDialog.innerHTML = `
      <div class="settings-header">
        <h2>${existingProvider ? `<span class="editor-title-icon">${getIcon('edit', 18)}</span> 编辑AI提供商` : `<span class="editor-title-icon">${getIcon('plus', 18)}</span> 添加AI提供商`}</h2>
        <button class="close-btn" id="close-provider-editor">${getIcon('close', 14)}</button>
      </div>
      <div class="settings-content" style="max-height: 60vh; overflow-y: auto; padding: 24px;">
        <div class="settings-section">
          ${!existingProvider ? `
          <div class="setting-item">
            <label>快速预设:</label>
            <div class="ai-preset-buttons">
              <button class="ai-preset-btn" data-preset="openai" title="OpenAI">
                <span class="ai-preset-icon openai">${getIcon('dot', 10)}</span> OpenAI
              </button>
              <button class="ai-preset-btn" data-preset="anthropic" title="Anthropic Claude">
                <span class="ai-preset-icon anthropic">${getIcon('dot', 10)}</span> Claude
              </button>
              <button class="ai-preset-btn" data-preset="deepseek" title="DeepSeek">
                <span class="ai-preset-icon deepseek">${getIcon('dot', 10)}</span> DeepSeek
              </button>
              <button class="ai-preset-btn" data-preset="ollama" title="Ollama 本地模型">
                <span class="ai-preset-icon ollama">${getIcon('dot', 10)}</span> Ollama
              </button>
              <button class="ai-preset-btn" data-preset="volcengine" title="火山引擎">
                <span class="ai-preset-icon volcengine">${getIcon('dot', 10)}</span> 火山引擎
              </button>
              <button class="ai-preset-btn" data-preset="clawnode" title="ClawNode 中转站">
                <span class="ai-preset-icon clawnode">${getIcon('dot', 10)}</span> ClawNode
              </button>
            </div>
            <div class="setting-hint">
              <span><span class="hint-icon">${getIcon('info', 12)}</span> 点击预设自动填充配置，之后只需填入 API Key</span>
            </div>
          </div>
          ` : ''}
          <div class="setting-item">
            <label>提供商名称:</label>
            <div class="path-input-group">
              <input type="text" id="provider-name" value="${existingProvider?.name || ''}" placeholder="例如: OpenAI, Claude, 本地模型">
            </div>
          </div>
          <div class="setting-item">
            <label>Base URL:</label>
            <div class="path-input-group">
              <input type="text" id="provider-base-url" value="${existingProvider?.base_url || ''}" placeholder="https://api.openai.com/v1">
            </div>
            <div class="setting-hint">
              <span><span class="hint-icon">${getIcon('info', 12)}</span> API 的基础 URL 地址（不含 /chat/completions）</span>
            </div>
          </div>
          <div class="setting-item" id="clawnode-interface-item" style="display:none;">
            <label>ClawNode 接口类型:</label>
            <div class="path-input-group">
              <select id="clawnode-interface" class="config-select">
                <option value="openai">OpenAI 兼容接口：/v1/chat/completions</option>
                <option value="anthropic">Anthropic 接口：/v1/messages</option>
              </select>
            </div>
            <div class="setting-hint">
              <span><span class="hint-icon">${getIcon('info', 12)}</span> OpenAI 兼容接口适合 GPT 模型；Anthropic 接口适合 Claude 模型</span>
            </div>
          </div>
          <div class="setting-item">
            <label>Model:</label>
            <div class="model-input-row">
              <div class="editable-select" id="provider-model-select">
                <input
                  type="text"
                  id="provider-model"
                  value="${existingProvider?.model || ''}"
                  placeholder="选择或输入模型名"
                  autocomplete="off"
                  spellcheck="false"
                >
                <button type="button" class="editable-select-toggle" id="provider-model-toggle" title="展开模型列表">
                  ${getIcon('down', 14)}
                </button>
                <div class="editable-select-menu" id="provider-model-menu">
                  <button type="button" data-model="gpt-4o">gpt-4o</button>
                  <button type="button" data-model="gpt-4o-mini">gpt-4o-mini</button>
                  <button type="button" data-model="gpt-4-turbo">gpt-4-turbo</button>
                  <button type="button" data-model="claude-sonnet-4-20250514">claude-sonnet-4-20250514</button>
                  <button type="button" data-model="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022</button>
                  <button type="button" data-model="deepseek-chat">deepseek-chat</button>
                  <button type="button" data-model="deepseek-reasoner">deepseek-reasoner</button>
                  <button type="button" data-model="llama3.3">llama3.3</button>
                  <button type="button" data-model="qwen2.5-coder">qwen2.5-coder</button>
                  <button type="button" data-model="claude-opus-4-7">claude-opus-4-7</button>
                  <button type="button" data-model="gpt-5.5">gpt-5.5</button>
                  <button type="button" data-model="claude-opus-4-6-thinking">claude-opus-4-6-thinking</button>
                  <button type="button" data-model="gpt-5.4">gpt-5.4</button>
                  <button type="button" data-model="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</button>
                  <button type="button" data-model="claude-sonnet-4-6">claude-sonnet-4-6</button>
                  <button type="button" data-model="claude-sonnet-4-6-thinking">claude-sonnet-4-6-thinking</button>
                </div>
              </div>
              <button type="button" class="browse-btn model-fetch-btn" id="fetch-models-btn" title="从服务拉取可用模型列表">
                <span class="btn-icon">${getIcon('download', 14)}</span> 拉取
              </button>
            </div>
            <div class="setting-hint" id="model-fetch-hint">
              <span><span class="hint-icon">${getIcon('info', 12)}</span> 选择预设、手动输入，或填好 Base URL / API Key 后点击「拉取」自动获取模型</span>
            </div>
          </div>
          <div class="setting-item">
            <label>API Key:</label>
            <div class="path-input-group">
              <input type="password" id="provider-api-key" value="${existingProvider?.api_key || ''}" placeholder="输入API密钥（Ollama可留空）">
              <button class="browse-btn ai-key-toggle" type="button" id="toggle-api-key" title="显示/隐藏密钥">${getIcon('preview-close', 14)}</button>
            </div>
            <div class="setting-hint">
              <span><span class="hint-icon">${getIcon('info', 12)}</span> 请妥善保管您的 API 密钥，Ollama 本地部署无需填写</span>
            </div>
          </div>
          <div class="setting-item">
            <label>自定义系统提示词（可选）:</label>
            <div class="path-input-group">
              <textarea id="provider-custom-prompt" rows="3" placeholder="留空将使用默认取证分析提示词" style="width:100%;resize:vertical;font-family:inherit;font-size:13px;padding:8px;border-radius:6px;border:1px solid var(--border-color, #444);background:var(--bg-primary, #1a1a1a);color:var(--text-primary, #e0e0e0);">${existingProvider?.custom_prompt || ''}</textarea>
            </div>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="provider-enabled" ${existingProvider?.enabled !== false ? 'checked' : ''}>
              启用此提供商
            </label>
          </div>
        </div>
      </div>
      <div class="settings-footer">
        <button class="cancel-btn" id="cancel-provider-editor">取消</button>
        <button class="browse-btn" id="test-ai-connection" style="margin-right:auto;">${getIcon('connection-point', 14)} 测试连接</button>
        <div id="test-result" class="ai-test-result" style="display:none;"></div>
        <button class="save-btn" id="save-provider">保存</button>
      </div>
    `;

    document.body.appendChild(editorOverlay);
    document.body.appendChild(editorDialog);

    const close = () => {
      editorOverlay.remove();
      editorDialog.remove();
    };

    // 防止点击对话框内部时关闭
    editorDialog.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    editorDialog.querySelector('#close-provider-editor')?.addEventListener('click', close);
    editorDialog.querySelector('#cancel-provider-editor')?.addEventListener('click', close);
    editorOverlay.addEventListener('click', close);

    // 可编辑模型下拉框：避免浏览器 datalist/历史记录干扰
    const modelSelect = editorDialog.querySelector('#provider-model-select') as HTMLElement;
    const modelInput = editorDialog.querySelector('#provider-model') as HTMLInputElement;
    const modelMenu = editorDialog.querySelector('#provider-model-menu') as HTMLElement;
    const modelToggle = editorDialog.querySelector('#provider-model-toggle') as HTMLButtonElement;
    const closeModelMenu = () => modelSelect?.classList.remove('open');
    const openModelMenu = () => modelSelect?.classList.add('open');

    modelToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      modelSelect?.classList.toggle('open');
      modelInput?.focus();
    });

    modelInput?.addEventListener('focus', openModelMenu);
    modelInput?.addEventListener('input', () => {
      const query = modelInput.value.trim().toLowerCase();
      modelMenu?.querySelectorAll('button[data-model]').forEach(item => {
        const model = (item as HTMLElement).dataset.model || '';
        (item as HTMLElement).style.display = model.toLowerCase().includes(query) ? 'flex' : 'none';
      });
      openModelMenu();
    });

    // 绑定下拉菜单项点击事件（拉取模型后可重复调用）
    const bindModelMenuItems = () => {
      modelMenu?.querySelectorAll('button[data-model]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const model = (item as HTMLElement).dataset.model;
          if (model && modelInput) {
            modelInput.value = model;
            modelInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          closeModelMenu();
        });
      });
    };
    bindModelMenuItems();

    // 用拉取到的模型列表重建下拉菜单
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const populateModelMenu = (models: string[]) => {
      if (!modelMenu) return;
      modelMenu.innerHTML = models
        .map(m => `<button type="button" data-model="${escapeHtml(m)}">${escapeHtml(m)}</button>`)
        .join('');
      bindModelMenuItems();
    };

    editorDialog.addEventListener('click', (e) => {
      if (!modelSelect?.contains(e.target as Node)) {
        closeModelMenu();
      }
    });

    // 拉取模型列表
    const fetchBtn = editorDialog.querySelector('#fetch-models-btn') as HTMLButtonElement;
    const fetchHint = editorDialog.querySelector('#model-fetch-hint') as HTMLElement;
    const setFetchHint = (html: string, state: 'info' | 'loading' | 'success' | 'error' = 'info') => {
      if (!fetchHint) return;
      fetchHint.className = `setting-hint model-fetch-hint ${state}`;
      fetchHint.innerHTML = `<span>${html}</span>`;
    };
    fetchBtn?.addEventListener('click', async () => {
      const baseUrl = (editorDialog.querySelector('#provider-base-url') as HTMLInputElement).value.trim();
      const apiKey = (editorDialog.querySelector('#provider-api-key') as HTMLInputElement).value.trim();
      if (!baseUrl) {
        this.showAlert('请先填写 Base URL', 'warning');
        return;
      }

      const originalHtml = fetchBtn.innerHTML;
      fetchBtn.disabled = true;
      fetchBtn.innerHTML = `<span class="btn-icon spinning">${getIcon('loading', 14)}</span> 拉取中`;
      setFetchHint(`<span class="hint-icon">${getIcon('loading', 12)}</span> 正在从服务获取模型列表...`, 'loading');

      try {
        const models = await invoke('fetch_ai_models', { baseUrl, apiKey }) as string[];
        if (models && models.length > 0) {
          populateModelMenu(models);
          openModelMenu();
          setFetchHint(`<span class="hint-icon">${getIcon('check-circle', 12)}</span> 已拉取 ${models.length} 个模型，点击下拉选择`, 'success');
        } else {
          setFetchHint(`<span class="hint-icon">${getIcon('info', 12)}</span> 未获取到模型，请手动输入模型名`, 'error');
        }
      } catch (e) {
        setFetchHint(`<span class="hint-icon">${getIcon('close-circle', 12)}</span> 拉取失败: ${friendlyError(e).message}`, 'error');
      } finally {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = originalHtml;
      }
    });

    // 预设按钮事件
    const clawnodeModels = {
      openai: 'gpt-5.5',
      anthropic: 'claude-opus-4-7',
    };
    const getClawNodeBaseUrl = (interfaceType: string) =>
      interfaceType === 'anthropic'
        ? 'https://cn.clawnode.cn/v1/messages'
        : 'https://cn.clawnode.cn/v1';
    const clawnodeInterfaceItem = editorDialog.querySelector('#clawnode-interface-item') as HTMLElement;
    const clawnodeInterfaceSelect = editorDialog.querySelector('#clawnode-interface') as HTMLSelectElement;
    const setClawNodeInterfaceVisible = (visible: boolean) => {
      if (clawnodeInterfaceItem) {
        clawnodeInterfaceItem.style.display = visible ? 'block' : 'none';
      }
    };

    const presets: Record<string, { name: string; base_url: string; model: string }> = {
      openai: { name: 'OpenAI', base_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
      anthropic: { name: 'Anthropic Claude', base_url: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
      deepseek: { name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      ollama: { name: 'Ollama 本地', base_url: 'http://localhost:11434', model: 'llama3.3' },
      volcengine: { name: '火山引擎', base_url: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1.5-pro-32k' },
      clawnode: { name: 'ClawNode', base_url: getClawNodeBaseUrl('openai'), model: clawnodeModels.openai },
    };

    editorDialog.querySelectorAll('.ai-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = (btn as HTMLElement).dataset.preset;
        if (presetKey && presets[presetKey]) {
          const p = presets[presetKey];
          (editorDialog.querySelector('#provider-name') as HTMLInputElement).value = p.name;
          (editorDialog.querySelector('#provider-base-url') as HTMLInputElement).value = p.base_url;
          (editorDialog.querySelector('#provider-model') as HTMLInputElement).value = p.model;
          if (presetKey === 'clawnode') {
            setClawNodeInterfaceVisible(true);
            if (clawnodeInterfaceSelect) {
              clawnodeInterfaceSelect.value = 'openai';
            }
          } else {
            setClawNodeInterfaceVisible(false);
          }
          // 高亮选中的按钮
          editorDialog.querySelectorAll('.ai-preset-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        }
      });
    });

    if (clawnodeInterfaceSelect) {
      clawnodeInterfaceSelect.addEventListener('change', () => {
        const interfaceType = clawnodeInterfaceSelect.value;
        (editorDialog.querySelector('#provider-base-url') as HTMLInputElement).value = getClawNodeBaseUrl(interfaceType);
        (editorDialog.querySelector('#provider-model') as HTMLInputElement).value =
          interfaceType === 'anthropic' ? clawnodeModels.anthropic : clawnodeModels.openai;
      });
    }

    if ((existingProvider?.base_url || '').toLowerCase().includes('clawnode.cn')) {
      setClawNodeInterfaceVisible(true);
      if (clawnodeInterfaceSelect) {
        clawnodeInterfaceSelect.value = (existingProvider?.base_url || '').endsWith('/v1/messages')
          ? 'anthropic'
          : 'openai';
      }
    }

    // API Key 显示/隐藏切换
    editorDialog.querySelector('#toggle-api-key')?.addEventListener('click', () => {
      const input = editorDialog.querySelector('#provider-api-key') as HTMLInputElement;
      const btn = editorDialog.querySelector('#toggle-api-key') as HTMLButtonElement;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = getIcon('preview-open', 14);
        btn.title = '隐藏密钥';
      } else {
        input.type = 'password';
        btn.innerHTML = getIcon('preview-close', 14);
        btn.title = '显示密钥';
      }
    });

    // 测试连接
    editorDialog.querySelector('#test-ai-connection')?.addEventListener('click', async () => {
      const baseUrl = (editorDialog.querySelector('#provider-base-url') as HTMLInputElement).value.trim();
      const apiKey = (editorDialog.querySelector('#provider-api-key') as HTMLInputElement).value.trim();
      const model = (editorDialog.querySelector('#provider-model') as HTMLInputElement).value.trim();
      const resultDiv = editorDialog.querySelector('#test-result') as HTMLElement;
      const testBtn = editorDialog.querySelector('#test-ai-connection') as HTMLButtonElement;

      if (!baseUrl || !model) {
        this.showAlert('请先填写 Base URL 和 Model', 'warning');
        return;
      }

      testBtn.disabled = true;
      testBtn.innerHTML = `${getIcon('loading', 14)} 测试中...`;
      resultDiv.style.display = 'inline-flex';
      resultDiv.className = 'ai-test-result testing';
      resultDiv.textContent = '正在连接...';

      try {
        const result = await invoke('test_ai_connection', { baseUrl, apiKey, model }) as any;
        if (result.success) {
          resultDiv.className = 'ai-test-result success';
          resultDiv.innerHTML = `<span class="status-icon">${getIcon('check-circle', 12)}</span> ${result.message}`;
        } else {
          resultDiv.className = 'ai-test-result error';
          resultDiv.innerHTML = `<span class="status-icon">${getIcon('close-circle', 12)}</span> ${result.message}`;
        }
      } catch (e) {
        resultDiv.className = 'ai-test-result error';
        resultDiv.innerHTML = `<span class="status-icon">${getIcon('close-circle', 12)}</span> 测试失败: ${friendlyError(e).message}`;
      } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = `${getIcon('connection-point', 14)} 测试连接`;
      }
    });

    editorDialog.querySelector('#save-provider')?.addEventListener('click', async () => {
      const name = (editorDialog.querySelector('#provider-name') as HTMLInputElement).value.trim();
      const baseUrl = (editorDialog.querySelector('#provider-base-url') as HTMLInputElement).value.trim();
      const model = (editorDialog.querySelector('#provider-model') as HTMLInputElement).value.trim();
      const apiKey = (editorDialog.querySelector('#provider-api-key') as HTMLInputElement).value.trim();
      const enabled = (editorDialog.querySelector('#provider-enabled') as HTMLInputElement).checked;
      const customPrompt = (editorDialog.querySelector('#provider-custom-prompt') as HTMLTextAreaElement)?.value?.trim() || '';

      if (!name || !baseUrl || !model || (!apiKey && !baseUrl.includes('localhost') && !baseUrl.toLowerCase().includes('ollama'))) {
        this.showAlert('请填写所有必填字段（Ollama可不填API Key）', 'warning');
        return;
      }

      const providerData = {
        id: existingProvider?.id || `provider_${Date.now()}`,
        name,
        base_url: baseUrl,
        model,
        api_key: apiKey,
        custom_prompt: customPrompt || null,
        enabled,
        created_at: existingProvider?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      try {
        if (existingProvider) {
          await invoke('update_ai_provider', { providerId: existingProvider.id, updatedProvider: providerData });
          this.showAlert('提供商更新成功', 'success');
        } else {
          await invoke('add_ai_provider', { provider: providerData });
          this.showAlert('提供商添加成功', 'success');
        }

        const providers = await invoke('load_ai_providers') as any[];
        const currentProvider = await invoke('get_current_ai_provider') as any;
        this.loadAiProvidersList(dialog, providers, currentProvider?.id);
        close();
      } catch (error) {
        console.error('保存提供商失败:', error);
        this.showAlert('保存提供商失败: ' + error, 'error');
      }
    });
  }

  /**
   * 删除AI提供商
   */
  private async deleteAiProvider(dialog: HTMLElement, providerId: string): Promise<void> {
    const confirmed = await this.showConfirm('确定要删除此AI提供商吗？此操作无法撤销。', {
      title: '删除确认',
      confirmText: '删除',
      cancelText: '取消',
      danger: true
    });
    if (!confirmed) {
      return;
    }

    try {
      await invoke('delete_ai_provider', { providerId });
      this.showAlert('提供商删除成功', 'success');

      const providers = await invoke('load_ai_providers') as any[];
      const currentProvider = await invoke('get_current_ai_provider') as any;
      this.loadAiProvidersList(dialog, providers, currentProvider?.id);
    } catch (error) {
      console.error('删除提供商失败:', error);
      this.showAlert('删除提供商失败，请重试', 'error');
    }
  }

  /**
   * 切换AI提供商启用状态
   */
  private async toggleAiProvider(dialog: HTMLElement, providerId: string): Promise<void> {
    try {
      await invoke('toggle_ai_provider', { providerId });

      const providers = await invoke('load_ai_providers') as any[];
      const currentProvider = await invoke('get_current_ai_provider') as any;
      this.loadAiProvidersList(dialog, providers, currentProvider?.id);
    } catch (error) {
      console.error('切换提供商状态失败:', error);
      this.showAlert('操作失败，请重试', 'error');
    }
  }

  /**
   * 设置当前AI提供商
   */
  private async setCurrentAiProvider(dialog: HTMLElement, providerId: string): Promise<void> {
    try {
      await invoke('set_current_ai_provider', { providerId });
      this.showAlert('已切换当前AI提供商', 'success');

      const providers = await invoke('load_ai_providers') as any[];
      const currentProvider = await invoke('get_current_ai_provider') as any;
      this.loadAiProvidersList(dialog, providers, currentProvider?.id);
    } catch (error) {
      console.error('设置当前提供商失败:', error);
      this.showAlert('操作失败，请重试', 'error');
    }
  }

}

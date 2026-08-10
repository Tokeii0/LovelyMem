import { shouldHideCustomTitleBar } from '../../../utils/platformDetection';
import { IconParkHelper } from '../../utils/iconparkHelper';

function icon(name: string, size: number = 14): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

// 内联铃铛 SVG，不依赖 IconPark 图标名
const bellSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;

export class StatusBarRenderer {
    public render(): string {
        const showMacExtras = shouldHideCustomTitleBar();

        return `
      <div class="status-bar" id="task-status">
        <div class="status-content">
          <div class="status-left">
            <button class="status-action-btn notification-btn" id="notification-center-btn" title="通知中心">
              <span class="icon-wrapper">${bellSvg}</span>
              <span class="notification-badge" id="notification-badge" style="display:none;">0</span>
            </button>
            <span class="status-separator"></span>
            <span class="status-icon status-dot-ready">${icon('check-circle', 12)}</span>
            <span class="status-text">就绪</span>
            <span class="status-separator"></span>
            <span class="status-image-info" id="status-image-info"></span>
          </div>
          <div class="status-right">
            ${showMacExtras ? `
              <button class="status-action-btn ai-chat" data-action="ai-chat" title="AI 助手">
                <span class="icon-wrapper">${icon('robot', 14)}</span>
                <span class="btn-text">AI助手</span>
              </button>
              <button class="status-action-btn toggle-theme" data-action="toggle-theme" title="切换主题">
                <span class="icon-wrapper">${icon('dark-mode', 14)}</span>
                <span class="btn-text">主题</span>
              </button>
            ` : ''}
          </div>
          <span class="app-version" id="app-version-btn" title="点击检查更新">
            <span id="version-text" class="app-version-text">...</span>
            <span id="version-update-indicator" class="version-update-indicator" style="display: none;">(发现新版本)</span>
          </span>
        </div>
      </div>
    `;
    }
}

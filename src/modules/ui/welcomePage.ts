import { recentSessions } from '../core/recentSessions';
import { IconParkHelper } from '../utils/iconparkHelper';

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString();
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

/* ---------- 内联图标（避免依赖外部图标名，跨主题用 currentColor） ---------- */

// 特性图标
const ICON_DEEP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>`;
const ICON_LOCATE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const ICON_PLUGIN = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.4a2.3 2.3 0 0 1 0 4.6H2V19a2 2 0 0 0 2 2h3.8v-1.4a2.3 2.3 0 0 1 4.6 0V21H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"></path></svg>`;
const ICON_SHIELD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;

// Windows 图标（四方块）
const ICON_WINDOWS = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1"></rect><rect x="13" y="3" width="8" height="8" rx="1"></rect><rect x="3" y="13" width="8" height="8" rx="1"></rect><rect x="13" y="13" width="8" height="8" rx="1"></rect></svg>`;

// Linux 企鹅图标
const ICON_LINUX = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1f2430" d="M12 2.4c-2.7 0-4.4 2.1-4.4 4.9 0 .8.15 1.5.15 2.1-.7 1-2 2.5-2.5 4.4-.5 1.9-1.25 2.8-1.7 3.6-.5.95.2 1.85 1.2 1.6.65-.15 1.15-.45 1.55-.7.45 1.55 2.25 2.6 3.95 2.6h1.5c1.7 0 3.5-1.05 3.95-2.6.4.25.9.55 1.55.7 1 .25 1.7-.65 1.2-1.6-.45-.8-1.2-1.7-1.7-3.6-.5-1.9-1.8-3.4-2.5-4.4 0-.6.15-1.3.15-2.1 0-2.8-1.7-4.9-4.4-4.9z"></path><ellipse cx="12" cy="14.2" rx="2.7" ry="3.9" fill="#ffffff"></ellipse><ellipse cx="10.3" cy="6.7" rx="1.15" ry="1.45" fill="#ffffff"></ellipse><ellipse cx="13.7" cy="6.7" rx="1.15" ry="1.45" fill="#ffffff"></ellipse><circle cx="10.55" cy="7" r=".55" fill="#1f2430"></circle><circle cx="13.45" cy="7" r=".55" fill="#1f2430"></circle><path fill="#f6b94a" d="M10.85 7.9h2.3l-1.15 1.4z"></path><path fill="#f6b94a" d="M9.6 19.7c-.55.55-1.25 1.05-1.55 1.75-.15.35.05.7.45.7h2.2c.35 0 .6-.3.5-.65l-.45-1.8z"></path><path fill="#f6b94a" d="M14.4 19.7c.55.55 1.25 1.05 1.55 1.75.15.35-.05.7-.45.7h-2.2c-.35 0-.6-.3-.5-.65l.45-1.8z"></path></svg>`;

// 上传图标
const ICON_UPLOAD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

export class WelcomePageRenderer {
  static render(): string {
    const sessions = recentSessions.getAll();
    const hasRecent = sessions.length > 0;
    const fileIcon = IconParkHelper.getSvgString('file-text', { size: 14, strokeWidth: 3 });
    const timeIcon = IconParkHelper.getSvgString('time', { size: 12, strokeWidth: 3 });
    const closeIcon = IconParkHelper.getSvgString('close', { size: 12, strokeWidth: 3 });

    const renderRecentItem = (s: { path: string; name: string; size: number; lastOpened: number }) => `
      <div class="welcome-recent-item" data-recent-path="${s.path}" title="${s.path}">
        <span class="recent-item-icon">${fileIcon}</span>
        <div class="recent-item-info">
          <span class="recent-item-name">${s.name}</span>
          <span class="recent-item-meta">
            ${timeIcon} ${formatTimeAgo(s.lastOpened)}${s.size > 0 ? ` / ${formatSize(s.size)}` : ''}
          </span>
        </div>
        <button class="recent-item-remove" data-remove-path="${s.path}" title="移除">${closeIcon}</button>
      </div>`;

    const visible = sessions.slice(0, 5);
    const extra = sessions.slice(5);

    const recentBody = hasRecent ? `
      ${extra.length > 0 ? `<input type="checkbox" id="welcome-recent-expand" class="welcome-recent-expand-cb" hidden>` : ''}
      <div class="welcome-recent-list">
        ${visible.map(renderRecentItem).join('')}
        ${extra.length > 0 ? `<div class="welcome-recent-extra">${extra.map(renderRecentItem).join('')}</div>` : ''}
      </div>
      ${extra.length > 0 ? `<label for="welcome-recent-expand" class="welcome-recent-more">查看全部记录 <span class="more-arrow">›</span></label>` : ''}
    ` : `
      <div class="welcome-recent-empty">
        <span class="recent-empty-icon">${fileIcon}</span>
        <p>暂无最近打开的镜像</p>
      </div>
    `;

    return `
      <div class="main-workspace welcome-page-container" id="welcome-drop-zone">
        <div class="welcome-background">
          <div class="bg-circle circle-1"></div>
          <div class="bg-circle circle-2"></div>
        </div>

        <div class="welcome-layout">
          <!-- 左列：品牌 + 加载操作 -->
          <div class="welcome-main-col">
            <!-- Hero 卡片 -->
            <div class="welcome-hero-card">
              <div class="welcome-hero-text">
                <h1 class="welcome-hero-brand">Lovelymem <span class="brand-version-text">V2</span></h1>
                <p class="welcome-hero-platform">内存取证分析工具</p>
                <p class="welcome-hero-tagline">高效 · 精准 · 便捷</p>
                <div class="welcome-feature-row">
                  <div class="welcome-feature-item">
                    <span class="welcome-feature-icon">${ICON_DEEP}</span>
                    <span class="welcome-feature-label">深度分析</span>
                  </div>
                  <div class="welcome-feature-item">
                    <span class="welcome-feature-icon">${ICON_LOCATE}</span>
                    <span class="welcome-feature-label">快速查看</span>
                  </div>
                  <div class="welcome-feature-item">
                    <span class="welcome-feature-icon">${ICON_PLUGIN}</span>
                    <span class="welcome-feature-label">新手便捷</span>
                  </div>
                  <div class="welcome-feature-item">
                    <span class="welcome-feature-icon">${ICON_SHIELD}</span>
                    <span class="welcome-feature-label">开发者可靠</span>
                  </div>
                </div>
              </div>
              <div class="welcome-hero-art">
                <img src="assets/logo_100.png" alt="Lovelymem V2" class="welcome-hero-illustration">
              </div>
            </div>

            <!-- 操作区：双系统加载按钮 + 拖拽 -->
            <div class="welcome-action-row">
              <div class="welcome-load-card">
                <div class="welcome-load-buttons">
                  <button class="welcome-load-btn welcome-load-btn--windows" id="main-load-image-btn" data-action="load-image-windows">
                    <span class="btn-icon">${ICON_WINDOWS}</span>
                    <span class="btn-text">载入 Windows 内存镜像</span>
                  </button>
                  <button class="welcome-load-btn welcome-load-btn--linux" data-action="load-image-linux">
                    <span class="btn-icon">${ICON_LINUX}</span>
                    <span class="btn-text">载入 Linux 内存镜像</span>
                  </button>
                </div>
                <p class="welcome-load-formats">支持 RAW / LIME / MEM 等常见格式</p>
              </div>

              <div class="welcome-drop-card welcome-drop-hint" id="welcome-drop-hint" data-action="load-image" title="点击浏览文件 / 拖拽内存镜像到此处（自动识别系统）">
                <div class="drop-card-icon">${ICON_UPLOAD}</div>
                <p class="drop-card-title">拖拽内存镜像文件到此处</p>
                <p class="drop-card-sub">或 点击浏览文件</p>
              </div>
            </div>
          </div>

          <!-- 右列：最近打开 -->
          <div class="welcome-side-col">
            <div class="welcome-recent-card">
              <div class="welcome-recent-header">
                <span class="welcome-recent-title">${IconParkHelper.getSvgString('time', { size: 16, strokeWidth: 3 })} 最近打开</span>
                ${hasRecent ? `<button class="welcome-recent-clear" id="clear-recent-sessions">清空记录</button>` : ''}
              </div>
              ${recentBody}
            </div>
          </div>
        </div>

        <div class="welcome-corner-action">
          <button class="welcome-enter-btn" id="enter-without-image-btn" data-action="enter-without-image">
            <span class="btn-text">不加载内存直接进入</span>
            <span class="btn-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
          </button>
        </div>

        <div class="welcome-drop-overlay" id="welcome-drop-overlay">
          <div class="drop-overlay-content">
            <div class="drop-overlay-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </div>
            <p class="drop-overlay-text">释放以加载内存镜像</p>
            <p class="drop-overlay-formats">支持格式: .raw .dmp .vmem .img .dd .bin .mem .001</p>
          </div>
        </div>
      </div>
    `;
  }
}

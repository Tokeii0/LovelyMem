import { AppState } from '../../core/types';
import { shouldHideCustomTitleBar } from '../../../utils/platformDetection';

export class TitleBarRenderer {
    constructor(private state: AppState) { }

    public updateState(state: AppState) {
        this.state = state;
    }

    private getLogoContent(): string {
        return `<svg class="app-logo-svg" width="28" height="28" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path class="star-path" d="M100 25 L118 68 L165 72 L129 103 L140 148 L100 124 L60 148 L71 103 L35 72 L82 68 Z" fill="var(--logo-star-color, #FBBF24)" stroke="var(--logo-star-color, #FBBF24)" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>
                <path class="wave-1" d="M40 145 C 60 135, 80 155, 100 155 C 120 155, 140 135, 160 145" stroke="var(--logo-wave1-color, #3B82F6)" stroke-width="14" stroke-linecap="round" fill="none"/>
                <path class="wave-2" d="M40 170 C 60 160, 80 180, 100 180 C 120 180, 140 160, 160 170" stroke="var(--logo-wave2-color, #2563EB)" stroke-width="14" stroke-linecap="round" fill="none"/>
                <circle class="bubble-1" cx="170" cy="50" r="6" fill="var(--logo-bubble1-color, #60A5FA)"/>
                <circle class="bubble-2" cx="30" cy="100" r="4" fill="var(--logo-bubble2-color, #93C5FD)"/>
                <circle class="bubble-3" cx="160" cy="110" r="3" fill="var(--logo-bubble3-color, #BFDBFE)"/>
              </svg>`;
    }

    public render(): string {
        // 检查是否应该隐藏自定义标题栏（在 macOS 上使用原生标题栏）
        if (shouldHideCustomTitleBar()) {
            return ''; // 在 macOS 上不渲染自定义标题栏
        }

        const currentTheme = this.state.theme || 'light';
        
        return `
      <div class="modern-title-bar" data-tauri-drag-region>
        <div class="title-bar-content">
          <div class="app-logo">
            <div class="logo-icon">
              ${this.getLogoContent()}
            </div>
            <div class="app-info">
              <div class="app-name">Lovelymem <span class="brand-version-text">V2</span></div>
            </div>
          </div>

          <!-- 循环播放的文本区域 -->
          <div class="title-bar-text-carousel" id="title-bar-carousel">
            <div class="carousel-text"></div>
          </div>


        </div>
        <div class="window-controls">
          <div class="control-button minimize" id="minimize-btn">
            <svg viewBox="0 0 24 24"><path d="M6 12h12v2H6z"/></svg>
          </div>
          <div class="control-button maximize" id="maximize-btn">
            <svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
          </div>
          <div class="control-button close" id="close-btn">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M6 18L18 6"/></svg>
          </div>
        </div>
      </div>
    `;
    }
}

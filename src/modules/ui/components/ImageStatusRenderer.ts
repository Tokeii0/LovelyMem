import { AppState } from '../../core/types';
import { IconParkHelper } from '../../utils/iconparkHelper';
import { translate } from '../../../i18n';

function icon(name: string, size: number = 14): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

export class ImageStatusRenderer {
  private imageLoadingStatus: 'idle' | 'loading' | 'completed' | 'error' = 'idle';
  private loadingEngine: 'memprocfs' | 'memnixfs' = 'memprocfs';

  constructor(private state: AppState, private updateMainWorkspace: () => Promise<void>) { }

  /** 设置当前加载引擎，决定加载页文案（MemProcFS / MemNixFS） */
  public setLoadingEngine(engine: 'memprocfs' | 'memnixfs'): void {
    this.loadingEngine = engine;
  }

  public updateState(state: AppState) {
    this.state = state;
  }

  public render(currentImage: any): string {
    if (!currentImage) {
      return `
        <div class="image-status-empty">
          <button class="image-load-btn" id="load-image-btn" data-action="load-image" title="点击加载内存镜像文件">
            <div class="folder">
              <div class="front-side">
                <div class="tip"></div>
                <div class="cover"></div>
              </div>
              <div class="back-side cover"></div>
            </div>
            <div class="load-text">加载内存镜像</div>
          </button>
        </div>
      `;
    } else {
      const isCompleted = this.imageLoadingStatus === 'completed';

      if (this.imageLoadingStatus === 'loading') {
        return this.renderLoadingHtml();
      }

      const fileExtension = currentImage.name.split('.').pop()?.toUpperCase() || 'FILE';
      const createdTime = new Date().toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const statusText = isCompleted ? '已加载' : '加载中';

      return `
        <div class="image-status-loaded">
          <div class="image-card" id="current-image-info">
            <div class="image-card-accent"></div>
            <div class="image-main-info">
              <div class="image-header">
                <div class="image-type-badge">
                  <span class="badge-icon">${icon('hard-disk', 12)}</span>
                  <span>${fileExtension}</span>
                </div>
                <div class="image-status-indicator">
                  <span id="image-status-icon" class="status-dot"></span>
                  <span id="image-status-text" class="status-text">${statusText}</span>
                </div>
              </div>

              <div class="image-content">
                <div class="image-title" id="image-title-text" title="${currentImage.name}">${currentImage.name}</div>
                <div class="image-meta">
                  <div class="meta-item">
                    <span class="meta-icon">${icon('data', 12)}</span>
                    <span class="meta-text">${this.formatFileSize(currentImage.size)}</span>
                  </div>
                  <div class="meta-item">
                    <span class="meta-icon">${icon('time', 12)}</span>
                    <span class="meta-text">${createdTime}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="image-actions-overlay">
              <button class="image-action-btn switch" id="switch-image-btn" data-action="load-image" title="切换镜像">
                <span>${icon('refresh', 14)}</span>
              </button>
              <button class="image-action-btn unload" id="unload-image-btn" data-action="unload-image" title="卸载镜像">
                <span>${icon('delete', 14)}</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private startLoadingTextAnimation(): void {
    const loadingTexts = [
      '正在穿越虚拟地址空间...',
      '正在深入内核结构层...',
      '解析内存页表映射中...',
      '扫描进程控制块...',
      '遍历句柄对象表...',
      '重建文件系统缓存...',
      '探索注册表蜂巢...',
      '提取网络连接信息...',
      '分析驱动模块链...',
      '进入物理内存深层...'
    ];

    let currentIndex = 0;
    const textElement = document.getElementById('dynamic-loading-text');
    if (!textElement) return;
    textElement.textContent = loadingTexts[currentIndex];

    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % loadingTexts.length;
      if (textElement) {
        textElement.style.opacity = '0';
        textElement.style.transform = 'translateY(4px)';
        setTimeout(() => {
          textElement.textContent = loadingTexts[currentIndex];
          textElement.style.opacity = '1';
          textElement.style.transform = 'translateY(0)';
        }, 250);
      }
      if (!document.querySelector('.memory-core-loader')) {
        clearInterval(interval);
      }
    }, 2500);

    // 动态指标数值动画
    const metricElements = document.querySelectorAll('.mcl-metric-anim');
    metricElements.forEach((el) => {
      const values = (el as HTMLElement).dataset.values?.split(',') || [];
      let idx = 0;
      const metricInterval = setInterval(() => {
        if (!document.querySelector('.memory-core-loader')) {
          clearInterval(metricInterval);
          return;
        }
        idx = (idx + 1) % values.length;
        (el as HTMLElement).textContent = values[idx];
      }, 1800 + Math.random() * 1200);
      ((window as any).__mclMetricIntervals = (window as any).__mclMetricIntervals || []).push(metricInterval);
    });

    (window as any).loadingTextInterval = interval;

    // ── Canvas 3D 虫洞粒子系统 ──
    this.startWormholeCanvas();
  }

  private startWormholeCanvas(): void {
    const canvas = document.getElementById('wormhole-canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // ── 检测当前主题 ──
    const theme = document.documentElement.getAttribute('data-theme') || 'light';

    // ── 主题配色方案 ──
    interface ThemeProfile {
      bgR: number; bgG: number; bgB: number;   // 背景 RGB
      trailAlpha: number;                        // 运动模糊拖尾透明度
      p1R: number; p1G: number; p1B: number;    // 主粒子色
      p2R: number; p2G: number; p2B: number;    // 副粒子色（部分粒子用）
      coreR: number; coreG: number; coreB: number; // 核心发光色
      particleCount: number;
      speed: number;
      glowIntensity: number;                     // 发光强度系数
      trailMultiplier: number;                   // 尾迹亮度
      coreWhite: boolean;                        // 核心是否有白色亮点
    }

    const profiles: Record<string, ThemeProfile> = {
      dark: {
        bgR: 15, bgG: 23, bgB: 42,              // #0f172a
        trailAlpha: 0.12,
        p1R: 99, p1G: 102, p1B: 241,            // 靛蓝 #6366f1
        p2R: 124, p2G: 58, p2B: 237,            // 紫色 #7c3aed
        coreR: 79, coreG: 70, coreB: 229,       // #4f46e5
        particleCount: 350,
        speed: 16,
        glowIntensity: 1.5,
        trailMultiplier: 0.8,
        coreWhite: true
      },
      light: {
        bgR: 250, bgG: 251, bgB: 252,           // #fafbfc
        trailAlpha: 0.25,                         // 浅背景需要更快清除
        p1R: 66, p1G: 153, p1B: 225,            // 蓝色 #4299e1
        p2R: 99, p2G: 179, p2B: 237,            // 浅蓝 #63b3ed
        coreR: 66, coreG: 153, coreB: 225,
        particleCount: 250,
        speed: 12,
        glowIntensity: 0.8,                      // 浅色背景发光要柔和
        trailMultiplier: 0.5,
        coreWhite: false
      },
      sakura: {
        bgR: 254, bgG: 249, bgB: 249,           // #fef9f9
        trailAlpha: 0.2,
        p1R: 255, p1G: 100, p1B: 130,           // 深粉红
        p2R: 255, p2G: 50, p2B: 100,            // 玫红
        coreR: 233, coreG: 30, coreB: 99,       // 深粉 #e91e63
        particleCount: 150,                       // 爱心需要更少粒子避免杂乱
        speed: 8,                                 // 稍慢让爱心形状看得清
        glowIntensity: 1.0,
        trailMultiplier: 0.5,
        coreWhite: false
      }
    };

    const tp = profiles[theme] || profiles.light;

    const TUNNEL_RING_COUNT = 6;

    interface WormholeParticle {
      x: number; y: number; z: number; prevZ: number;
      useAlt: boolean; // 是否使用副色
    }

    const particles: WormholeParticle[] = [];

    const resetParticle = (p: WormholeParticle, initial = false) => {
      p.x = (Math.random() - 0.5) * canvas.width * 1.5;
      p.y = (Math.random() - 0.5) * canvas.height * 1.5;
      p.z = initial ? Math.random() * canvas.width : canvas.width;
      p.prevZ = p.z;
      p.useAlt = Math.random() > 0.65; // 35% 使用副色
    };

    for (let i = 0; i < tp.particleCount; i++) {
      const p = { x: 0, y: 0, z: 0, prevZ: 0, useAlt: false };
      resetParticle(p, true);
      particles.push(p);
    }

    const tunnelRings: number[] = [];
    for (let i = 0; i < TUNNEL_RING_COUNT; i++) {
      tunnelRings.push((i / TUNNEL_RING_COUNT) * canvas.width);
    }

    let animId = 0;
    let time = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      if (!document.querySelector('.memory-core-loader')) {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', resize);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // 运动模糊拖尾（主题相关透明度）
      ctx.fillStyle = `rgba(${tp.bgR},${tp.bgG},${tp.bgB},${tp.trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      time += 0.016;

      // ── 隧道环 ──
      for (let i = 0; i < tunnelRings.length; i++) {
        tunnelRings[i] -= tp.speed * 0.8;
        if (tunnelRings[i] <= 0) tunnelRings[i] = w;

        const z = tunnelRings[i];
        const scale = w / (z + 1);
        const radius = 150 * scale;
        const alpha = Math.max(0, (theme === 'dark' ? 0.5 : 0.35) - (radius / w) * 0.3);

        if (radius > 2 && radius < w * 2) {
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${tp.p1R},${tp.p1G},${tp.p1B},${alpha})`;
          ctx.lineWidth = Math.max(0.5, 2 - radius / w);
          ctx.stroke();
        }
      }

      // ── 3D 透视粒子 ──
      for (const p of particles) {
        p.prevZ = p.z;
        p.z -= tp.speed;

        if (p.z <= 0) {
          resetParticle(p);
        }

        const scale = w / (2 * p.z);
        const sx = p.x * scale + cx;
        const sy = p.y * scale + cy;

        const prevScale = w / (2 * p.prevZ);
        const prevSx = p.x * prevScale + cx;
        const prevSy = p.y * prevScale + cy;

        const depthRatio = 1 - p.z / w;
        const size = Math.max(0.5, depthRatio * 3.5);
        const alpha = Math.min(1, depthRatio * 1.2);

        // 选择主色或副色
        const cr = p.useAlt ? tp.p2R : tp.p1R;
        const cg = p.useAlt ? tp.p2G : tp.p1G;
        const cb = p.useAlt ? tp.p2B : tp.p1B;

        // 粒子渲染（樱花主题画爱心，其他画圆+尾迹）
        if (theme === 'sakura') {
          // 爱心粒子 — 尺寸放大，最小4px
          const heartSize = Math.max(4, depthRatio * 12);
          ctx.save();
          ctx.translate(sx, sy);
          const angle = Math.atan2(sy - cy, sx - cx);
          ctx.rotate(angle + Math.PI / 2);
          const s = heartSize;
          ctx.beginPath();
          ctx.moveTo(0, -s * 0.35);
          ctx.bezierCurveTo(s * 0.55, -s * 1.1, s * 1.1, -s * 0.35, 0, s * 0.55);
          ctx.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.55, -s * 1.1, 0, -s * 0.35);
          ctx.closePath();
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha * 0.9})`;
          ctx.fill();
          ctx.restore();
        } else {
          // 拉丝尾迹
          ctx.beginPath();
          ctx.moveTo(prevSx, prevSy);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha * tp.trailMultiplier})`;
          ctx.lineWidth = size * 0.6;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
          ctx.fill();
        }

        // 近处粒子发光
        if (depthRatio > 0.7) {
          ctx.beginPath();
          ctx.arc(sx, sy, size * 3, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 3);
          const glowAlpha = (depthRatio - 0.7) * tp.glowIntensity;
          glow.addColorStop(0, `rgba(${cr},${cg},${cb},${glowAlpha})`);
          glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
          ctx.fillStyle = glow;
          ctx.fill();
        }
      }

      // ── 中心虫洞发光 ──
      const coreSize = 30 + Math.sin(time * 2) * 8;
      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 3);
      coreGlow.addColorStop(0, `rgba(${tp.coreR},${tp.coreG},${tp.coreB},${0.6 * tp.glowIntensity})`);
      coreGlow.addColorStop(0.3, `rgba(${tp.coreR},${tp.coreG},${tp.coreB},${0.15 * tp.glowIntensity})`);
      coreGlow.addColorStop(1, `rgba(${tp.coreR},${tp.coreG},${tp.coreB},0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 3, 0, Math.PI * 2);
      ctx.fillStyle = coreGlow;
      ctx.fill();

      // 中心亮点（深色用白色，浅色/粉色用主色）
      const dotR = tp.coreWhite ? 255 : tp.coreR;
      const dotG = tp.coreWhite ? 255 : tp.coreG;
      const dotB = tp.coreWhite ? 255 : tp.coreB;
      const coreDot = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 0.5);
      coreDot.addColorStop(0, `rgba(${dotR},${dotG},${dotB},${tp.coreWhite ? 0.9 : 0.6})`);
      coreDot.addColorStop(0.5, `rgba(${tp.coreR},${tp.coreG},${tp.coreB},${0.5 * tp.glowIntensity})`);
      coreDot.addColorStop(1, `rgba(${tp.coreR},${tp.coreG},${tp.coreB},0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, coreSize * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = coreDot;
      ctx.fill();

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    (window as any).__wormholeAnimId = animId;
    (window as any).__wormholeResize = resize;
  }

  private stopLoadingTextAnimation(): void {
    if ((window as any).loadingTextInterval) {
      clearInterval((window as any).loadingTextInterval);
      (window as any).loadingTextInterval = null;
    }
    if ((window as any).__mclMetricIntervals) {
      (window as any).__mclMetricIntervals.forEach((id: number) => clearInterval(id));
      (window as any).__mclMetricIntervals = null;
    }
    if ((window as any).__wormholeAnimId) {
      cancelAnimationFrame((window as any).__wormholeAnimId);
      (window as any).__wormholeAnimId = null;
    }
    if ((window as any).__wormholeResize) {
      window.removeEventListener('resize', (window as any).__wormholeResize);
      (window as any).__wormholeResize = null;
    }
  }

  public renderLoadingHtml(message?: string): string {
    return `
      <div class="memory-core-loader">
        <canvas id="wormhole-canvas" class="wormhole-canvas"></canvas>

        <!-- 状态信息卡片（覆盖在 Canvas 之上） -->
        <div class="mcl-status-card">
          <div class="mcl-status-label">MEMORY WARP</div>
          <div class="mcl-status-text" id="dynamic-loading-text">${message || '正在穿越虚拟地址空间...'}</div>

          <div class="mcl-progress-track">
            <div class="mcl-progress-bar"></div>
            <div class="mcl-progress-glow"></div>
          </div>

          <div class="mcl-metrics">
            <div class="mcl-metric">
              <span class="mcl-metric-val mcl-metric-anim" data-values="4K,8K,16K,32K,64K">0K</span>
              <span class="mcl-metric-label">Pages</span>
            </div>
            <div class="mcl-metric-divider"></div>
            <div class="mcl-metric">
              <span class="mcl-metric-val mcl-metric-anim" data-values="12%,34%,58%,76%,91%">0%</span>
              <span class="mcl-metric-label">Mapped</span>
            </div>
            <div class="mcl-metric-divider"></div>
            <div class="mcl-metric">
              <span class="mcl-metric-val mcl-metric-anim" data-values="128,256,384,512,768">0</span>
              <span class="mcl-metric-label">Handles</span>
            </div>
            <div class="mcl-metric-divider"></div>
            <div class="mcl-metric">
              <span class="mcl-metric-val mcl-metric-anim" data-values="24,48,72,96,128">0</span>
              <span class="mcl-metric-label">Modules</span>
            </div>
          </div>
        </div>

        <!-- 底部提示与切换 -->
        <div class="loader-footer">
            <div class="footer-message">
                ${icon('info', 14)}
                <span>${this.loadingEngine === 'memnixfs'
                    ? '正在使用 MemNixFS 挂载 Linux 内存镜像，完成后将进入 MemNixFS V2 取证面板'
                    : '正在使用 MemProcFS 加载内存，您可以使用 Volatility 3 执行其他任务'}</span>
            </div>
            ${this.loadingEngine === 'memnixfs' ? '' : `
            <button class="switch-area-btn" data-target="volatility3-v2">
                ${icon('lightning', 14)}
                <span class="btn-text">切换到 Volatility 3</span>
            </button>
            `}
        </div>
      </div>
    `;
  }

  public updateImageStatusArea(): void {
    this.stopLoadingTextAnimation();

    const imageStatusArea = document.getElementById('image-status-area');
    if (imageStatusArea) {
      const currentImage = this.state.currentImage;
      const renderedContent = this.render(currentImage);

      if (renderedContent) {
        imageStatusArea.innerHTML = renderedContent;

        if (this.imageLoadingStatus === 'loading') {
          this.startLoadingTextAnimation();
        }

        setTimeout(() => {
          this.bindImageInfoClickEvent();
        }, 50);
      }
    }
  }

  public updateImageLoadingStatus(status: 'loading' | 'completed' | 'error', message?: string) {
    this.imageLoadingStatus = status;
    const mainWorkspace = document.querySelector('.main-workspace');

    if (status === 'loading') {
      if (mainWorkspace) {
        mainWorkspace.innerHTML = `
          <div class="workspace-loading-container" style="display: flex; justify-content: center; align-items: center; height: 100%; width: 100%;">
            ${this.renderLoadingHtml(message)}
          </div>
        `;
      }
      this.startLoadingTextAnimation();
      return;
    }

    if (status === 'completed') {
      this.playSuccessSound();
      this.updateMainWorkspace();
      this.notifyStatusChange(status, message);
      return;
    }

    if (status === 'error') {
      if (mainWorkspace) {
        mainWorkspace.innerHTML = `
                <div class="mcl-error-container">
                    <div class="mcl-error-icon-wrap">
                      <svg class="mcl-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                    </div>
                    <div class="mcl-error-title">加载失败</div>
                    <div class="mcl-error-message">${message || '镜像加载失败'}</div>
                    <button class="mcl-error-retry" onclick="window.location.reload()">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      重试
                    </button>
                </div>
             `;
      }
      this.notifyStatusChange(status, message);
      return;
    }
  }

  private playSuccessSound(): void {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
    }
  }

  private notifyStatusChange(status: string, message?: string): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notifications = {
        loading: { title: '开始加载镜像', icon: '⚡' },
        completed: { title: '镜像加载成功', icon: '✅' },
        error: { title: '镜像加载失败', icon: '❌' }
      };

      const config = notifications[status as keyof typeof notifications];
      if (config) {
        new Notification(`${config.icon} ${translate(config.title)}`, {
          body: translate(message || ''),
          icon: '/assets/logo_100.png',
          tag: 'image-status',
          requireInteraction: false
        });
      }
    }
  }

  public demonstrateImageAnimations(): void {
    console.log('🎬 开始动画演示...');
    this.updateImageLoadingStatus('loading', '演示加载动画效果');
    setTimeout(() => {
      this.updateImageLoadingStatus('completed', '演示成功动画效果');
    }, 3000);
    setTimeout(() => {
      this.updateImageLoadingStatus('error', '演示错误动画效果');
    }, 7000);
    console.log('🎬 动画演示结束（状态保持在最后一个状态）');
  }

  public bindImageInfoClickEvent(): void {
    const imageInfo = document.getElementById('current-image-info');
    if (imageInfo) {
      imageInfo.addEventListener('click', () => {
        if (!this.state.currentImage && !imageInfo.classList.contains('loading')) {
          const loadBtn = document.getElementById('load-image-btn');
          if (loadBtn) {
            loadBtn.click();
          }
        }
      });
    }
  }
}

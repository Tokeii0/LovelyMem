import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { translate } from '../../i18n';

export type WallpaperFit = 'cover' | 'contain' | 'fill' | 'scale-down' | 'none';
export type WallpaperLayerMode = 'overlay';

export interface WallpaperSettings {
  enabled: boolean;
  file_path: string;
  mode: WallpaperLayerMode | string;
  blend_mode: string;
  tint_color: string;
  tint_opacity: number;
  vignette: number;
  zoom: number;
  pos_x: number;
  pos_y: number;
  clarity: number;
  opacity: number;
  blur: number;
  dim: number;
  brightness: number;
  contrast: number;
  hue_rotate: number;
  grayscale: number;
  sepia: number;
  fit: WallpaperFit | string;
  saturate: number;
}

const DEFAULT_SETTINGS: WallpaperSettings = {
  enabled: false,
  file_path: '',
  mode: 'overlay',
  blend_mode: 'normal',
  tint_color: '#000000',
  tint_opacity: 0,
  vignette: 0,
  zoom: 1,
  pos_x: 50,
  pos_y: 50,
  clarity: 0,
  opacity: 0.35,
  blur: 0,
  dim: 0.25,
  brightness: 1,
  contrast: 1,
  hue_rotate: 0,
  grayscale: 0,
  sepia: 0,
  fit: 'cover',
  saturate: 1,
};

export class WallpaperManager {
  private root: HTMLDivElement | null = null;
  private mediaWrapper: HTMLDivElement | null = null;
  private img: HTMLImageElement | null = null;
  private video: HTMLVideoElement | null = null;
  private tintLayer: HTMLDivElement | null = null;
  private vignetteLayer: HTMLDivElement | null = null;
  private dimLayer: HTMLDivElement | null = null;
  private settings: WallpaperSettings = { ...DEFAULT_SETTINGS };
  private videoAutoplayRetryBound = false;

  public async init(): Promise<void> {
    try {
      const settings = await invoke('get_wallpaper_settings') as any;
      this.settings = { ...DEFAULT_SETTINGS, ...settings };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }

    this.settings.opacity = this.clamp(Number(this.settings.opacity ?? DEFAULT_SETTINGS.opacity), 0, 0.7);

    this.ensureDom();
    await this.apply();
  }

  public getSettings(): WallpaperSettings {
    return { ...this.settings };
  }

  public async importFromFilePicker(): Promise<void> {
    const filePath = await invoke('select_file_path', {
      title: translate('选择壁纸文件'),
      filters: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'mp4', 'webm'],
    }) as string | null;

    if (!filePath) return;

    const newPath = await invoke('import_wallpaper', { sourcePath: filePath }) as string;
    this.settings.file_path = newPath;
    this.settings.enabled = true;
    await this.persist();
    await this.apply();
  }

  public async clear(): Promise<void> {
    await invoke('clear_wallpaper');
    this.settings = { ...this.settings, enabled: false, file_path: '' };
    await this.apply();
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this.settings.enabled = enabled;
    await this.persist();
    await this.apply();
  }

  public async setOpacity(opacity: number): Promise<void> {
    this.settings.opacity = this.clamp(opacity, 0, 0.7);
    await this.persist();
    await this.apply();
  }

  public async setBlur(blur: number): Promise<void> {
    this.settings.blur = this.clamp(blur, 0, 30);
    await this.persist();
    await this.apply();
  }

  public async setDim(dim: number): Promise<void> {
    this.settings.dim = this.clamp(dim, -1, 1);
    await this.persist();
    await this.apply();
  }

  public async setSaturate(saturate: number): Promise<void> {
    this.settings.saturate = this.clamp(saturate, 0, 2);
    await this.persist();
    await this.apply();
  }

  public async setFit(fit: WallpaperFit | string): Promise<void> {
    this.settings.fit = fit;
    await this.persist();
    await this.apply();
  }

  public async setBlendMode(blend_mode: string): Promise<void> {
    this.settings.blend_mode = blend_mode;
    await this.persist();
    await this.apply();
  }

  public async setTintColor(tint_color: string): Promise<void> {
    this.settings.tint_color = tint_color;
    await this.persist();
    await this.apply();
  }

  public async setTintOpacity(tint_opacity: number): Promise<void> {
    this.settings.tint_opacity = this.clamp(tint_opacity, 0, 1);
    await this.persist();
    await this.apply();
  }

  public async setVignette(vignette: number): Promise<void> {
    this.settings.vignette = this.clamp(vignette, 0, 1);
    await this.persist();
    await this.apply();
  }

  public async setZoom(zoom: number): Promise<void> {
    this.settings.zoom = this.clamp(zoom, 1, 2);
    await this.persist();
    await this.apply();
  }

  public async setPosX(pos_x: number): Promise<void> {
    this.settings.pos_x = this.clamp(pos_x, 0, 100);
    await this.persist();
    await this.apply();
  }

  public async setPosY(pos_y: number): Promise<void> {
    this.settings.pos_y = this.clamp(pos_y, 0, 100);
    await this.persist();
    await this.apply();
  }

  public async setClarity(clarity: number): Promise<void> {
    this.settings.clarity = this.clamp(clarity, 0, 1);
    await this.persist();
    await this.apply();
  }

  public async setBrightness(brightness: number): Promise<void> {
    this.settings.brightness = this.clamp(brightness, 0, 2);
    await this.persist();
    await this.apply();
  }

  public async setContrast(contrast: number): Promise<void> {
    this.settings.contrast = this.clamp(contrast, 0, 2);
    await this.persist();
    await this.apply();
  }

  public async setHueRotate(hue_rotate: number): Promise<void> {
    this.settings.hue_rotate = this.clamp(hue_rotate, 0, 360);
    await this.persist();
    await this.apply();
  }

  public async setGrayscale(grayscale: number): Promise<void> {
    this.settings.grayscale = this.clamp(grayscale, 0, 1);
    await this.persist();
    await this.apply();
  }

  public async setSepia(sepia: number): Promise<void> {
    this.settings.sepia = this.clamp(sepia, 0, 1);
    await this.persist();
    await this.apply();
  }

  private async persist(): Promise<void> {
    await invoke('set_wallpaper_settings', { wallpaper: this.settings });
  }

  private ensureDom(): void {
    if (this.root && this.mediaWrapper && this.img && this.video && this.tintLayer && this.vignetteLayer && this.dimLayer) return;

    this.root = document.createElement('div');
    this.root.id = 'wallpaper-layer';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.cssText = [
      'position: fixed',
      'inset: 0',
      'z-index: 0',
      'pointer-events: none',
      'overflow: hidden',
    ].join(';');

    this.mediaWrapper = document.createElement('div');
    this.mediaWrapper.setAttribute('aria-hidden', 'true');
    this.mediaWrapper.style.cssText = [
      'position: absolute',
      'inset: 0',
      'width: 100%',
      'height: 100%',
      'opacity: 1',
      'mix-blend-mode: normal',
    ].join(';');

    this.img = document.createElement('img');
    this.img.alt = '';
    this.img.draggable = false;
    this.img.style.cssText = [
      'position: absolute',
      'inset: 0',
      'width: 100%',
      'height: 100%',
    ].join(';');

    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.loop = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    (this.video as any).disablePictureInPicture = true;
    (this.video as any).controls = false;
    this.video.preload = 'auto';
    this.video.style.cssText = [
      'position: absolute',
      'inset: 0',
      'width: 100%',
      'height: 100%',
      'display: none',
    ].join(';');

    this.tintLayer = document.createElement('div');
    this.tintLayer.setAttribute('aria-hidden', 'true');
    this.tintLayer.style.cssText = [
      'position: absolute',
      'inset: 0',
      'background: rgba(0,0,0,0)',
      'opacity: 0',
      'pointer-events: none',
    ].join(';');

    this.vignetteLayer = document.createElement('div');
    this.vignetteLayer.setAttribute('aria-hidden', 'true');
    this.vignetteLayer.style.cssText = [
      'position: absolute',
      'inset: 0',
      'background: rgba(0,0,0,0)',
      'pointer-events: none',
    ].join(';');

    this.dimLayer = document.createElement('div');
    this.dimLayer.style.cssText = [
      'position: absolute',
      'inset: 0',
      'background: rgba(0,0,0,0)',
    ].join(';');

    this.mediaWrapper.appendChild(this.img);
    this.mediaWrapper.appendChild(this.video);
    this.root.appendChild(this.mediaWrapper);
    this.root.appendChild(this.tintLayer);
    this.root.appendChild(this.vignetteLayer);
    this.root.appendChild(this.dimLayer);

    document.body.insertBefore(this.root, document.body.firstChild);
  }

  private async apply(): Promise<void> {
    this.ensureDom();

    const html = document.documentElement;
    const body = document.body;

    const enabled = !!this.settings.enabled && !!this.settings.file_path;
    const mode = 'overlay';

    if (!enabled) {
      html.removeAttribute('data-wallpaper-enabled');
      body.removeAttribute('data-wallpaper-enabled');
      html.removeAttribute('data-wallpaper-mode');
      body.removeAttribute('data-wallpaper-mode');
      if (this.img) this.img.src = '';
      if (this.video) {
        try {
          this.video.pause();
        } catch {}
        this.video.removeAttribute('src');
        this.video.load();
      }
      if (this.root) this.root.style.display = 'none';
      return;
    }

    html.setAttribute('data-wallpaper-enabled', 'true');
    body.setAttribute('data-wallpaper-enabled', 'true');
    html.setAttribute('data-wallpaper-mode', mode);
    body.setAttribute('data-wallpaper-mode', mode);

    if (this.root) this.root.style.display = 'block';

    if (this.root) {
      this.root.style.zIndex = '9998';
    }

    const url = convertFileSrc(this.settings.file_path);
    const lowerPath = String(this.settings.file_path || '').toLowerCase();
    const isVideo = lowerPath.endsWith('.mp4') || lowerPath.endsWith('.webm');

    const clarity = this.clamp(Number(this.settings.clarity ?? 0), 0, 1);

    const blurPx = Math.max(0, (this.settings.blur || 0) + clarity * 8);
    const sat = Math.max(0, (this.settings.saturate || 1) * (1 - 0.65 * clarity));
    const dim = this.clamp(this.settings.dim ?? 0, -1, 1);
    const brightness = Math.min(3, Math.max(0, this.settings.brightness ?? 1) * (1 - dim));
    const contrast = Math.max(0, (this.settings.contrast ?? 1) * (1 - 0.25 * clarity));
    const hueRotate = Math.max(0, this.settings.hue_rotate ?? 0);
    const grayscale = this.clamp((this.settings.grayscale ?? 0) + clarity * 0.35, 0, 1);
    const sepia = this.clamp(this.settings.sepia ?? 0, 0, 1);
    const blend = (this.settings.blend_mode || 'normal').trim();

    // WebView2/Tauri 某些情况下 mix-blend-mode 视觉无效，这里提供可见的“模拟混合效果”兜底
    let extraBrightnessMul = 1;
    let extraContrastMul = 1;
    let extraSaturateMul = 1;
    let extraHueRotate = 0;
    let extraInvert = 0;
    let forceSaturateZero = false;

    switch (blend) {
      case 'multiply':
        extraBrightnessMul = 0.85;
        extraContrastMul = 1.15;
        break;
      case 'screen':
        extraBrightnessMul = 1.25;
        extraContrastMul = 1.05;
        break;
      case 'overlay':
        extraContrastMul = 1.25;
        extraSaturateMul = 1.05;
        break;
      case 'soft-light':
        extraBrightnessMul = 1.05;
        extraContrastMul = 1.12;
        break;
      case 'hard-light':
        extraBrightnessMul = 1.1;
        extraContrastMul = 1.3;
        break;
      case 'color-dodge':
        extraBrightnessMul = 1.35;
        extraContrastMul = 1.2;
        break;
      case 'color-burn':
        extraBrightnessMul = 0.7;
        extraContrastMul = 1.4;
        break;
      case 'difference':
        extraInvert = 1;
        extraHueRotate = 180;
        break;
      case 'exclusion':
        extraInvert = 0.7;
        extraHueRotate = 180;
        break;
      case 'luminosity':
        forceSaturateZero = true;
        extraContrastMul = 1.05;
        break;
      default:
        break;
    }

    const finalSat = forceSaturateZero ? 0 : Math.max(0, sat * extraSaturateMul);
    const finalBrightness = Math.max(0, brightness * extraBrightnessMul);
    const finalContrast = Math.max(0, contrast * extraContrastMul);
    const finalHueRotate = hueRotate + extraHueRotate;

    const invertPart = extraInvert > 0 ? ` invert(${extraInvert})` : '';
    const filter = `blur(${blurPx}px) saturate(${finalSat}) brightness(${finalBrightness}) contrast(${finalContrast}) hue-rotate(${finalHueRotate}deg) grayscale(${grayscale}) sepia(${sepia})${invertPart}`;
    const fit = this.settings.fit || 'cover';
    const effectiveOpacity = this.clamp(Number(this.settings.opacity ?? DEFAULT_SETTINGS.opacity) * (1 - 0.55 * clarity), 0, 0.7);
    const opacity = String(effectiveOpacity);

    const zoom = this.clamp(Number(this.settings.zoom ?? 1), 1, 2);
    const posX = this.clamp(Number(this.settings.pos_x ?? 50), 0, 100);
    const posY = this.clamp(Number(this.settings.pos_y ?? 50), 0, 100);
    const objectPosition = `${posX}% ${posY}%`;
    const transformOrigin = objectPosition;

    if (this.mediaWrapper) {
      this.mediaWrapper.style.opacity = opacity;
      (this.mediaWrapper.style as any).mixBlendMode = 'normal';
    }

    if (this.tintLayer) {
      const tintOpacity = this.clamp(Number(this.settings.tint_opacity ?? 0), 0, 1);
      this.tintLayer.style.opacity = String(tintOpacity);
      this.tintLayer.style.background = String(this.settings.tint_color || '#000000');
    }

    if (this.vignetteLayer) {
      const v = this.clamp(Number(this.settings.vignette ?? 0), 0, 1);
      if (v <= 0) {
        this.vignetteLayer.style.background = 'rgba(0,0,0,0)';
      } else {
        this.vignetteLayer.style.background = `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 58%, rgba(0,0,0,${v}) 100%)`;
      }
    }

    if (this.img) {
      this.img.style.display = isVideo ? 'none' : 'block';
      if (!isVideo) {
        this.img.src = url;
        (this.img.style as any).objectFit = fit;
        (this.img.style as any).objectPosition = objectPosition;
        this.img.style.filter = filter;
        (this.img.style as any).transformOrigin = transformOrigin;
        (this.img.style as any).transform = zoom !== 1 ? `scale(${zoom})` : '';
      } else {
        this.img.src = '';
      }
    }

    if (this.video) {
      this.video.style.display = isVideo ? 'block' : 'none';
      if (isVideo) {
        if (this.video.src !== url) {
          this.video.src = url;
        }
        (this.video.style as any).objectFit = fit;
        (this.video.style as any).objectPosition = objectPosition;
        this.video.style.filter = filter;
        (this.video.style as any).transformOrigin = transformOrigin;
        (this.video.style as any).transform = zoom !== 1 ? `scale(${zoom})` : '';

        try {
          const p = this.video.play();
          if (p && typeof (p as any).catch === 'function') {
            (p as any).catch(() => {
              if (!this.videoAutoplayRetryBound) {
                this.videoAutoplayRetryBound = true;
                const retry = () => {
                  if (!this.video) return;
                  try {
                    const p2 = this.video.play();
                    if (p2 && typeof (p2 as any).catch === 'function') {
                      (p2 as any).catch(() => {});
                    }
                  } catch {}
                  document.removeEventListener('pointerdown', retry, true);
                  document.removeEventListener('keydown', retry, true);
                };
                document.addEventListener('pointerdown', retry, true);
                document.addEventListener('keydown', retry, true);
              }
            });
          }
        } catch {}
      } else {
        try {
          this.video.pause();
        } catch {}
        this.video.removeAttribute('src');
        this.video.load();
        this.videoAutoplayRetryBound = false;
      }
    }

    if (this.dimLayer) {
      this.dimLayer.style.background = 'rgba(0,0,0,0)';
    }
  }

  private clamp(v: number, min: number, max: number): number {
    if (Number.isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
  }
}

export const wallpaperManager = new WallpaperManager();

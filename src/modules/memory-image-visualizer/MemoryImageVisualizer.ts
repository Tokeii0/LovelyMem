// 内存图像可视化 - 主控件（原生 TS，复用 pixel_weaver 后端）
//
// 由 LovelyPixelWeaver 的 React 实现移植而来：实时预览、拖动调偏移、边缘调尺寸、
// 自动滚动、水平/垂直翻转、熵值分析弹窗。

import * as api from './api';
import { PRESET_RESOLUTIONS } from './types';
import type {
  ImageProcessingParams,
  ValidationResult,
  EntropyAnalysisResult,
  EntropySortMode,
  ImageType,
  BitDepth,
  Endianness,
} from './types';

const IMAGE_TYPES: Array<{ v: ImageType; label: string }> = [
  { v: 'Luma', label: 'Luma 灰度 (1ch)' },
  { v: 'Rgb', label: 'RGB (3ch)' },
  { v: 'Rgba', label: 'RGBA (4ch)' },
  { v: 'Bgr', label: 'BGR (3ch)' },
  { v: 'Bgra', label: 'BGRA (4ch)' },
];
const DEPTHS: Array<{ v: BitDepth; label: string }> = [
  { v: 'B8', label: '8 位' },
  { v: 'B16', label: '16 位' },
];
const ENDIANS: Array<{ v: Endianness; label: string }> = [
  { v: 'Little', label: '小端' },
  { v: 'Big', label: '大端' },
  { v: 'Native', label: '本机' },
];

export class MemoryImageVisualizer {
  private app: HTMLElement;
  private params: ImageProcessingParams = {
    input_path: '',
    width: 512,
    height: 512,
    offset: 0,
    image_type: 'Rgb',
    depth: 'B8',
    endian: 'Little',
  };
  private validation: ValidationResult | null = null;
  private previewSrc: string | null = null;
  private flipH = false;
  private flipV = false;

  // 预览处理串行化（防 invoke 风暴）
  private previewTimer: number | null = null;
  private processing = false;
  private needsRerun = false;

  // 自动滚动
  private autoScrolling = false;
  private autoScrollPaused = false;
  private autoScrollTimer: number | null = null;

  // 熵分析
  private entropyResult: EntropyAnalysisResult | null = null;
  private entropySort: EntropySortMode = 'entropy-high';

  constructor(app: HTMLElement) {
    this.app = app;
  }

  /** 渲染骨架并绑定事件 */
  render(): void {
    const main = document.createElement('div');
    main.className = 'miv-main';
    main.innerHTML = `
      ${this.toolbarHtml()}
      <div class="miv-stage" id="miv-stage"></div>
      ${this.paramsHtml()}
    `;
    this.app.appendChild(main);
    this.bindEvents();
    this.renderStage();
    this.updateToolbar();
  }

  // ---------- 对外入口 ----------

  /** 载入一个文件并按可选尺寸刷新预览 */
  async loadFile(path: string, width?: number | null, height?: number | null): Promise<void> {
    this.params.input_path = path;
    this.params.offset = 0;
    if (width && width > 0) this.params.width = width;
    if (height && height > 0) this.params.height = height;
    this.syncParamInputs();
    this.setFileName(path);
    await this.refreshValidation();
    this.updateToolbar();
    this.requestPreview(true);
  }

  /** 选择文件并载入 */
  async selectAndLoad(): Promise<void> {
    const p = await api.selectInputFile();
    if (p) await this.loadFile(p);
  }

  /** 清理定时器（窗口关闭/卸载时调用） */
  cleanup(): void {
    this.stopAutoScroll();
    if (this.previewTimer) { clearTimeout(this.previewTimer); this.previewTimer = null; }
  }

  // ---------- 工具栏 / 参数 HTML ----------

  private toolbarHtml(): string {
    return `
      <div class="miv-toolbar">
        <button class="miv-btn primary" data-act="open">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          选择文件
        </button>
        <button class="miv-btn" data-act="save" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          保存 PNG
        </button>
        <button class="miv-btn" data-act="flip-h" title="水平翻转">↔ 水平</button>
        <button class="miv-btn" data-act="flip-v" title="垂直翻转">↕ 垂直</button>
        <button class="miv-btn" data-act="entropy" disabled>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          熵值分析
        </button>
        <button class="miv-btn" data-act="autoscroll" disabled>▶ 自动滚动</button>
        <div class="miv-spacer"></div>
        <span class="miv-file-name" style="font-size:12px;color:var(--text-secondary);max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
      </div>`;
  }

  private paramsHtml(): string {
    const opt = <T extends string>(arr: Array<{ v: T; label: string }>, cur: T) =>
      arr.map((o) => `<option value="${o.v}" ${o.v === cur ? 'selected' : ''}>${o.label}</option>`).join('');
    const presets = PRESET_RESOLUTIONS.map(
      (r) => `<option value="${r.width}x${r.height}">${r.label}</option>`,
    ).join('');
    return `
      <div class="miv-params">
        <div class="miv-sliders">
          ${this.sliderRow('width', '宽度', 1, 4096)}
          ${this.sliderRow('height', '高度', 1, 4096)}
          ${this.sliderRow('offset', '偏移量 (字节)', 0, 0)}
        </div>
        <div class="miv-param-fields">
          <div class="miv-field">
            <label>预设分辨率</label>
            <select data-field="preset"><option value="">自定义…</option>${presets}</select>
          </div>
          <div class="miv-field"><label>宽度</label><input type="number" min="1" max="8192" data-field="width" value="${this.params.width}"></div>
          <div class="miv-field"><label>高度</label><input type="number" min="1" max="8192" data-field="height" value="${this.params.height}"></div>
          <div class="miv-field offset"><label>偏移量 (字节)</label><input type="number" min="0" data-field="offset" value="${this.params.offset}"></div>
          <div class="miv-field"><label>像素格式</label><select data-field="image_type">${opt(IMAGE_TYPES, this.params.image_type)}</select></div>
          <div class="miv-field"><label>位深</label><select data-field="depth">${opt(DEPTHS, this.params.depth)}</select></div>
          <div class="miv-field"><label>字节序</label><select data-field="endian">${opt(ENDIANS, this.params.endian)}</select></div>
        </div>
        <div class="miv-warn" id="miv-warn" style="display:none"></div>
      </div>`;
  }

  /** 全宽滑块行：宽/高/偏移量，拖动实时更新预览 */
  private sliderRow(key: 'width' | 'height' | 'offset', label: string, min: number, max: number): string {
    const cur = key === 'width' ? this.params.width : key === 'height' ? this.params.height : this.params.offset;
    return `
      <div class="miv-slider-row">
        <label><span>${label}</span><span class="miv-slider-val" data-slider-val="${key}">${cur}</span></label>
        <input type="range" data-slider="${key}" min="${min}" max="${max}" value="${cur}">
      </div>`;
  }

  // ---------- 事件 ----------

  private bindEvents(): void {
    // 工具栏点击
    this.app.querySelector('.miv-toolbar')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-act]') as HTMLElement | null;
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      switch (act) {
        case 'open': void this.selectAndLoad(); break;
        case 'save': this.savePng(); break;
        case 'flip-h': this.flipH = !this.flipH; this.applyFlip(); this.updateToolbar(); break;
        case 'flip-v': this.flipV = !this.flipV; this.applyFlip(); this.updateToolbar(); break;
        case 'entropy': void this.runEntropy(); break;
        case 'autoscroll': this.toggleAutoScroll(); break;
      }
    });

    // 参数变化
    const params = this.app.querySelector('.miv-params');
    params?.addEventListener('change', (e) => this.onFieldChange(e));
    params?.addEventListener('input', (e) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement && t.type === 'range') { this.onSliderInput(e); return; }
      // number 输入用 input 实时响应（debounce 在 requestPreview 内）
      if (t instanceof HTMLInputElement && t.type === 'number') this.onFieldChange(e);
    });

    // 空格暂停自动滚动
    document.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // 空格：暂停/继续自动滚动
    if (this.autoScrolling && e.code === 'Space') {
      e.preventDefault();
      this.autoScrollPaused = !this.autoScrollPaused;
      this.updateOverlay();
      return;
    }

    // 方向键调宽高（焦点不在输入控件时；Shift 加速 ×10）
    if (!this.params.input_path) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    const step = e.shiftKey ? 10 : 1;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft':
        this.params.width = Math.max(1, this.params.width - step);
        this.syncControl('width', this.params.width);
        break;
      case 'ArrowRight':
        this.params.width = Math.min(8192, this.params.width + step);
        this.syncControl('width', this.params.width);
        break;
      case 'ArrowUp':
        this.params.height = Math.min(8192, this.params.height + step);
        this.syncControl('height', this.params.height);
        break;
      case 'ArrowDown':
        this.params.height = Math.max(1, this.params.height - step);
        this.syncControl('height', this.params.height);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      this.requestPreview(true);
    }
  };

  private onFieldChange(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const field = t.getAttribute('data-field');
    if (!field) return;

    if (field === 'preset') {
      const val = (t as HTMLSelectElement).value;
      if (val) {
        const [w, h] = val.split('x').map((n) => parseInt(n, 10));
        if (w > 0 && h > 0) {
          this.params.width = w;
          this.params.height = h;
          this.syncParamInputs();
          this.requestPreview();
        }
      }
      return;
    }

    if (field === 'width' || field === 'height' || field === 'offset') {
      let v = parseInt((t as HTMLInputElement).value, 10);
      if (!Number.isFinite(v) || v < 0) v = field === 'offset' ? 0 : 1;
      if ((field === 'width' || field === 'height') && v < 1) v = 1;
      if (field === 'offset' && this.validation?.file_size) {
        v = Math.min(v, this.validation.file_size);
      }
      if (field === 'width') this.params.width = v;
      else if (field === 'height') this.params.height = v;
      else this.params.offset = v;
      this.syncControl(field, v);
    } else if (field === 'image_type') {
      this.params.image_type = (t as HTMLSelectElement).value as ImageType;
    } else if (field === 'depth') {
      this.params.depth = (t as HTMLSelectElement).value as BitDepth;
    } else if (field === 'endian') {
      this.params.endian = (t as HTMLSelectElement).value as Endianness;
    }
    this.requestPreview();
  }

  // ---------- 预览处理 ----------

  private requestPreview(immediate = false): void {
    if (!this.params.input_path) return;
    if (this.previewTimer) { clearTimeout(this.previewTimer); this.previewTimer = null; }
    if (immediate) { void this.doProcess(); return; }
    this.previewTimer = window.setTimeout(() => void this.doProcess(), 150);
  }

  private async doProcess(): Promise<void> {
    if (!this.params.input_path) return;
    if (this.processing) { this.needsRerun = true; return; }
    this.processing = true;
    try {
      const res = await api.processRawImage({ ...this.params });
      if (res.success && res.image_data) {
        this.previewSrc = `data:image/png;base64,${res.image_data}`;
        // 复用已有 <img>，仅替换 src：拖动时避免重建 DOM / 重绑事件 / 闪烁
        const img = this.app.querySelector<HTMLImageElement>('.miv-preview');
        if (img) {
          img.src = this.previewSrc;
        } else {
          this.renderStage();
        }
        this.updateToolbar();
      }
    } catch (err) {
      console.error('[内存图像可视化] 处理失败:', err);
    } finally {
      this.processing = false;
      if (this.needsRerun) { this.needsRerun = false; void this.doProcess(); }
    }
  }

  private async refreshValidation(): Promise<void> {
    try {
      this.validation = await api.validateParameters({ ...this.params });
      this.updateOffsetSliderMax();
      const warn = this.app.querySelector<HTMLElement>('#miv-warn');
      if (warn) {
        const msgs = [...(this.validation.errors || []), ...(this.validation.warnings || [])];
        if (msgs.length) { warn.style.display = ''; warn.textContent = msgs.join('；'); }
        else warn.style.display = 'none';
      }
    } catch (err) {
      console.error('[内存图像可视化] 校验失败:', err);
    }
  }

  // ---------- 舞台渲染 ----------

  private renderStage(): void {
    const stage = this.app.querySelector<HTMLElement>('#miv-stage');
    if (!stage) return;

    if (!this.params.input_path) {
      stage.innerHTML = `
        <div class="miv-stage-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
          <p style="font-size:15px;font-weight:600">请选择要可视化的文件</p>
          <p style="font-size:12px">点击左上角「选择文件」，或从进程列表右键 PID 自动载入</p>
        </div>`;
      return;
    }
    if (!this.previewSrc) {
      stage.innerHTML = `<div class="miv-stage-empty"><div class="miv-loading"></div><p style="margin-top:12px">正在渲染…</p></div>`;
      return;
    }

    stage.innerHTML = `
      <div class="miv-preview-wrap">
        <img class="miv-preview" src="${this.previewSrc}" draggable="false" alt="preview" />
        <div class="miv-resize miv-resize-w" data-resize="w" title="拖动调整宽度"></div>
        <div class="miv-resize miv-resize-h" data-resize="h" title="拖动调整高度"></div>
        <div class="miv-resize miv-resize-wh" data-resize="wh" title="拖动调整宽高"></div>
      </div>
      <div class="miv-overlay" id="miv-overlay"></div>`;

    const img = stage.querySelector<HTMLImageElement>('.miv-preview');
    if (img) {
      this.applyFlip();
      img.addEventListener('mousedown', (e) => this.startDragOffset(e));
    }
    stage.querySelectorAll<HTMLElement>('.miv-resize').forEach((h) => {
      h.addEventListener('mousedown', (e) => this.startResize(e, h.getAttribute('data-resize') as 'w' | 'h' | 'wh'));
    });
    this.updateOverlay();
  }

  private applyFlip(): void {
    const img = this.app.querySelector<HTMLImageElement>('.miv-preview');
    if (img) img.style.transform = `scaleX(${this.flipH ? -1 : 1}) scaleY(${this.flipV ? -1 : 1})`;
  }

  private updateOverlay(): void {
    const ov = this.app.querySelector<HTMLElement>('#miv-overlay');
    if (!ov) return;
    let scroll = '';
    if (this.autoScrolling) {
      scroll = this.autoScrollPaused
        ? '<span class="badge pause">⏸ 已暂停 (空格继续)</span>'
        : '<span class="badge run">▶ 滚动中 (空格暂停)</span>';
    }
    ov.innerHTML = `<span><span class="k">偏移</span><span class="v">${this.params.offset}</span></span>${scroll}`;
  }

  // ---------- 拖动调偏移 ----------

  private startDragOffset(e: MouseEvent): void {
    if (!this.validation?.file_size || this.autoScrolling) return;
    e.preventDefault();
    const img = this.app.querySelector<HTMLImageElement>('.miv-preview');
    img?.classList.add('dragging');
    const startX = e.clientX;
    const startOffset = this.params.offset;
    const maxOffset = this.validation.file_size;

    const move = (me: MouseEvent) => {
      let sens = Math.max(1, Math.floor(maxOffset / 1000));
      if (me.shiftKey) sens *= 10;
      else if (me.ctrlKey || me.metaKey) sens = Math.max(1, Math.floor(sens / 10));
      const delta = (me.clientX - startX) * sens;
      this.params.offset = Math.max(0, Math.min(Math.floor(startOffset + delta), maxOffset));
      this.syncOffsetInput();
      this.updateOverlay();
      this.requestPreview(true);
    };
    const up = () => {
      img?.classList.remove('dragging');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // ---------- 边缘调尺寸 ----------

  private startResize(e: MouseEvent, dir: 'w' | 'h' | 'wh'): void {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = this.params.width;
    const startH = this.params.height;

    const move = (me: MouseEvent) => {
      if (dir === 'w' || dir === 'wh') {
        this.params.width = Math.max(1, Math.min(startW + (me.clientX - startX), 8192));
      }
      if (dir === 'h' || dir === 'wh') {
        this.params.height = Math.max(1, Math.min(startH + (me.clientY - startY), 8192));
      }
      this.params.width = Math.floor(this.params.width);
      this.params.height = Math.floor(this.params.height);
      this.syncParamInputs();
      this.requestPreview(true);
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  // ---------- 自动滚动 ----------

  private toggleAutoScroll(): void {
    if (this.autoScrolling) { this.stopAutoScroll(); return; }
    if (!this.validation?.file_size) return;
    this.startAutoScroll(30);
  }

  private startAutoScroll(durationSec: number): void {
    if (!this.validation?.file_size) return;
    this.stopAutoScroll();
    const fileSize = this.validation.file_size;
    const interval = 50;
    const totalSteps = Math.max(1, Math.floor(durationSec * (1000 / interval)));
    const stepSize = Math.max(1, Math.floor(fileSize / totalSteps));
    let step = 0;

    this.params.offset = 0;
    this.autoScrolling = true;
    this.autoScrollPaused = false;
    this.updateToolbar();
    this.updateOverlay();

    this.autoScrollTimer = window.setInterval(() => {
      if (this.autoScrollPaused) return;
      step++;
      this.params.offset = Math.max(0, Math.min(Math.floor(step * stepSize), fileSize));
      this.syncOffsetInput();
      this.updateOverlay();
      this.requestPreview(true);
      if (step >= totalSteps || this.params.offset >= fileSize) this.stopAutoScroll();
    }, interval);
  }

  private stopAutoScroll(): void {
    if (this.autoScrollTimer) { clearInterval(this.autoScrollTimer); this.autoScrollTimer = null; }
    this.autoScrolling = false;
    this.autoScrollPaused = false;
    this.updateToolbar();
    this.updateOverlay();
  }

  // ---------- 保存 PNG ----------

  private savePng(): void {
    if (!this.previewSrc) return;
    const a = document.createElement('a');
    a.href = this.previewSrc;
    a.download = `mem_${this.params.width}x${this.params.height}_off${this.params.offset}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- 同步输入框 ----------

  private syncParamInputs(): void {
    this.syncControl('width', this.params.width);
    this.syncControl('height', this.params.height);
    this.syncControl('offset', this.params.offset);
  }

  private syncOffsetInput(): void {
    this.syncControl('offset', this.params.offset);
  }

  /** 同步某参数到 number 输入框 + 滑块 + 数值标签（不覆盖用户正在操作的控件） */
  private syncControl(f: 'width' | 'height' | 'offset', v: number): void {
    const inp = this.app.querySelector<HTMLInputElement>(`input[data-field="${f}"]`);
    if (inp && document.activeElement !== inp) inp.value = String(v);
    const sld = this.app.querySelector<HTMLInputElement>(`input[data-slider="${f}"]`);
    if (sld && document.activeElement !== sld) sld.value = String(v);
    const lbl = this.app.querySelector<HTMLElement>(`[data-slider-val="${f}"]`);
    if (lbl) lbl.textContent = String(v);
  }

  /** 偏移量滑块的最大值跟随文件大小 */
  private updateOffsetSliderMax(): void {
    const max = Math.max(0, this.validation?.file_size ?? 0);
    const sld = this.app.querySelector<HTMLInputElement>('input[data-slider="offset"]');
    if (sld) sld.max = String(max);
  }

  private onSliderInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    const key = t.getAttribute('data-slider') as 'width' | 'height' | 'offset' | null;
    if (key !== 'width' && key !== 'height' && key !== 'offset') return;
    let v = parseInt(t.value, 10);
    if (!Number.isFinite(v)) return;
    if (key === 'offset') {
      v = Math.max(0, v);
      if (this.validation?.file_size) v = Math.min(v, this.validation.file_size);
      this.params.offset = v;
    } else if (key === 'width') {
      this.params.width = Math.max(1, v);
      v = this.params.width;
    } else {
      this.params.height = Math.max(1, v);
      v = this.params.height;
    }
    this.syncControl(key, v);
    this.updateOverlay();
    this.requestPreview(true); // 拖动滑块：立即更新，靠 processing 守卫合帧
  }

  private setFileName(path: string): void {
    const el = this.app.querySelector<HTMLElement>('.miv-file-name');
    if (el) { el.textContent = path; el.title = path; }
  }

  private updateToolbar(): void {
    const hasImg = !!this.previewSrc;
    const hasFile = !!this.params.input_path;
    const setDisabled = (act: string, dis: boolean) => {
      const b = this.app.querySelector<HTMLButtonElement>(`button[data-act="${act}"]`);
      if (b) b.disabled = dis;
    };
    setDisabled('save', !hasImg);
    setDisabled('entropy', !hasFile);
    setDisabled('autoscroll', !this.validation?.file_size);
    const fh = this.app.querySelector<HTMLButtonElement>('button[data-act="flip-h"]');
    fh?.classList.toggle('active', this.flipH);
    const fv = this.app.querySelector<HTMLButtonElement>('button[data-act="flip-v"]');
    fv?.classList.toggle('active', this.flipV);
    const as = this.app.querySelector<HTMLButtonElement>('button[data-act="autoscroll"]');
    if (as) {
      as.classList.toggle('danger', this.autoScrolling);
      as.textContent = this.autoScrolling ? '■ 停止' : '▶ 自动滚动';
    }
  }

  // ---------- 熵分析 ----------

  private async runEntropy(): Promise<void> {
    if (!this.params.input_path) return;
    const btn = this.app.querySelector<HTMLButtonElement>('button[data-act="entropy"]');
    if (btn) { btn.disabled = true; btn.textContent = '分析中…'; }
    try {
      this.entropyResult = await api.analyzeEntropy({
        file_path: this.params.input_path,
        chunk_size: 4096,
        step_size: 4096,
        min_entropy: 6.0,
        max_entropy: 8.0,
        min_size: 4096,
        width: this.params.width,
        height: this.params.height,
        image_type: this.params.image_type,
        page_size: 1000,
        page: 0,
        sort_mode: this.entropySort,
      });
      this.showEntropyModal();
    } catch (err) {
      console.error('[内存图像可视化] 熵分析失败:', err);
      alert(`熵值分析失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> 熵值分析';
      }
    }
  }

  private async loadEntropyPage(page: number, sort?: EntropySortMode): Promise<void> {
    if (!this.entropyResult?.analysis_id) return;
    const sortMode = sort ?? this.entropySort;
    try {
      this.entropyResult = await api.fetchEntropyPage({
        analysis_id: this.entropyResult.analysis_id,
        page,
        page_size: 1000,
        sort_mode: sortMode,
      });
      this.entropySort = sortMode;
      this.showEntropyModal();
    } catch (err) {
      console.error('[内存图像可视化] 翻页失败:', err);
    }
  }

  private showEntropyModal(): void {
    document.getElementById('miv-entropy-modal')?.remove();
    const r = this.entropyResult;
    if (!r) return;

    const cards = (r.regions || []).map((rg) => {
      const thumb = rg.preview_image
        ? `<img class="thumb" src="data:image/png;base64,${rg.preview_image}" alt="" />`
        : `<div class="thumb-empty">无预览</div>`;
      const fmt = rg.suggested_format ? `<span>${this.esc(rg.suggested_format)}</span>` : '';
      return `
        <div class="miv-entropy-card" data-offset="${rg.offset}">
          ${thumb}
          <div class="meta">
            <span class="off">0x${rg.offset.toString(16).toUpperCase().padStart(8, '0')}</span>
            <div class="row2"><span class="ent">${rg.entropy.toFixed(2)}</span>${fmt}</div>
          </div>
        </div>`;
    }).join('');

    const totalPages = r.total_pages || 1;
    const page = r.page || 0;
    const mask = document.createElement('div');
    mask.className = 'miv-modal-mask';
    mask.id = 'miv-entropy-modal';
    mask.innerHTML = `
      <div class="miv-modal">
        <div class="miv-modal-head">
          <div>
            <h3><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>熵值分析结果</h3>
            <div class="sub">已扫描 ${r.chunks_scanned} 块 · 共 ${r.total_regions} 个候选区域 · 点击卡片跳转到该偏移</div>
          </div>
          <button class="miv-modal-close" data-act="close">✕</button>
        </div>
        <div class="miv-modal-toolbar">
          <label>排序：
            <select data-act="sort">
              <option value="entropy-high" ${this.entropySort === 'entropy-high' ? 'selected' : ''}>熵值 高→低</option>
              <option value="entropy-low" ${this.entropySort === 'entropy-low' ? 'selected' : ''}>熵值 低→高</option>
              <option value="offset-asc" ${this.entropySort === 'offset-asc' ? 'selected' : ''}>偏移 升序</option>
              <option value="offset-desc" ${this.entropySort === 'offset-desc' ? 'selected' : ''}>偏移 降序</option>
            </select>
          </label>
          <span style="color:var(--text-secondary)">💡 图像数据熵值通常在 6.0 - 8.0 之间</span>
        </div>
        <div class="miv-modal-body">
          ${r.regions && r.regions.length
            ? `<div class="miv-entropy-grid">${cards}</div>`
            : `<div class="miv-empty-state">未找到符合条件的高熵区域</div>`}
        </div>
        <div class="miv-modal-foot">
          <span>第 ${page + 1} / ${totalPages} 页</span>
          <div class="miv-pager">
            <button class="miv-btn" data-act="first" ${page === 0 ? 'disabled' : ''}>首页</button>
            <button class="miv-btn" data-act="prev" ${page === 0 ? 'disabled' : ''}>上一页</button>
            <button class="miv-btn" data-act="next" ${page >= totalPages - 1 ? 'disabled' : ''}>下一页</button>
            <button class="miv-btn" data-act="last" ${page >= totalPages - 1 ? 'disabled' : ''}>末页</button>
          </div>
        </div>
      </div>`;

    mask.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target === mask || target.closest('[data-act="close"]')) { mask.remove(); return; }
      const card = target.closest('.miv-entropy-card') as HTMLElement | null;
      if (card) {
        const off = parseInt(card.getAttribute('data-offset') || '0', 10);
        this.params.offset = off;
        this.syncOffsetInput();
        this.updateOverlay();
        this.requestPreview(true);
        mask.remove();
        return;
      }
      const act = target.closest('button[data-act]')?.getAttribute('data-act');
      if (act === 'first') void this.loadEntropyPage(0);
      else if (act === 'prev') void this.loadEntropyPage(Math.max(0, page - 1));
      else if (act === 'next') void this.loadEntropyPage(Math.min(totalPages - 1, page + 1));
      else if (act === 'last') void this.loadEntropyPage(totalPages - 1);
    });
    mask.querySelector<HTMLSelectElement>('select[data-act="sort"]')?.addEventListener('change', (e) => {
      void this.loadEntropyPage(0, (e.target as HTMLSelectElement).value as EntropySortMode);
    });

    document.body.appendChild(mask);
  }

  private esc(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

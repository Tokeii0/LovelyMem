import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings } from '../core/settingsHelper';
import { getMountLetter, mountPath } from '../core/mountDrive';
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MessageManager } from "../utils/message";
import { registerChildWindowShortcuts } from "../core/childWindowShortcuts";
import { icon } from "../shared/svgIcons";

export interface ImageFinderConfig {
  input_file: string;
  output_directory: string;
  chunk_size_mb: number;
  max_png_size_mb: number;
  max_jpg_size_mb: number;
  generate_thumbnails: boolean;
  thumbnail_size: number;
}

export interface ImageFinderProgress {
  processed_bytes: number;
  total_bytes: number;
  found_count: number;
  extracted_count: number;
  status: string;
  completed: boolean;
}

export interface ExtractedImage {
  filename: string;
  file_path: string;
  image_type: 'PNG' | 'JPG';
  file_size: number;
  offset: number;
  thumbnail_path?: string;
}

export interface ImageFinderResult {
  extracted_images: ExtractedImage[];
  total_found: number;
  total_extracted: number;
  duration_ms: number;
  output_directory: string;
}

export class ImageFinderWindow {
  private isExtracting = false;
  private stopRequested = false;
  private currentResults: ImageFinderResult | null = null;
  private currentColumns = 3; // 当前网格列数
  private currentViewMode = 'grid'; // 当前视图模式：grid 或 list
  private currentFilters = {
    type: 'all',
    size: 'all'
  };
  private currentSort = {
    by: 'name',
    direction: 'asc'
  };
  private filteredImages: ExtractedImage[] = [];
  private currentPreviewIndex = 0;
  private previewImages: ExtractedImage[] = [];
  // private currentSearchMode = 'file'; // 'file' 或 'process'
  private config: ImageFinderConfig = {
    input_file: '',
    output_directory: 'extracted_images',
    chunk_size_mb: 256,
    max_png_size_mb: 50,
    max_jpg_size_mb: 20,
    generate_thumbnails: true,
    thumbnail_size: 150
  };

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    this.setupEventListeners();
    this.setupTauriEventListeners();
    this.updateUI();
    await this.loadTheme();
    await this.loadInitialImagePath();
    await this.loadOutputPath();

    // 调试：检查 CSS 是否正确加载
    this.debugCSSLoading();
  }

  private debugCSSLoading(): void {
    console.log('调试 CSS 加载状态');

    // 检查样式表是否加载
    const stylesheets = Array.from(document.styleSheets);
    console.log('已加载的样式表数量:', stylesheets.length);

    stylesheets.forEach((sheet, index) => {
      console.log(`样式表 ${index}:`, sheet.href);
    });

    // 检查特定的 CSS 规则
    const testElement = document.createElement('div');
    testElement.className = 'thumbnail-card';
    testElement.style.visibility = 'hidden';
    testElement.innerHTML = `
      <div class="thumbnail-image">
        <div class="thumbnail-placeholder">${icon('image', 28)}</div>
      </div>
      <div class="thumbnail-info">
        <div class="thumbnail-filename">test.png</div>
      </div>
    `;
    document.body.appendChild(testElement);

    const computedStyle = window.getComputedStyle(testElement);
    console.log('thumbnail-card 样式:');
    console.log('- background:', computedStyle.background);
    console.log('- border:', computedStyle.border);
    console.log('- border-radius:', computedStyle.borderRadius);
    console.log('- position:', computedStyle.position);
    console.log('- height:', computedStyle.height);

    const imageElement = testElement.querySelector('.thumbnail-image') as HTMLElement;
    if (imageElement) {
      const imageStyle = window.getComputedStyle(imageElement);
      console.log('thumbnail-image 样式:');
      console.log('- height:', imageStyle.height);
      console.log('- display:', imageStyle.display);
    }

    document.body.removeChild(testElement);
  }

  private setupEventListeners(): void {
    // 文件选择按钮
    const browseBtn = document.getElementById('browseInputFile') as HTMLButtonElement;
    if (browseBtn) {
      browseBtn.addEventListener('click', () => this.browseInputFile());
    }

    // 输出目录选择按钮
    const outputBtn = document.getElementById('browseOutputDir') as HTMLButtonElement;
    if (outputBtn) {
      outputBtn.addEventListener('click', () => this.browseOutputDirectory());
    }

    // 开始提取按钮
    const startBtn = document.getElementById('startExtraction') as HTMLButtonElement;
    if (startBtn) {
      startBtn.addEventListener('click', () => this.startExtraction());
    }

    // 子窗口通用快捷键：Ctrl+W 关闭窗口（图片查找为独立窗口，无文本搜索故不注册 Ctrl+F）
    registerChildWindowShortcuts();

    // 停止提取按钮
    const stopBtn = document.getElementById('stopExtraction') as HTMLButtonElement;
    if (stopBtn) {
      stopBtn.addEventListener('click', () => this.stopExtraction());
    }

    // 配置输入监听
    this.setupConfigListeners();

    // 布局切换按钮
    this.setupLayoutToggle();

    // 搜索模式切换
    this.setupSearchModeToggle();

    // 视图模式和筛选控制
    this.setupViewControls();

    // 窗口控制按钮
    this.setupWindowControls();
  }

  private setupConfigListeners(): void {
    const inputs = [
      'inputFilePath',
      'outputDirectory', 
      'chunkSize',
      'maxPngSize',
      'maxJpgSize',
      'thumbnailSize'
    ];

    inputs.forEach(id => {
      const element = document.getElementById(id) as HTMLInputElement;
      if (element) {
        element.addEventListener('change', () => this.updateConfigFromUI());
      }
    });

    const generateThumbnails = document.getElementById('generateThumbnails') as HTMLInputElement;
    if (generateThumbnails) {
      generateThumbnails.addEventListener('change', () => this.updateConfigFromUI());
    }
  }

  private setupLayoutToggle(): void {
    // 布局切换按钮事件监听
    const layoutToggleBtns = document.querySelectorAll('.layout-toggle-btn') as NodeListOf<HTMLButtonElement>;

    layoutToggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const columns = parseInt(btn.dataset.columns || '3');
        this.switchLayout(columns);

        // 更新按钮状态
        layoutToggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  private switchLayout(columns: number): void {
    this.currentColumns = columns;
    const thumbnailGrid = document.getElementById('thumbnailGrid') as HTMLElement;

    if (thumbnailGrid) {
      // 移除所有列数类
      thumbnailGrid.classList.remove('columns-3', 'columns-5', 'columns-7');
      // 添加新的列数类
      thumbnailGrid.classList.add(`columns-${columns}`);
    }
  }

  private setupSearchModeToggle(): void {
    // 搜索模式切换按钮事件监听
    const searchModeBtns = document.querySelectorAll('.search-mode-btn') as NodeListOf<HTMLButtonElement>;

    searchModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode || 'file';
        this.switchSearchMode(mode);

        // 更新按钮状态
        searchModeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  private async switchSearchMode(mode: string): Promise<void> {
    // this.currentSearchMode = mode;
    const fileInputGroup = document.getElementById('fileInputGroup') as HTMLElement;
    const processInputGroup = document.getElementById('processInputGroup') as HTMLElement;
    const inputSectionTitle = document.getElementById('inputSectionTitle') as HTMLElement;

    if (mode === 'process') {
      // 切换到进程模式
      if (fileInputGroup) fileInputGroup.classList.add('hidden');
      if (processInputGroup) processInputGroup.classList.remove('hidden');
      if (inputSectionTitle) inputSectionTitle.textContent = '进程选择';

      // 加载可用的进程列表
      await this.loadAvailableProcesses();
    } else {
      // 切换到文件模式
      if (fileInputGroup) fileInputGroup.classList.remove('hidden');
      if (processInputGroup) processInputGroup.classList.add('hidden');
      if (inputSectionTitle) inputSectionTitle.textContent = '文件选择';
    }
  }

  private async loadAvailableProcesses(): Promise<void> {
    try {
      console.log('🔍 开始加载可用进程列表...');
      // 扫描挂载盘中的minidump文件
      const processes = await this.scanMinidumpFiles();
      console.log('✅ 进程扫描完成，找到进程数量:', processes.length);
      this.populateProcessSelector(processes);
    } catch (error) {
      console.error('❌ 加载进程列表失败:', error);
    }
  }

  private async scanMinidumpFiles(): Promise<any[]> {
    try {
      console.log('🔍 开始扫描挂载盘minidump文件...');
      const processes = [];

      // 检查挂载盘 \name 目录
      try {
        const nameDir = await invoke('get_file_list', { path: mountPath('name') });

        for (const item of nameDir as any[]) {
          console.log(`📂 检查目录: ${item.name}, 是否为目录: ${item.is_dir}`);

          if (item.is_dir) {
            // 构建minidump文件路径
            const minidumpPath = mountPath('name', item.name, 'minidump', 'minidump.dmp');
            console.log(`📝 添加进程目录: ${item.name}`);

            // 尝试解析进程名和PID，只保留有PID的进程
            const processMatch = (item as any).name.match(/^(.+\.exe)-(\d+)$/);
            if (processMatch) {
              const [, processName, pid] = processMatch;
              console.log(`📝 解析进程: ${processName}, PID: ${pid}`);
              processes.push({
                name: processName,
                pid: parseInt(pid),
                path: minidumpPath,
                displayName: `${processName} (PID: ${pid})`
              });
            } else {
              // 如果不符合标准格式，跳过（不添加）
              console.log(`⏭️ 跳过非标准格式: ${(item as any).name}`);
            }
          }
        }
      } catch (error) {
        const letter = getMountLetter();
        console.error(`❌ 无法访问${letter}:\\name目录:`, error);
        throw new Error(`无法访问${letter}:\\name目录，请确保${letter}盘已挂载且包含name目录`);
      }

      console.log(`✅ 扫描完成，找到 ${processes.length} 个进程minidump文件`);
      return processes;
    } catch (error) {
      console.error('❌ 扫描minidump文件失败:', error);
      return [];
    }
  }

  private populateProcessSelector(processes: any[]): void {
    const processGroup = document.getElementById('processInputGroup') as HTMLElement;
    if (!processGroup) return;

    // 清除现有内容（除了 label）
    const label = processGroup.querySelector('label');
    processGroup.innerHTML = '';
    if (label) {
      processGroup.appendChild(label);
    }

    if (processes.length > 0) {
      // 创建选择器
      const selectElement = document.createElement('select');
      selectElement.id = 'processSelector';
      selectElement.className = 'process-selector';
      selectElement.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 14px;
        cursor: pointer;
      `;

      // 添加默认选项
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '请选择进程...';
      selectElement.appendChild(defaultOption);

      // 添加进程选项
      processes.forEach(process => {
        const option = document.createElement('option');
        option.value = process.path;
        option.textContent = process.displayName;
        option.dataset.pid = process.pid.toString();
        selectElement.appendChild(option);
      });

      // 添加事件监听器
      selectElement.addEventListener('change', (e) => {
        const selectedPath = (e.target as HTMLSelectElement).value;
        const selectedOption = (e.target as HTMLSelectElement).selectedOptions[0];

        if (selectedPath && selectedOption) {
          // 更新配置为选择的minidump文件路径
          this.config.input_file = selectedPath;
          console.log('选择的进程minidump文件:', selectedPath);
        }
      });

      processGroup.appendChild(selectElement);
    } else {
      // 显示无进程消息
      const noProcessDiv = document.createElement('div');
      noProcessDiv.style.cssText = `
        padding: 12px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        color: var(--error-color);
        font-size: 14px;
        margin-top: 8px;
      `;
      noProcessDiv.textContent = `未找到可用的进程minidump文件，请确保${getMountLetter()}盘中存在进程转储文件`;
      processGroup.appendChild(noProcessDiv);
    }
  }

  private setupViewControls(): void {
    // 视图模式切换
    const viewModeBtns = document.querySelectorAll('.view-mode-btn') as NodeListOf<HTMLButtonElement>;
    viewModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode || 'grid';
        this.switchViewMode(mode);

        // 更新按钮状态
        viewModeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // 筛选控制
    const typeFilter = document.getElementById('typeFilter') as HTMLSelectElement;
    const sizeFilter = document.getElementById('sizeFilter') as HTMLSelectElement;
    const sortBy = document.getElementById('sortBy') as HTMLSelectElement;
    const sortDirection = document.getElementById('sortDirection') as HTMLButtonElement;

    if (typeFilter) {
      typeFilter.addEventListener('change', () => {
        this.currentFilters.type = typeFilter.value;
        this.applyFiltersAndSort();
      });
    }

    if (sizeFilter) {
      sizeFilter.addEventListener('change', () => {
        this.currentFilters.size = sizeFilter.value;
        this.applyFiltersAndSort();
      });
    }

    if (sortBy) {
      sortBy.addEventListener('change', () => {
        this.currentSort.by = sortBy.value;
        this.applyFiltersAndSort();
      });
    }

    if (sortDirection) {
      sortDirection.addEventListener('click', () => {
        this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
        sortDirection.dataset.direction = this.currentSort.direction;
        sortDirection.innerHTML = icon(this.currentSort.direction === 'asc' ? 'arrow-up' : 'arrow-down');
        this.applyFiltersAndSort();
      });
    }

    // 图片预览模态框控制
    this.setupImagePreview();
  }

  private setupImagePreview(): void {
    const previewModal = document.getElementById('imagePreviewModal') as HTMLElement;
    const closePreviewBtn = document.getElementById('closeImagePreview') as HTMLButtonElement;
    const prevBtn = document.getElementById('prevImage') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextImage') as HTMLButtonElement;

    if (closePreviewBtn) {
      closePreviewBtn.addEventListener('click', () => this.closeImagePreview());
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.showPreviousImage());
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.showNextImage());
    }

    // 点击模态框背景关闭
    if (previewModal) {
      previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
          this.closeImagePreview();
        }
      });
    }

    // 键盘导航
    document.addEventListener('keydown', (e) => {
      const modal = document.getElementById('imagePreviewModal') as HTMLElement;
      if (!modal.classList.contains('hidden')) {
        switch (e.key) {
          case 'Escape':
            this.closeImagePreview();
            break;
          case 'ArrowLeft':
            this.showPreviousImage();
            break;
          case 'ArrowRight':
            this.showNextImage();
            break;
        }
      }
    });
  }

  private openImagePreview(imagePath: string): void {
    console.log('打开图片预览:', imagePath);

    // 获取当前显示的图片列表
    this.previewImages = this.filteredImages.length > 0 ? this.filteredImages : (this.currentResults?.extracted_images || []);

    // 找到当前图片的索引
    this.currentPreviewIndex = this.previewImages.findIndex(img => img.file_path === imagePath);
    if (this.currentPreviewIndex === -1) {
      console.warn('未找到图片索引，使用默认索引 0');
      this.currentPreviewIndex = 0;
    }

    console.log(`预览图片索引: ${this.currentPreviewIndex}/${this.previewImages.length}`);

    // 显示模态框
    const modal = document.getElementById('imagePreviewModal') as HTMLElement;
    if (modal) {
      modal.classList.remove('hidden');
      this.updatePreviewImage();
      console.log('图片预览模态框已显示');
    } else {
      console.error('未找到图片预览模态框元素');
    }
  }

  private closeImagePreview(): void {
    const modal = document.getElementById('imagePreviewModal') as HTMLElement;
    const previewImage = document.getElementById('previewImage') as HTMLImageElement;
    const loadingElement = document.getElementById('previewLoading') as HTMLElement;

    if (modal) {
      modal.classList.add('hidden');
      console.log('图片预览模态框已关闭');
    }

    // 清理图片元素，防止内存泄漏
    if (previewImage) {
      previewImage.src = '';
      previewImage.onload = null;
      previewImage.onerror = null;
    }

    // 隐藏加载状态
    if (loadingElement) {
      loadingElement.classList.add('hidden');
    }

    // 重置预览状态
    this.currentPreviewIndex = 0;
    this.previewImages = [];

    // 确保主要内容区域可见
    const mainApp = document.getElementById('image-finder-app') as HTMLElement;
    if (mainApp) {
      mainApp.style.display = '';
      console.log('主应用区域状态已重置');
    }
  }

  private showPreviousImage(): void {
    if (this.currentPreviewIndex > 0) {
      this.currentPreviewIndex--;
      this.updatePreviewImage();
    }
  }

  private showNextImage(): void {
    if (this.currentPreviewIndex < this.previewImages.length - 1) {
      this.currentPreviewIndex++;
      this.updatePreviewImage();
    }
  }

  private updatePreviewImage(): void {
    if (this.previewImages.length === 0) return;

    const currentImage = this.previewImages[this.currentPreviewIndex];
    const imageElement = document.getElementById('previewImage') as HTMLImageElement;
    const titleElement = document.getElementById('previewTitle') as HTMLElement;
    const counterElement = document.getElementById('previewCounter') as HTMLElement;
    const filenameElement = document.getElementById('previewFilename') as HTMLElement;
    const detailsElement = document.getElementById('previewDetails') as HTMLElement;
    const loadingElement = document.getElementById('previewLoading') as HTMLElement;
    const prevBtn = document.getElementById('prevImage') as HTMLButtonElement;
    const nextBtn = document.getElementById('nextImage') as HTMLButtonElement;

    // 更新按钮状态
    if (prevBtn) prevBtn.disabled = this.currentPreviewIndex === 0;
    if (nextBtn) nextBtn.disabled = this.currentPreviewIndex === this.previewImages.length - 1;

    // 更新计数器
    if (counterElement) {
      counterElement.textContent = `${this.currentPreviewIndex + 1} / ${this.previewImages.length}`;
    }

    // 更新标题
    if (titleElement) {
      titleElement.textContent = `图片预览 - ${currentImage.filename}`;
    }

    // 更新文件信息
    if (filenameElement) {
      filenameElement.textContent = currentImage.filename;
    }

    if (detailsElement) {
      const sizeText = this.formatFileSize(currentImage.file_size);
      detailsElement.innerHTML = `
        <span>类型: ${currentImage.image_type}</span>
        <span>大小: ${sizeText}</span>
        <span>偏移: 0x${currentImage.offset.toString(16).toUpperCase()}</span>
      `;
    }

    // 显示加载状态
    if (loadingElement) loadingElement.classList.remove('hidden');
    if (imageElement) imageElement.style.display = 'none';

    // 加载图片
    if (imageElement) {
      const imageUrl = convertFileSrc(currentImage.file_path);
      imageElement.onload = () => {
        if (loadingElement) loadingElement.classList.add('hidden');
        imageElement.style.display = 'block';
      };
      imageElement.onerror = () => {
        if (loadingElement) loadingElement.classList.add('hidden');
        imageElement.style.display = 'none';
        // 可以在这里显示错误信息
      };
      imageElement.src = imageUrl;
    }
  }

  private switchViewMode(mode: string): void {
    this.currentViewMode = mode;
    const thumbnailGrid = document.getElementById('thumbnailGrid') as HTMLElement;
    const layoutToggleGroup = document.getElementById('layoutToggleGroup') as HTMLElement;

    if (thumbnailGrid) {
      if (mode === 'list') {
        thumbnailGrid.classList.add('list-view');
        thumbnailGrid.classList.remove('columns-3', 'columns-5', 'columns-7');
        if (layoutToggleGroup) layoutToggleGroup.style.display = 'none';
      } else {
        thumbnailGrid.classList.remove('list-view');
        thumbnailGrid.classList.add(`columns-${this.currentColumns}`);
        if (layoutToggleGroup) layoutToggleGroup.style.display = 'flex';
      }
    }

    // 重新渲染当前结果
    if (this.currentResults) {
      this.renderImages(this.filteredImages.length > 0 ? this.filteredImages : this.currentResults.extracted_images);
    }
  }

  private applyFiltersAndSort(): void {
    if (!this.currentResults) return;

    let images = [...this.currentResults.extracted_images];

    // 应用筛选
    if (this.currentFilters.type !== 'all') {
      images = images.filter(img => img.image_type === this.currentFilters.type);
    }

    if (this.currentFilters.size !== 'all') {
      images = images.filter(img => {
        const sizeKB = img.file_size / 1024;
        switch (this.currentFilters.size) {
          case 'small': return sizeKB < 100;
          case 'medium': return sizeKB >= 100 && sizeKB <= 1024;
          case 'large': return sizeKB > 1024;
          default: return true;
        }
      });
    }

    // 应用排序
    images.sort((a, b) => {
      let comparison = 0;
      switch (this.currentSort.by) {
        case 'name':
          comparison = a.filename.localeCompare(b.filename);
          break;
        case 'size':
          comparison = a.file_size - b.file_size;
          break;
        case 'type':
          comparison = a.image_type.localeCompare(b.image_type);
          break;
        case 'offset':
          comparison = a.offset - b.offset;
          break;
      }
      return this.currentSort.direction === 'asc' ? comparison : -comparison;
    });

    this.filteredImages = images;
    this.renderImages(images);
  }

  private renderImages(images: ExtractedImage[]): void {
    const thumbnailGrid = document.getElementById('thumbnailGrid') as HTMLElement;
    if (!thumbnailGrid) return;

    let html = '';

    if (this.currentViewMode === 'list') {
      // 列表视图：添加表头和列表项
      html = `
        <div class="list-header">
          <div class="header-name">名称</div>
          <div class="header-type">类型</div>
          <div class="header-size">大小</div>
          <div class="header-offset">偏移</div>
          <div class="header-actions">操作</div>
        </div>
        ${images.map(image => this.createThumbnailCard(image)).join('')}
      `;
    } else {
      // 网格视图
      html = images.map(image => this.createThumbnailCard(image)).join('');
    }

    thumbnailGrid.innerHTML = html;

    // 应用当前的布局设置
    if (this.currentViewMode === 'list') {
      thumbnailGrid.classList.add('list-view');
      thumbnailGrid.classList.remove('columns-3', 'columns-5', 'columns-7');
    } else {
      thumbnailGrid.classList.remove('list-view');
      thumbnailGrid.classList.remove('columns-3', 'columns-5', 'columns-7');
      thumbnailGrid.classList.add(`columns-${this.currentColumns}`);
    }

    // 设置缩略图点击事件监听器
    this.setupThumbnailClickListeners();
  }

  private setupThumbnailClickListeners(): void {
    // 为所有缩略图添加点击事件监听器
    const thumbnailElements = document.querySelectorAll('.thumbnail-clickable') as NodeListOf<HTMLElement>;

    thumbnailElements.forEach(element => {
      const filePath = element.dataset.filePath;
      if (!filePath) return;

      // 添加点击事件监听器（单击预览）
      element.addEventListener('click', (e) => {
        // 如果点击的是信息按钮，不触发预览
        const target = e.target as HTMLElement;
        if (target.closest('.card-info-btn') || target.closest('.list-info-btn')) {
          return;
        }

        console.log('缩略图被点击，打开预览:', filePath);
        this.openImagePreview(filePath);
      });

      // 添加双击事件监听器（双击也预览，保持兼容性）
      element.addEventListener('dblclick', (e) => {
        e.preventDefault();
        console.log('缩略图被双击，打开预览:', filePath);
        this.openImagePreview(filePath);
      });

      // 添加键盘支持
      element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          console.log('缩略图键盘激活，打开预览:', filePath);
          this.openImagePreview(filePath);
        }
      });

      // 使元素可聚焦，支持键盘导航
      element.setAttribute('tabindex', '0');
      element.style.cursor = 'pointer';
    });

    // 为信息按钮添加事件监听器
    const infoBtns = document.querySelectorAll('[data-action="info"]') as NodeListOf<HTMLElement>;
    infoBtns.forEach(btn => {
      const filePath = btn.dataset.filePath;
      if (!filePath) return;

      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止事件冒泡到父元素
        console.log('信息按钮被点击:', filePath);
        this.showImageInfo(filePath);
      });
    });

    console.log(`已为 ${thumbnailElements.length} 个缩略图设置点击事件监听器`);
  }

  private setupWindowControls(): void {
    const minimizeBtn = document.querySelector('.image-finder-minimize-btn') as HTMLButtonElement;
    const maximizeBtn = document.querySelector('.image-finder-maximize-btn') as HTMLButtonElement;
    const closeBtn = document.querySelector('.image-finder-close-btn') as HTMLButtonElement;

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => this.minimizeWindow());
    }

    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => this.maximizeWindow());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeWindow());
    }
  }

  private async setupTauriEventListeners(): Promise<void> {
    // 监听图像提取进度
    await listen('image_finder_progress', (event) => {
      const progress = event.payload as ImageFinderProgress;
      this.updateProgress(progress);
    });
  }

  private async browseInputFile(): Promise<void> {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{
          name: 'All Files',
          extensions: ['*']
        }]
      });

      if (selected && typeof selected === 'string') {
        const inputElement = document.getElementById('inputFilePath') as HTMLInputElement;
        if (inputElement) {
          inputElement.value = selected;
          this.config.input_file = selected;
        }
      }
    } catch (error) {
      console.error('选择文件失败:', error);
      this.showError('选择文件失败: ' + (error as Error).message);
    }
  }

  private async browseOutputDirectory(): Promise<void> {
    try {
      const selected = await open({
        directory: true,
        multiple: false
      });

      if (selected && typeof selected === 'string') {
        const outputElement = document.getElementById('outputDirectory') as HTMLInputElement;
        if (outputElement) {
          outputElement.value = selected;
          this.config.output_directory = selected;
        }
      }
    } catch (error) {
      console.error('选择输出目录失败:', error);
      this.showError('选择输出目录失败: ' + (error as Error).message);
    }
  }

  private updateConfigFromUI(): void {
    const inputFile = (document.getElementById('inputFilePath') as HTMLInputElement)?.value || '';
    const outputDir = (document.getElementById('outputDirectory') as HTMLInputElement)?.value || '';
    const chunkSize = parseInt((document.getElementById('chunkSize') as HTMLInputElement)?.value || '256');
    const maxPngSize = parseInt((document.getElementById('maxPngSize') as HTMLInputElement)?.value || '50');
    const maxJpgSize = parseInt((document.getElementById('maxJpgSize') as HTMLInputElement)?.value || '20');
    const thumbnailSize = parseInt((document.getElementById('thumbnailSize') as HTMLInputElement)?.value || '150');
    const generateThumbnails = (document.getElementById('generateThumbnails') as HTMLInputElement)?.checked || true;

    this.config = {
      input_file: inputFile,
      output_directory: outputDir,
      chunk_size_mb: chunkSize,
      max_png_size_mb: maxPngSize,
      max_jpg_size_mb: maxJpgSize,
      generate_thumbnails: generateThumbnails,
      thumbnail_size: thumbnailSize
    };
  }

  private async startExtraction(): Promise<void> {
    if (this.isExtracting) {
      return;
    }

    if (!this.config.input_file) {
      this.showError('请选择输入文件');
      return;
    }

    this.isExtracting = true;
    this.stopRequested = false;
    this.updateUI();
    this.clearResults();

    try {
      const result = await invoke('start_image_extraction', { config: this.config }) as ImageFinderResult;
      this.currentResults = result;
      this.displayResults(result);
      if (this.stopRequested) {
        MessageManager.showInfo(`已停止，已提取 ${result.total_extracted} 个图像文件`);
      } else {
        this.showSuccess(`提取完成！成功提取 ${result.total_extracted} 个图像文件`);
      }
    } catch (error) {
      console.error('图像提取失败:', error);
      this.showError('图像提取失败: ' + (error as Error).message);
    } finally {
      this.isExtracting = false;
      this.updateUI();
    }
  }

  private async stopExtraction(): Promise<void> {
    if (!this.isExtracting) return;
    this.stopRequested = true;
    try {
      await invoke('stop_image_extraction');
      MessageManager.showInfo('正在停止提取…');
    } catch (error) {
      console.error('停止提取失败:', error);
      MessageManager.showError('停止提取失败: ' + (error as Error).message);
    }
    // 后端收到取消后会返回已提取的部分结果并触发 completed 进度，
    // isExtracting 由提取流程的 finally 统一复位；这里先禁用停止按钮反馈"停止中"
    const stopBtn = document.getElementById('stopExtraction') as HTMLButtonElement;
    if (stopBtn) stopBtn.disabled = true;
  }

  private updateProgress(progress: ImageFinderProgress): void {
    const progressBar = document.getElementById('progressBar') as HTMLProgressElement;
    const progressText = document.getElementById('progressText') as HTMLElement;
    const statusText = document.getElementById('statusText') as HTMLElement;

    if (progressBar && progress.total_bytes > 0) {
      const percentage = (progress.processed_bytes / progress.total_bytes) * 100;
      progressBar.value = percentage;
    }

    if (progressText) {
      progressText.textContent = `找到: ${progress.found_count} | 提取: ${progress.extracted_count}`;
    }

    if (statusText) {
      statusText.textContent = progress.status;
    }

    // 如果完成，更新UI状态
    if (progress.completed) {
      this.isExtracting = false;
      this.updateUI();
    }
  }

  private displayResults(result: ImageFinderResult): void {
    const resultsContainer = document.getElementById('resultsContainer') as HTMLElement;
    const emptyState = document.getElementById('emptyState') as HTMLElement;
    const statsSection = document.getElementById('statsSection') as HTMLElement;

    if (!resultsContainer || !emptyState) {
      console.error('无法找到结果容器或空状态元素');
      return;
    }

    console.log('显示结果:', result);

    if (result.extracted_images.length === 0) {
      resultsContainer.classList.add('hidden');
      emptyState.classList.remove('hidden');
      if (statsSection) statsSection.classList.add('hidden');
      return;
    }

    // 隐藏空状态，显示结果容器
    emptyState.classList.add('hidden');
    resultsContainer.classList.remove('hidden');
    if (statsSection) statsSection.classList.remove('hidden');

    // 应用筛选和排序，然后渲染图像
    this.applyFiltersAndSort();

    // 更新统计信息
    const statsElement = document.getElementById('extractionStats') as HTMLElement;
    if (statsElement) {
      statsElement.innerHTML = `
        <div class="stat-item">
          <span class="stat-label">总计找到:</span>
          <span class="stat-value">${result.total_found}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">成功提取:</span>
          <span class="stat-value">${result.total_extracted}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">耗时:</span>
          <span class="stat-value">${(result.duration_ms / 1000).toFixed(2)}s</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">输出目录:</span>
          <span class="stat-value">${result.output_directory}</span>
        </div>
      `;
    }

    console.log('结果显示完成');
  }

  private createThumbnailCard(image: ExtractedImage): string {
    console.log('创建缩略图卡片:', image.filename, '文件大小:', image.file_size, '字节');
    const sizeText = this.formatFileSize(image.file_size);
    const typeIcon = icon(image.image_type === 'PNG' ? 'image' : 'camera', 30);

    // 使用 Tauri 的 convertFileSrc 来生成正确的文件 URL
    const imageUrl = convertFileSrc(image.file_path);

    if (this.currentViewMode === 'list') {
      // 列表视图模式 - 类似 Windows 详细信息视图
      return `
        <div class="list-item thumbnail-clickable" data-file-path="${image.file_path}">
          <div class="list-item-name" title="${image.filename}">${image.filename}</div>
          <div class="list-item-type">${image.image_type}</div>
          <div class="list-item-size">${sizeText}</div>
          <div class="list-item-offset">0x${image.offset.toString(16).toUpperCase()}</div>
          <div class="list-item-actions">
            <button class="list-info-btn" data-action="info" data-file-path="${image.file_path}"
                    title="查看详情">
              ${icon('info')}
            </button>
          </div>
        </div>
      `;
    } else {
      // 网格视图模式
      return `
        <div class="image-card thumbnail-clickable" data-file-path="${image.file_path}">
          <img src="${imageUrl}" alt="${image.filename}" class="card-image"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="card-fallback" style="display:none;">
            <div class="fallback-icon">${typeIcon}</div>
          </div>

          <div class="card-overlay">
            <div class="card-type-badge">${image.image_type}</div>
            <div class="card-actions">
              <div class="card-action-btn card-preview-btn" data-action="preview" data-file-path="${image.file_path}"
                   title="预览图片">
                ${icon('eye')}
              </div>
              <div class="card-action-btn card-info-btn" data-action="info" data-file-path="${image.file_path}"
                   title="文件名: ${image.filename}&#10;大小: ${sizeText}&#10;偏移: 0x${image.offset.toString(16).toUpperCase()}">
                ${icon('info')}
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private clearResults(): void {
    const resultsContainer = document.getElementById('resultsContainer') as HTMLElement;
    const emptyState = document.getElementById('emptyState') as HTMLElement;
    const thumbnailGrid = document.getElementById('thumbnailGrid') as HTMLElement;

    if (resultsContainer) resultsContainer.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    if (thumbnailGrid) thumbnailGrid.innerHTML = '';

    this.currentResults = null;
  }

  private updateUI(): void {
    const startBtn = document.getElementById('startExtraction') as HTMLButtonElement;
    const stopBtn = document.getElementById('stopExtraction') as HTMLButtonElement;
    const progressSection = document.getElementById('progressSection') as HTMLElement;

    if (startBtn) {
      startBtn.disabled = this.isExtracting;
      startBtn.innerHTML = this.isExtracting
        ? `<span class="btn-icon">${icon('refresh')}</span> 提取中...`
        : `<span class="btn-icon">${icon('play')}</span> 开始提取`;
    }

    if (stopBtn) {
      stopBtn.disabled = !this.isExtracting;
    }

    if (progressSection) {
      if (this.isExtracting) {
        progressSection.classList.remove('hidden');
      } else {
        progressSection.classList.add('hidden');
      }
    }
  }

  private async loadInitialImagePath(): Promise<void> {
    try {
      const settings = await loadAppSettings();
      if (settings && settings.current_image_path) {
        const inputElement = document.getElementById('inputFilePath') as HTMLInputElement;
        if (inputElement) {
          inputElement.value = settings.current_image_path;
          this.config.input_file = settings.current_image_path;
        }
      }
    } catch (error) {
      console.error('加载初始镜像路径失败:', error);
    }
  }

  private async loadOutputPath(): Promise<void> {
    try {
      const settings = await loadAppSettings();
      if (settings && settings.output_path) {
        const outputElement = document.getElementById('outputDirectory') as HTMLInputElement;
        if (outputElement) {
          // 在输出路径下创建 extracted_images 子目录
          const extractedImagesPath = `${settings.output_path}/extracted_images`;
          outputElement.value = extractedImagesPath;
          this.config.output_directory = extractedImagesPath;
        }
      }
    } catch (error) {
      console.error('加载输出路径失败:', error);
    }
  }

  private async loadTheme(): Promise<void> {
    try {
      const settings = await loadAppSettings() as any;
      if (settings && settings.theme && settings.theme.current_theme) {
        document.documentElement.setAttribute('data-theme', settings.theme.current_theme);
      }
    } catch (error) {
      console.error('加载主题失败:', error);
    }
  }

  private showError(message: string): void {
    console.error(message);
    MessageManager.showError(message);
  }

  private showSuccess(message: string): void {
    console.log(message);
    MessageManager.showSuccess(message);
  }

  private async minimizeWindow(): Promise<void> {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error('最小化窗口失败:', error);
    }
  }

  private async maximizeWindow(): Promise<void> {
    try {
      const appWindow = getCurrentWindow();
      const isMaximized = await appWindow.isMaximized();
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (error) {
      console.error('最大化窗口失败:', error);
    }
  }

  private async closeWindow(): Promise<void> {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('关闭窗口失败:', error);
      // 如果 Tauri API 失败，回退到传统方法
      window.close();
    }
  }

  // 公共方法供HTML调用
  public openImage(filePath: string): void {
    // TODO: 实现打开图像
    console.log('打开图像:', filePath);
  }

  public showImageInfo(filePath: string): void {
    // TODO: 实现显示图像信息
    console.log('显示图像信息:', filePath);
  }
}

// 全局实例
declare global {
  interface Window {
    imageFinderWindow: ImageFinderWindow;
  }
}

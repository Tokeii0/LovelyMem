import { AppState } from '../../core/types';
import { loadAppSettings } from '../../core/settingsHelper';
import { IconParkHelper } from '../../utils/iconparkHelper';

function svgIcon(name: string, size: number = 16): string {
  return IconParkHelper.getSvgString(name, { size, strokeWidth: 3 });
}

export class FilesRenderer {
    constructor(private state: AppState) { }

    public updateState(state: AppState) {
        this.state = state;
    }

    public renderList(): string {
        if (!this.state.files || this.state.files.length === 0) {
            return `
        <div class="empty-files">
          <div class="empty-icon">${svgIcon('folder-open', 40)}</div>
          <div class="empty-text">暂无文件</div>
          <div class="empty-hint">点击"添加文件"开始</div>
        </div>
      `;
        }

        return this.state.files.map((file, index) => `
      <div class="file-item" data-file-index="${index}" data-file-name="${file.name}" data-file-type="${file.type}">
        <div class="file-icon">
          ${file.type === 'folder' ? svgIcon('folder', 20) : this.getFileIcon(file.name)}
        </div>
        <div class="file-info">
          <div class="file-name" title="${file.name}">${file.name}</div>
          <div class="file-details">
            <span class="file-size">${file.size}</span>
          </div>
        </div>
        <div class="file-actions">
          <button class="file-action-icon" data-action="open" title="打开文件">
            <span>${svgIcon('preview-open', 14)}</span>
          </button>
          <button class="file-action-icon" data-action="menu" title="更多操作">
            <span>${svgIcon('list', 14)}</span>
          </button>
        </div>
      </div>
    `).join('');
    }

    private getFileIcon(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const iconMap: { [key: string]: string } = {
            'dump': 'cpu',
            'dmp': 'cpu',
            'mem': 'cpu',
            'raw': 'cpu',
            'dd': 'save',
            'img': 'pic',
            'iso': 'pic',
            'vmem': 'tool',
            'vmsn': 'pic',
            'txt': 'file-text',
            'log': 'list',
            'csv': 'chart-line',
            'json': 'code',
            'xml': 'code',
            'zip': 'box',
            'rar': 'box',
            '7z': 'box',
            'exe': 'setting',
            'dll': 'link',
            'sys': 'tool'
        };

        return svgIcon(iconMap[ext || ''] || 'file-text', 20);
    }

    private formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    public updateFilesPreview(
        files: Array<{ name: string; size: number; is_dir: boolean; modified: string; extension: string }> = [],
        errorMessage?: string
    ): void {
        const previewContent = document.getElementById('files-preview-content');
        if (!previewContent) return;

        if (errorMessage) {
            previewContent.innerHTML = `
        <div class="empty-files">
          <div class="empty-icon">${svgIcon('close-one', 40)}</div>
          <div class="empty-text">加载失败</div>
          <div class="empty-hint">${errorMessage}</div>
        </div>
      `;
            return;
        }

        if (files.length === 0) {
            previewContent.innerHTML = `
        <div class="empty-files">
          <div class="empty-icon">${svgIcon('folder-open', 40)}</div>
          <div class="empty-text">文件夹为空</div>
          <div class="empty-hint">还没有生成文件</div>
        </div>
      `;
            return;
        }

        previewContent.innerHTML = `
      <div class="files-list-preview-scrollable">
        ${files.map(file => `
          <div class="file-item-preview ${file.is_dir ? 'directory' : 'file'}" data-filename="${file.name}">
            <div class="file-icon-preview">${this.getFileIconForPreview(file)}</div>
            <div class="file-info-preview">
              <div class="file-name-preview">${file.name}</div>
              <div class="file-size-preview">${file.is_dir ? '文件夹' : this.formatFileSize(file.size)}</div>
            </div>
            <div class="file-actions-preview">
              ${!file.is_dir && file.extension === 'csv' ? `
                <button class="file-action-preview" data-action="view-csv" data-filename="${file.name}" title="查看CSV">
                  ${svgIcon('chart-line', 14)}
                </button>
              ` : ''}
              ${!file.is_dir && this.isTextFile(file.extension) ? `
                <button class="file-action-preview" data-action="view-text" data-filename="${file.name}" title="查看文本">
                  ${svgIcon('file-text', 14)}
                </button>
              ` : ''}
              <button class="file-action-preview" data-action="open" data-filename="${file.name}" title="打开">
                ${svgIcon('folder-open', 14)}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

        this.bindFilesPreviewEvents();
    }

    private getFileIconForPreview(file: { name: string; size: number; is_dir: boolean; modified: string; extension: string }): string {
        if (file.is_dir) return svgIcon('folder', 18);

        const map: Record<string, string> = {
            'csv': 'chart-line', 'txt': 'file-text', 'log': 'list',
            'json': 'code', 'xml': 'code', 'html': 'code',
            'pdf': 'file-text', 'zip': 'box', 'rar': 'box', '7z': 'box',
            'exe': 'setting', 'dll': 'link',
        };
        return svgIcon(map[file.extension.toLowerCase()] || 'file-text', 18);
    }

    private isTextFile(extension: string): boolean {
        const textExtensions = [
            'txt', 'log', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ts',
            'py', 'cpp', 'c', 'h', 'hpp', 'java', 'php', 'rb', 'go', 'rs',
            'ini', 'conf', 'cfg', 'yaml', 'yml', 'toml', 'sql', 'sh', 'bat',
            'ps1', 'vbs', 'asm', 's', 'reg', 'properties', 'gitignore'
        ];
        return textExtensions.includes(extension.toLowerCase());
    }

    private bindFilesPreviewEvents(): void {
        const viewCsvBtns = document.querySelectorAll('[data-action="view-csv"]');
        viewCsvBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filename = (e.target as HTMLElement).getAttribute('data-filename');
                if (filename) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        const settings = await loadAppSettings();
                        const outputPath = settings.output_path || 'output';
                        await invoke('open_csv_viewer', {
                            csvFilePath: `${outputPath}\\${filename}`,
                            windowTitle: `MemProcFS - ${filename}`
                        });
                    } catch (error) {
                        console.error('打开CSV文件失败:', error);
                    }
                }
            });
        });

        const viewTextBtns = document.querySelectorAll('[data-action="view-text"]');
        viewTextBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filename = (e.target as HTMLElement).getAttribute('data-filename');
                if (filename) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        const settings = await loadAppSettings();
                        const outputPath = settings.output_path || 'output';
                        await invoke('open_text_viewer', {
                            textFilePath: `${outputPath}\\${filename}`,
                            windowTitle: `LovelyText - ${filename}`
                        });
                    } catch (error) {
                        console.error('打开文本文件失败:', error);
                    }
                }
            });
        });

        const openBtns = document.querySelectorAll('[data-action="open"]');
        openBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const filename = (e.target as HTMLElement).getAttribute('data-filename');
                if (filename) {
                    try {
                        const { invoke } = await import('@tauri-apps/api/core');
                        const settings = await loadAppSettings();
                        const outputPath = settings.output_path || 'output';
                        await invoke('open_path', { path: `${outputPath}\\${filename}` });
                    } catch (error) {
                        console.error('打开文件失败:', error);
                    }
                }
            });
        });
    }
}

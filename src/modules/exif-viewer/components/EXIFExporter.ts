/**
 * EXIF导出器组件
 * 负责EXIF数据的导出功能（JSON、CSV、TXT格式）
 */

import type { EXIFData, EXIFValue } from '../utils/EXIFUtils';
import { translate } from '../../../i18n';

const { save } = (window as any).__TAURI__.dialog;
const { invoke } = (window as any).__TAURI__.core;

/** 支持的导出格式 */
type ExportFormat = 'json' | 'csv' | 'txt';

/** 单条 EXIF 数据项：[标签名, 值] */
type EXIFEntry = [string, EXIFValue];

export class EXIFExporter {
    private supportedFormats: ExportFormat[];

    constructor() {
        this.supportedFormats = ['json', 'csv', 'txt'];
    }

    /**
     * 导出数据
     */
    async exportData(data: EXIFData, filename: string): Promise<void> {
        try {
            // 显示导出格式选择对话框
            const format = await this.showFormatDialog();
            if (!format) return;

            // 选择保存位置
            const savePath = await this.selectSavePath(filename, format);
            if (!savePath) return;

            // 根据格式导出数据
            await this.exportToFormat(data, savePath, format, filename);

            this.showSuccess(`数据已导出到: ${savePath}`);

        } catch (error) {
            console.error('导出失败:', error);
            throw error;
        }
    }

    /**
     * 显示格式选择对话框
     */
    async showFormatDialog(): Promise<ExportFormat | null> {
        return new Promise<ExportFormat | null>((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'exif-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>选择导出格式</h3>
                        <button class="modal-close">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="format-options">
                            <label class="format-option">
                                <input type="radio" name="export-format" value="json" checked>
                                <div class="format-info">
                                    <div class="format-name">JSON</div>
                                    <div class="format-desc">结构化数据格式，保留完整信息</div>
                                </div>
                            </label>
                            <label class="format-option">
                                <input type="radio" name="export-format" value="csv">
                                <div class="format-info">
                                    <div class="format-name">CSV</div>
                                    <div class="format-desc">表格格式，便于Excel打开</div>
                                </div>
                            </label>
                            <label class="format-option">
                                <input type="radio" name="export-format" value="txt">
                                <div class="format-info">
                                    <div class="format-name">TXT</div>
                                    <div class="format-desc">纯文本格式，便于阅读</div>
                                </div>
                            </label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-primary export-confirm-btn">确定导出</button>
                        <button class="btn btn-secondary modal-close">取消</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // 绑定事件
            modal.querySelectorAll<HTMLButtonElement>('.modal-close').forEach(btn => {
                btn.addEventListener('click', () => {
                    modal.remove();
                    resolve(null);
                });
            });

            const confirmBtn = modal.querySelector<HTMLButtonElement>('.export-confirm-btn');
            confirmBtn?.addEventListener('click', () => {
                const checked = modal.querySelector<HTMLInputElement>('input[name="export-format"]:checked');
                const selectedFormat = (checked?.value ?? 'json') as ExportFormat;
                modal.remove();
                resolve(selectedFormat);
            });

            // 点击背景关闭
            modal.addEventListener('click', (e: MouseEvent) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            });
        });
    }

    /**
     * 选择保存路径
     */
    async selectSavePath(filename: string, format: ExportFormat): Promise<string | null> {
        const baseName = filename.replace(/\.[^/.]+$/, '');
        const defaultFilename = `${baseName}_exif.${format}`;

        const filters: Record<ExportFormat, Array<{ name: string; extensions: string[] }>> = {
            json: [{ name: translate('JSON文件'), extensions: ['json'] }],
            csv: [{ name: translate('CSV文件'), extensions: ['csv'] }],
            txt: [{ name: translate('文本文件'), extensions: ['txt'] }]
        };

        try {
            const savePath = await save({
                title: translate('保存EXIF数据'),
                defaultPath: defaultFilename,
                filters: [
                    ...filters[format],
                    { name: translate('所有文件'), extensions: ['*'] }
                ]
            });

            return savePath as string | null;
        } catch (error) {
            console.error('选择保存路径失败:', error);
            throw new Error('选择保存路径失败');
        }
    }

    /**
     * 根据格式导出数据
     */
    async exportToFormat(data: EXIFData, savePath: string, format: ExportFormat, originalFilename: string): Promise<void> {
        let content: string;

        switch (format) {
            case 'json':
                content = this.exportToJSON(data, originalFilename);
                break;
            case 'csv':
                content = this.exportToCSV(data, originalFilename);
                break;
            case 'txt':
                content = this.exportToTXT(data, originalFilename);
                break;
            default:
                throw new Error('不支持的导出格式');
        }

        // 调用后端保存文件
        try {
            await invoke('save_text_file', {
                path: savePath,
                content: content
            });
        } catch (error) {
            console.error('保存文件失败:', error);
            throw new Error('保存文件失败: ' + (error as Error).message);
        }
    }

    /**
     * 导出为JSON格式
     */
    exportToJSON(data: EXIFData, filename: string): string {
        const exportData = {
            metadata: {
                filename: filename,
                exportTime: new Date().toISOString(),
                totalTags: Object.keys(data).length,
                exporter: 'Lovelymem V2 EXIF Viewer'
            },
            exifData: data
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 导出为CSV格式
     */
    exportToCSV(data: EXIFData, _filename: string): string {
        const rows: string[][] = [];

        // CSV头部
        rows.push(['标签名称', '标签代码', '值', '分类']);

        // 数据行
        Object.entries(data).forEach(([tag, value]) => {
            const displayName = this.getDisplayName(tag);
            const category = this.getTagCategory(tag);
            const formattedValue = this.formatValueForCSV(value);

            rows.push([displayName, tag, formattedValue, category]);
        });

        // 转换为CSV字符串
        return rows.map(row =>
            row.map(cell => this.escapeCSVCell(String(cell))).join(',')
        ).join('\n');
    }

    /**
     * 导出为TXT格式
     */
    exportToTXT(data: EXIFData, filename: string): string {
        const lines: string[] = [];

        // 文件头部信息
        lines.push('EXIF元数据信息');
        lines.push('='.repeat(50));
        lines.push(`文件名: ${filename}`);
        lines.push(`导出时间: ${new Date().toLocaleString()}`);
        lines.push(`标签总数: ${Object.keys(data).length}`);
        lines.push('');

        // 按分类组织数据
        const categorizedData = this.categorizeDataForExport(data);

        Object.entries(categorizedData).forEach(([category, items]) => {
            lines.push(`[${category}]`);
            lines.push('-'.repeat(30));

            items.forEach(([tag, value]) => {
                const displayName = this.getDisplayName(tag);
                const formattedValue = this.formatValueForTXT(value);
                lines.push(`${displayName}: ${formattedValue}`);
                lines.push(`  (${tag})`);
                lines.push('');
            });

            lines.push('');
        });

        return lines.join('\n');
    }

    /**
     * 按分类组织数据用于导出
     */
    categorizeDataForExport(data: EXIFData): Record<string, EXIFEntry[]> {
        const categories: Record<string, EXIFEntry[]> = {
            '基本信息': [],
            '相机信息': [],
            '拍摄参数': [],
            'GPS位置': [],
            '时间信息': [],
            '技术参数': [],
            '其他信息': []
        };

        Object.entries(data).forEach(([tag, value]) => {
            const category = this.getCategoryDisplayName(this.getTagCategory(tag));
            if (categories[category]) {
                categories[category].push([tag, value]);
            } else {
                categories['其他信息'].push([tag, value]);
            }
        });

        // 移除空分类
        Object.keys(categories).forEach(key => {
            if (categories[key].length === 0) {
                delete categories[key];
            }
        });

        return categories;
    }

    /**
     * 获取标签显示名称
     */
    getDisplayName(tag: string): string {
        // 这里可以添加更多的标签名称映射
        const displayNames: Record<string, string> = {
            'Make': '制造商',
            'Model': '型号',
            'DateTime': '拍摄时间',
            'ExposureTime': '曝光时间',
            'FNumber': '光圈值',
            'ISO': 'ISO感光度',
            'FocalLength': '焦距',
            'Flash': '闪光灯',
            'WhiteBalance': '白平衡',
            'GPSLatitude': 'GPS纬度',
            'GPSLongitude': 'GPS经度',
            'GPSAltitude': 'GPS海拔'
        };

        return displayNames[tag] || tag;
    }

    /**
     * 获取标签分类
     */
    getTagCategory(tag: string): string {
        // 简化的分类逻辑
        if (tag.includes('GPS')) return 'gps';
        if (tag.includes('Date') || tag.includes('Time')) return 'datetime';
        if (['Make', 'Model', 'Software'].includes(tag)) return 'camera';
        if (['ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'Flash', 'WhiteBalance'].includes(tag)) return 'shooting';
        if (['ImageWidth', 'ImageHeight', 'Orientation', 'XResolution', 'YResolution'].includes(tag)) return 'basic';
        if (['ColorSpace', 'ExifVersion', 'ComponentsConfiguration'].includes(tag)) return 'technical';
        return 'other';
    }

    /**
     * 获取分类显示名称
     */
    getCategoryDisplayName(category: string): string {
        const names: Record<string, string> = {
            'basic': '基本信息',
            'camera': '相机信息',
            'shooting': '拍摄参数',
            'gps': 'GPS位置',
            'datetime': '时间信息',
            'technical': '技术参数',
            'other': '其他信息'
        };
        return names[category] || '其他信息';
    }

    /**
     * 格式化CSV单元格值
     */
    formatValueForCSV(value: EXIFValue): string {
        if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value);
        }
        return String(value).replace(/\n/g, ' ').replace(/\r/g, '');
    }

    /**
     * 格式化TXT值
     */
    formatValueForTXT(value: EXIFValue): string {
        if (typeof value === 'object' && value !== null) {
            return JSON.stringify(value, null, 2);
        }
        return String(value);
    }

    /**
     * 转义CSV单元格
     */
    escapeCSVCell(cell: string): string {
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
            return '"' + cell.replace(/"/g, '""') + '"';
        }
        return cell;
    }

    /**
     * 显示成功消息
     */
    showSuccess(message: string): void {
        const toast = document.createElement('div');
        toast.className = 'exif-toast success';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

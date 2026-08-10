/**
 * 对话框管理器
 * 管理各种对话框的显示和隐藏
 */

import { EventEmitter, type EventMap } from '../utils/EventEmitter';
import type { ThemeEditorCore } from '../core/ThemeEditorCore';
import type { ThemeConfig } from '../utils/ThemeValidator';

/** 确认对话框回调 */
interface ConfirmCallbacks {
    onConfirm?: () => void;
    onCancel?: () => void;
}

export class DialogManager extends EventEmitter<EventMap> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private activeDialogs: Set<string> = new Set();
    private confirmCallbacks: ConfirmCallbacks | null = null;

    constructor(container: HTMLElement, core: ThemeEditorCore) {
        super();

        this.container = container;
        this.core = core;

        this.init();
    }

    init(): void {
        this.render();
        this.bindEvents();
    }

    render(): void {
        this.container.innerHTML = `
            <!-- 保存对话框 -->
            <div class="te-dialog te-save-dialog" id="saveDialog">
                <div class="te-dialog-overlay"></div>
                <div class="te-dialog-content">
                    <div class="te-dialog-header">
                        <h3 class="te-dialog-title">保存主题</h3>
                        <button class="te-dialog-close" data-dialog="save">×</button>
                    </div>
                    <div class="te-dialog-body">
                        <div class="te-form-group">
                            <label for="saveThemeName">主题名称</label>
                            <input type="text" id="saveThemeName" class="te-form-input" placeholder="输入主题名称">
                        </div>
                        <div class="te-form-group">
                            <label for="saveThemeDescription">主题描述</label>
                            <textarea id="saveThemeDescription" class="te-form-textarea" placeholder="输入主题描述（可选）"></textarea>
                        </div>
                    </div>
                    <div class="te-dialog-footer">
                        <button class="te-btn secondary" data-dialog="save" data-action="cancel">取消</button>
                        <button class="te-btn primary" data-dialog="save" data-action="confirm">保存</button>
                    </div>
                </div>
            </div>

            <!-- 导出对话框 -->
            <div class="te-dialog te-export-dialog" id="exportDialog">
                <div class="te-dialog-overlay"></div>
                <div class="te-dialog-content">
                    <div class="te-dialog-header">
                        <h3 class="te-dialog-title">导出主题</h3>
                        <button class="te-dialog-close" data-dialog="export">×</button>
                    </div>
                    <div class="te-dialog-body">
                        <div class="te-form-group">
                            <label>主题配置数据</label>
                            <textarea id="exportThemeData" class="te-form-textarea large" readonly></textarea>
                        </div>
                    </div>
                    <div class="te-dialog-footer">
                        <button class="te-btn secondary" data-dialog="export" data-action="cancel">关闭</button>
                        <button class="te-btn primary" id="copyExportData">复制到剪贴板</button>
                        <button class="te-btn success" id="downloadTheme">下载文件</button>
                    </div>
                </div>
            </div>

            <!-- 导入对话框 -->
            <div class="te-dialog te-import-dialog" id="importDialog">
                <div class="te-dialog-overlay"></div>
                <div class="te-dialog-content">
                    <div class="te-dialog-header">
                        <h3 class="te-dialog-title">导入主题</h3>
                        <button class="te-dialog-close" data-dialog="import">×</button>
                    </div>
                    <div class="te-dialog-body">
                        <div class="te-import-methods">
                            <div class="te-import-method">
                                <h4>从文件导入</h4>
                                <input type="file" id="importThemeFile" accept=".json" class="te-file-input">
                                <button class="te-btn secondary" id="selectFileBtn">选择文件</button>
                            </div>
                            <div class="te-import-method">
                                <h4>从文本导入</h4>
                                <textarea id="importThemeData" class="te-form-textarea large" placeholder="粘贴主题配置JSON数据"></textarea>
                            </div>
                        </div>
                    </div>
                    <div class="te-dialog-footer">
                        <button class="te-btn secondary" data-dialog="import" data-action="cancel">取消</button>
                        <button class="te-btn primary" data-dialog="import" data-action="confirm">导入</button>
                    </div>
                </div>
            </div>

            <!-- 确认对话框 -->
            <div class="te-dialog te-confirm-dialog" id="confirmDialog">
                <div class="te-dialog-overlay"></div>
                <div class="te-dialog-content">
                    <div class="te-dialog-header">
                        <h3 class="te-dialog-title" id="confirmTitle">确认操作</h3>
                        <button class="te-dialog-close" data-dialog="confirm">×</button>
                    </div>
                    <div class="te-dialog-body">
                        <p id="confirmMessage">确定要执行此操作吗？</p>
                    </div>
                    <div class="te-dialog-footer">
                        <button class="te-btn secondary" data-dialog="confirm" data-action="cancel">取消</button>
                        <button class="te-btn danger" data-dialog="confirm" data-action="confirm">确认</button>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents(): void {
        // 对话框关闭事件
        this.container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('te-dialog-overlay') ||
                target.classList.contains('te-dialog-close') ||
                (target.dataset.action === 'cancel')) {
                const dialog = target.closest<HTMLElement>('.te-dialog');
                if (dialog) {
                    this.hideDialog(dialog.id);
                }
            }

            // 确认按钮事件
            if (target.dataset.action === 'confirm') {
                const dialog = target.closest<HTMLElement>('.te-dialog');
                if (dialog) this.handleDialogConfirm(dialog.id);
            }

            // 特殊按钮事件
            if (target.id === 'copyExportData') {
                this.copyExportData();
            }

            if (target.id === 'downloadTheme') {
                this.downloadTheme();
            }

            if (target.id === 'selectFileBtn') {
                document.getElementById('importThemeFile')?.click();
            }
        });

        // 文件选择事件
        const fileInput = this.container.querySelector<HTMLInputElement>('#importThemeFile');
        fileInput?.addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            this.handleFileImport(file);
        });

        // ESC键关闭对话框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAll();
            }
        });
    }

    showSaveDialog(): void {
        const dialog = this.container.querySelector<HTMLElement>('#saveDialog');
        const nameInput = dialog?.querySelector<HTMLInputElement>('#saveThemeName');
        const descInput = dialog?.querySelector<HTMLTextAreaElement>('#saveThemeDescription');

        // 清空输入
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';

        this.showDialog('saveDialog');
        nameInput?.focus();
    }

    showExportDialog(themeData: ThemeConfig): void {
        const dialog = this.container.querySelector<HTMLElement>('#exportDialog');
        const textarea = dialog?.querySelector<HTMLTextAreaElement>('#exportThemeData');

        if (textarea) textarea.value = JSON.stringify(themeData, null, 2);
        this.showDialog('exportDialog');
    }

    showImportDialog(): void {
        const dialog = this.container.querySelector<HTMLElement>('#importDialog');

        // 清空输入
        const dataInput = dialog?.querySelector<HTMLTextAreaElement>('#importThemeData');
        const fileInput = dialog?.querySelector<HTMLInputElement>('#importThemeFile');
        if (dataInput) dataInput.value = '';
        if (fileInput) fileInput.value = '';

        this.showDialog('importDialog');
    }

    showConfirmDialog(title: string, message: string, onConfirm?: () => void, onCancel?: () => void): void {
        const dialog = this.container.querySelector<HTMLElement>('#confirmDialog');

        const titleEl = dialog?.querySelector<HTMLElement>('#confirmTitle');
        const messageEl = dialog?.querySelector<HTMLElement>('#confirmMessage');
        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;

        // 存储回调函数
        this.confirmCallbacks = { onConfirm, onCancel };

        this.showDialog('confirmDialog');
    }

    showDialog(dialogId: string): void {
        const dialog = this.container.querySelector<HTMLElement>(`#${dialogId}`);
        if (dialog) {
            dialog.classList.add('visible');
            this.activeDialogs.add(dialogId);
            document.body.classList.add('dialog-open');
        }
    }

    hideDialog(dialogId: string): void {
        const dialog = this.container.querySelector<HTMLElement>(`#${dialogId}`);
        if (dialog) {
            dialog.classList.remove('visible');
            this.activeDialogs.delete(dialogId);

            if (this.activeDialogs.size === 0) {
                document.body.classList.remove('dialog-open');
            }
        }
    }

    closeAll(): void {
        this.activeDialogs.forEach(dialogId => {
            this.hideDialog(dialogId);
        });
    }

    handleDialogConfirm(dialogId: string): void {
        switch (dialogId) {
            case 'saveDialog':
                void this.handleSaveConfirm();
                break;
            case 'importDialog':
                this.handleImportConfirm();
                break;
            case 'confirmDialog':
                this.handleConfirmDialogConfirm();
                break;
        }
    }

    async handleSaveConfirm(): Promise<void> {
        const nameInput = this.container.querySelector<HTMLInputElement>('#saveThemeName');

        const name = nameInput?.value.trim();
        if (!name) {
            alert('请输入主题名称');
            return;
        }

        try {
            await this.core.saveTheme(name);
            this.hideDialog('saveDialog');
        } catch (error) {
            alert('保存失败: ' + (error as Error).message);
        }
    }

    handleImportConfirm(): void {
        const textarea = this.container.querySelector<HTMLTextAreaElement>('#importThemeData');
        const data = textarea?.value.trim();

        if (!data) {
            alert('请输入主题配置数据');
            return;
        }

        try {
            const themeData = JSON.parse(data) as ThemeConfig;
            this.core.importTheme(themeData);
            this.hideDialog('importDialog');
        } catch (error) {
            alert('导入失败: ' + (error as Error).message);
        }
    }

    handleConfirmDialogConfirm(): void {
        this.confirmCallbacks?.onConfirm?.();
        this.hideDialog('confirmDialog');
    }

    handleFileImport(file: File | undefined): void {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const textarea = this.container.querySelector<HTMLTextAreaElement>('#importThemeData');
            if (textarea) textarea.value = e.target?.result as string;
        };
        reader.readAsText(file);
    }

    copyExportData(): void {
        const textarea = this.container.querySelector<HTMLTextAreaElement>('#exportThemeData');
        if (!textarea) return;
        textarea.select();
        document.execCommand('copy');

        // 显示复制成功提示
        const btn = this.container.querySelector<HTMLButtonElement>('#copyExportData');
        if (!btn) return;
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }

    downloadTheme(): void {
        const textarea = this.container.querySelector<HTMLTextAreaElement>('#exportThemeData');
        const data = textarea?.value ?? '';

        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'custom-theme.json';
        a.click();

        URL.revokeObjectURL(url);
    }

    destroy(): void {
        this.removeAllListeners();
        this.closeAll();
        this.container.innerHTML = '';
    }
}

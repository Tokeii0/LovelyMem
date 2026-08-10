/**
 * 模板编辑器
 */

import { EventEmitter, type EventMap } from '../../utils/EventEmitter';
import type { ThemeEditorCore } from '../../core/ThemeEditorCore';

export interface EditorEvents extends EventMap {
    variableChanged: { key: string; value: string };
    presetSelected: string;
}

export class TemplateEditor extends EventEmitter<EditorEvents> {
    private container: HTMLElement;
    private core: ThemeEditorCore;
    private isVisible = false;

    constructor(container: HTMLElement, core: ThemeEditorCore) {
        super();
        this.container = container;
        this.core = core;
    }

    show(): void {
        this.isVisible = true;
        if (this.container) {
            this.container.innerHTML = '<div class="te-template-editor"><p>模板编辑器 - 开发中...</p></div>';
        }
    }
    hide(): void { this.isVisible = false; }
    refresh(): void {}
    update(): void {}
    destroy(): void { this.removeAllListeners(); }
}

import { AppState } from '../../core/types';
import { invoke } from '@tauri-apps/api/core';
import { MessageManager } from '../../utils/message';
import { showPrompt } from '../../core/confirmDialog';
import { IconParkHelper } from '../../utils/iconparkHelper';

export type WarningSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface WarningItem {
    id: string;
    title: string;
    severity: WarningSeverity;
    summary?: string;
    details?: string;
    evidence?: string[];
    source?: string;
    createdAt: number;
    tags?: string[];
    isExample?: boolean;
    /** 命中所针对的目标文件名（用于"在 CSV 中筛选查看"构造路径） */
    file?: string;
    /** 命中后跳转 CSV 查看器时预填的搜索关键词 */
    filterQuery?: string;
}

type WarningRuleSeverity = WarningSeverity | string;

type WarningRuleKind =
    | { type: 'FileExists' }
    | { type: 'CsvHasColumns'; columns: string[] }
    | { type: 'CsvAnyMatch'; matches?: Array<{ column: string; regex: string }>; column?: string; regex?: string }
    | { type: 'CsvRowCountGreater'; threshold: number }
    | { type: 'TextFileContains'; regexes?: string[]; regex?: string };

interface WarningRule {
    id: string;
    enabled: boolean;
    file: string;
    severity: WarningRuleSeverity;
    title: string;
    summary?: string;
    details?: string;
    kind: WarningRuleKind;
}

interface BackendWarningItem {
    id: string;
    title: string;
    severity: string;
    summary?: string;
    details?: string;
    evidence?: string[];
    source?: string;
    created_at: number;
    file?: string;
    filter_query?: string;
}

interface BuiltinRuleView {
    id: string;
    title: string;
    severity: string;
    file: string;
    category: string;
    summary: string;
    explain: string;
    enabled: boolean;
}

interface BuiltinRulesResponse {
    global_enabled: boolean;
    rules: BuiltinRuleView[];
}

interface OutputFileInfo {
    name: string;
    size: number;
    is_dir: boolean;
    modified: string;
    created: string;
    extension: string;
}

export class WarningPage {
    private container: HTMLElement | null = null;
    private severityFilter: WarningSeverity | 'all' = 'all';
    private warnings: WarningItem[] = [];

    constructor(private state: AppState) {
        this.loadStyles();
    }

    public updateState(state: AppState): void {
        this.state = state;
        this.renderWarningsList();
    }

    private loadStyles(): void {
        if (!document.getElementById('warning-page-styles')) {
            const link = document.createElement('link');
            link.id = 'warning-page-styles';
            link.rel = 'stylesheet';
            link.href = '/src/css/warningPage.css';
            document.head.appendChild(link);
        }
    }

    public render(): string {
        const count = this.getWarnings().length;
        return `
      <div class="main-workspace warning-page-container" id="warning-page-root">
        <div class="warning-page-header">
          <div class="warning-page-title">
            <span class="warning-page-icon">${IconParkHelper.getSvgString('warning', { size: 18 })}</span>
            <span>告警中心</span>
          </div>
          <div class="warning-page-toolbar">
            <div class="warning-page-filter">
              <label class="warning-filter-label" for="warning-severity-filter">级别</label>
              <select id="warning-severity-filter" class="warning-filter-select">
                <option value="all">全部 (${count})</option>
                <option value="critical">紧急</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
                <option value="info">信息</option>
              </select>
            </div>
            <div class="warning-page-actions">
              <button class="warning-action-btn secondary" id="warning-edit-rules-btn" type="button">编辑规则</button>
              <button class="warning-action-btn" id="warning-refresh-btn" type="button">刷新</button>
              <button class="warning-action-btn secondary" id="warning-clear-filter-btn" type="button">清除筛选</button>
            </div>
          </div>
        </div>

        <div class="warning-page-content">
          <div class="warning-cards" id="warning-cards"></div>
        </div>
      </div>
    `;
    }

    public async initialize(container: HTMLElement): Promise<void> {
        this.container = container;
        this.bindEvents();
        this.syncFilterUI();
        await this.refreshWarningsFromBackend();
    }

    private bindEvents(): void {
        if (!this.container) return;

        const filter = this.container.querySelector('#warning-severity-filter') as HTMLSelectElement | null;
        if (filter) {
            filter.addEventListener('change', () => {
                const value = (filter.value || 'all') as WarningSeverity | 'all';
                this.severityFilter = value;
                this.renderWarningsList();
            });
        }

        const refreshBtn = this.container.querySelector('#warning-refresh-btn') as HTMLButtonElement | null;
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await this.refreshWarningsFromBackend();
            });
        }

        const editRulesBtn = this.container.querySelector('#warning-edit-rules-btn') as HTMLButtonElement | null;
        if (editRulesBtn) {
            editRulesBtn.addEventListener('click', async () => {
                await this.openRulesEditorModal();
            });
        }

        const clearFilterBtn = this.container.querySelector('#warning-clear-filter-btn') as HTMLButtonElement | null;
        if (clearFilterBtn) {
            clearFilterBtn.addEventListener('click', () => {
                this.severityFilter = 'all';
                this.syncFilterUI();
                this.renderWarningsList();
            });
        }

        // 告警卡片上的"查看详情"按钮（卡片为动态渲染，这里用事件委托）
        const cardsHost = this.container.querySelector('#warning-cards') as HTMLElement | null;
        if (cardsHost) {
            cardsHost.addEventListener('click', (e) => {
                const targetEl = e.target as HTMLElement;
                const btn = targetEl.closest('.warning-detail-btn') as HTMLElement | null;
                if (!btn) return;
                const id = btn.getAttribute('data-id') || '';
                const item = this.warnings.find(w => w.id === id);
                if (item) this.openWarningDetailModal(item);
            });
        }
    }

    private syncFilterUI(): void {
        if (!this.container) return;
        const filter = this.container.querySelector('#warning-severity-filter') as HTMLSelectElement | null;
        if (filter) {
            filter.value = this.severityFilter;
        }
    }

    private getWarnings(): WarningItem[] {
        return this.warnings;
    }

    private normalizeBackendWarnings(items: BackendWarningItem[]): WarningItem[] {
        return (items || []).map((w) => {
            const sev = (w.severity || 'info') as WarningSeverity;
            return {
                id: w.id,
                title: w.title,
                severity: sev,
                summary: w.summary,
                details: w.details,
                evidence: w.evidence || [],
                source: w.source,
                createdAt: w.created_at || Date.now(),
                tags: [],
                isExample: false,
                file: w.file,
                filterQuery: w.filter_query
            };
        });
    }

    private async refreshWarningsFromBackend(): Promise<void> {
        try {
            const items = await invoke('evaluate_warnings_command') as BackendWarningItem[];
            this.warnings = this.normalizeBackendWarnings(items);
            this.renderWarningsList();
        } catch (error) {
            console.error('[WarningPage] evaluate_warnings_command failed:', error);
            MessageManager.showError('刷新告警失败');
            this.renderWarningsList();
        }
    }

    private async loadRulesFromBackend(): Promise<WarningRule[]> {
        // Deprecated: keep for compatibility if called elsewhere
        const rules = await invoke('load_warning_rules_command', { file: 'process.csv' }) as WarningRule[];
        return Array.isArray(rules) ? rules : [];
    }

    private async saveRulesToBackend(_rules: WarningRule[]): Promise<void> {
        // Deprecated: keep for compatibility if called elsewhere
        await invoke('save_warning_rules_command', { file: 'process.csv', rules: _rules });
    }

    private async openRulesEditorModal(): Promise<void> {
        const overlay = document.createElement('div');
        overlay.className = 'warning-rules-overlay';

        const modal = document.createElement('div');
        modal.className = 'warning-rules-modal';

        modal.innerHTML = `
      <div class="warning-rules-header">
        <div class="warning-rules-title">告警规则</div>
        <button class="warning-rules-close" type="button">×</button>
      </div>

      <div class="warning-rules-tabs">
        <button class="warning-rules-tab active" data-tab="external" type="button">外置规则</button>
        <button class="warning-rules-tab" data-tab="builtin" type="button">内置规则库</button>
      </div>

      <div class="warning-rules-tabpanel" data-panel="external">
        <div class="warning-rules-topbar">
          <div class="warning-rules-topbar-left">
            <span class="warning-rules-label">文件</span>
            <select class="warning-rules-file-select" id="warning-rules-file-select"></select>
            <button class="warning-rules-btn secondary" id="warning-rules-add-file" type="button">新增文件</button>
          </div>
          <div class="warning-rules-topbar-right">
            <button class="warning-rules-btn secondary" id="warning-rules-add" type="button">新增规则</button>
            <button class="warning-rules-btn secondary" id="warning-rules-delete" type="button">删除规则</button>
            <button class="warning-rules-btn" id="warning-rules-save" type="button">保存</button>
          </div>
        </div>

        <div class="warning-rules-content">
          <div class="warning-rules-left">
            <div class="warning-rules-hint">不同文件会保存到不同的规则文件（例如 process_warning.json），支持正则规则。</div>
            <div class="warning-rules-list" id="warning-rules-list"></div>
          </div>
          <div class="warning-rules-right">
            <div class="warning-rule-form" id="warning-rule-form">
              <div class="warning-rule-empty">请选择或新增一条规则进行编辑</div>
            </div>
          </div>
        </div>
      </div>

      <div class="warning-rules-tabpanel" data-panel="builtin" style="display: none;">
        <div class="warning-builtin-topbar">
          <div class="warning-builtin-toggle">
            <span>启用内置规则库</span>
            <label class="warning-switch">
              <input type="checkbox" id="warning-builtin-global">
              <span class="warning-switch-slider"></span>
            </label>
          </div>
          <div class="warning-builtin-hint">内置规则只读；可单条启用/停用，或"复制为外置"后到"外置规则"页签自由改写。</div>
        </div>
        <div class="warning-builtin-list" id="warning-builtin-list"></div>
      </div>
    `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 200);
        };

        const closeBtn = modal.querySelector('.warning-rules-close') as HTMLButtonElement | null;
        closeBtn?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const fileSelect = modal.querySelector('#warning-rules-file-select') as HTMLSelectElement | null;
        const listHost = modal.querySelector('#warning-rules-list') as HTMLElement | null;
        const formHost = modal.querySelector('#warning-rule-form') as HTMLElement | null;

        const addFileBtn = modal.querySelector('#warning-rules-add-file') as HTMLButtonElement | null;
        const addBtn = modal.querySelector('#warning-rules-add') as HTMLButtonElement | null;
        const deleteBtn = modal.querySelector('#warning-rules-delete') as HTMLButtonElement | null;
        const saveBtn = modal.querySelector('#warning-rules-save') as HTMLButtonElement | null;

        let currentFile: string = '';
        let rules: WarningRule[] = [];
        let selectedRuleId: string | null = null;

        const normalizeSeverity = (sev: string): WarningSeverity => {
            const s = (sev || '').toLowerCase();
            if (s === 'critical') return 'critical';
            if (s === 'high') return 'high';
            if (s === 'medium') return 'medium';
            if (s === 'low') return 'low';
            return 'info';
        };

        const renderRulesList = () => {
            if (!listHost) return;
            if (!rules || rules.length === 0) {
                listHost.innerHTML = `<div class="warning-rules-list-empty">当前文件暂无规则</div>`;
                return;
            }

            const html = rules.map(r => {
                const active = r.id === selectedRuleId ? 'active' : '';
                const enabledText = r.enabled ? '启用' : '禁用';
                const sev = normalizeSeverity(r.severity);
                return `
          <div class="warning-rules-item ${active}" data-rule-id="${this.escapeHtml(r.id)}">
            <div class="warning-rules-item-title">${this.escapeHtml(r.title || r.id)}</div>
            <div class="warning-rules-item-meta">
              <span class="warning-rules-item-pill sev-${sev}">${this.escapeHtml(sev)}</span>
              <span class="warning-rules-item-pill">${enabledText}</span>
              <span class="warning-rules-item-kind">${this.escapeHtml(r.kind?.type || '')}</span>
            </div>
          </div>
        `;
            }).join('');

            listHost.innerHTML = html;
            listHost.querySelectorAll('.warning-rules-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = (el as HTMLElement).getAttribute('data-rule-id');
                    if (!id) return;
                    selectedRuleId = id;
                    renderRulesList();
                    renderRuleForm();
                });
            });
        };

        const updateRule = (patch: Partial<WarningRule>) => {
            if (!selectedRuleId) return;
            const idx = rules.findIndex(r => r.id === selectedRuleId);
            if (idx < 0) return;
            rules[idx] = { ...rules[idx], ...patch };
            renderRulesList();
        };

        const setKind = (kind: WarningRuleKind, rerenderForm: boolean = true) => {
            if (!selectedRuleId) return;
            const idx = rules.findIndex(r => r.id === selectedRuleId);
            if (idx < 0) return;
            rules[idx] = { ...rules[idx], kind };
            renderRulesList();
            if (rerenderForm) {
                renderRuleForm();
            }
        };

        const renderRuleForm = () => {
            if (!formHost) return;
            const rule = selectedRuleId ? rules.find(r => r.id === selectedRuleId) : null;
            if (!rule) {
                formHost.innerHTML = `<div class="warning-rule-empty">请选择或新增一条规则进行编辑</div>`;
                return;
            }

            const sev = normalizeSeverity(rule.severity);
            const kindType = rule.kind?.type || 'FileExists';

            const columnsValue = kindType === 'CsvHasColumns' ? (rule.kind as any).columns?.join(', ') || '' : '';
            const anyMatchList = (() => {
                if (kindType !== 'CsvAnyMatch') return [] as Array<{ column: string; regex: string }>;
                const k: any = rule.kind as any;
                const arr = Array.isArray(k.matches) ? k.matches : [];
                if (arr.length > 0) return arr;
                if ((k.column || k.regex) && (String(k.column || '').trim() || String(k.regex || '').trim())) {
                    return [{ column: String(k.column || ''), regex: String(k.regex || '') }];
                }
                return [{ column: '', regex: '' }];
            })();
            const rowThreshold = kindType === 'CsvRowCountGreater' ? String((rule.kind as any).threshold ?? '') : '';
            const textRegexList = (() => {
                if (kindType !== 'TextFileContains') return [] as string[];
                const k: any = rule.kind as any;
                const arr = Array.isArray(k.regexes) ? k.regexes : [];
                if (arr.length > 0) return arr;
                if (String(k.regex || '').trim()) return [String(k.regex || '')];
                return [''];
            })();

            formHost.innerHTML = `
        <div class="warning-rule-form-grid">
          <div class="warning-rule-toggle">
            <span>启用</span>
            <label class="warning-switch">
              <input type="checkbox" id="wr-enabled" ${rule.enabled ? 'checked' : ''}>
              <span class="warning-switch-slider"></span>
            </label>
          </div>

          <label class="warning-rule-field">
            <span>规则ID</span>
            <input type="text" id="wr-id" value="${this.escapeHtml(rule.id)}">
          </label>

          <label class="warning-rule-field">
            <span>级别</span>
            <select id="wr-severity">
              <option value="info" ${sev === 'info' ? 'selected' : ''}>info</option>
              <option value="low" ${sev === 'low' ? 'selected' : ''}>low</option>
              <option value="medium" ${sev === 'medium' ? 'selected' : ''}>medium</option>
              <option value="high" ${sev === 'high' ? 'selected' : ''}>high</option>
              <option value="critical" ${sev === 'critical' ? 'selected' : ''}>critical</option>
            </select>
          </label>

          <label class="warning-rule-field full">
            <span>标题</span>
            <input type="text" id="wr-title" value="${this.escapeHtml(rule.title || '')}">
          </label>

          <label class="warning-rule-field full">
            <span>摘要</span>
            <textarea id="wr-summary" rows="2">${this.escapeHtml(rule.summary || '')}</textarea>
          </label>

          <label class="warning-rule-field full">
            <span>详情</span>
            <textarea id="wr-details" rows="3">${this.escapeHtml(rule.details || '')}</textarea>
          </label>

          <label class="warning-rule-field">
            <span>规则类型</span>
            <select id="wr-kind">
              <option value="FileExists" ${kindType === 'FileExists' ? 'selected' : ''}>FileExists（文件不存在触发）</option>
              <option value="CsvHasColumns" ${kindType === 'CsvHasColumns' ? 'selected' : ''}>CsvHasColumns（CSV包含列）</option>
              <option value="CsvAnyMatch" ${kindType === 'CsvAnyMatch' ? 'selected' : ''}>CsvAnyMatch（CSV列正则匹配）</option>
              <option value="CsvRowCountGreater" ${kindType === 'CsvRowCountGreater' ? 'selected' : ''}>CsvRowCountGreater（CSV行数阈值）</option>
              <option value="TextFileContains" ${kindType === 'TextFileContains' ? 'selected' : ''}>TextFileContains（文本正则匹配）</option>
            </select>
          </label>

          <div class="warning-rule-params full">
            <div class="warning-rule-param" data-kind="CsvHasColumns" style="display: ${kindType === 'CsvHasColumns' ? 'block' : 'none'};">
              <label>
                <span>列（逗号分隔）</span>
                <input type="text" id="wr-columns" value="${this.escapeHtml(columnsValue)}" placeholder="PID, PPID, ImageFileName">
              </label>
            </div>

            <div class="warning-rule-param" data-kind="CsvAnyMatch" style="display: ${kindType === 'CsvAnyMatch' ? 'block' : 'none'};">
              <div class="warning-param-header">
                <span>匹配条件</span>
                <button type="button" class="warning-param-add" id="wr-anymatch-add">＋</button>
              </div>
              <div class="warning-anymatch-list">
                ${anyMatchList
                    .map((m: { column: string; regex: string }, i: number) => {
                        return `
                  <div class="warning-anymatch-row" data-idx="${i}">
                    <label>
                      <span>列名</span>
                      <input type="text" class="wr-anymatch-column" value="${this.escapeHtml(m.column || '')}" placeholder="ImageFileName">
                    </label>
                    <label>
                      <span>正则（regex）</span>
                      <input type="text" class="wr-anymatch-regex" value="${this.escapeHtml(m.regex || '')}" placeholder="(?i)mimikatz|psexec">
                    </label>
                    <button type="button" class="warning-param-remove" data-remove-idx="${i}">×</button>
                  </div>
                `;
                    })
                    .join('')}
              </div>
            </div>

            <div class="warning-rule-param" data-kind="CsvRowCountGreater" style="display: ${kindType === 'CsvRowCountGreater' ? 'block' : 'none'};">
              <label>
                <span>阈值（行数）</span>
                <input type="number" id="wr-row-threshold" value="${this.escapeHtml(rowThreshold)}" min="0">
              </label>
            </div>

            <div class="warning-rule-param" data-kind="TextFileContains" style="display: ${kindType === 'TextFileContains' ? 'block' : 'none'};">
              <div class="warning-param-header">
                <span>正则列表</span>
                <button type="button" class="warning-param-add" id="wr-text-add">＋</button>
              </div>
              <div class="warning-text-regex-list">
                ${textRegexList
                    .map((rx: string, i: number) => {
                        return `
                  <div class="warning-text-regex-row" data-idx="${i}">
                    <label>
                      <span>正则（regex）</span>
                      <input type="text" class="wr-text-regex" value="${this.escapeHtml(rx || '')}" placeholder="(?i)error|failed">
                    </label>
                    <button type="button" class="warning-param-remove" data-text-remove-idx="${i}">×</button>
                  </div>
                `;
                    })
                    .join('')}
              </div>
            </div>
          </div>
        </div>
      `;

            const enabledEl = formHost.querySelector('#wr-enabled') as HTMLInputElement | null;
            enabledEl?.addEventListener('change', () => updateRule({ enabled: !!enabledEl.checked }));

            const idEl = formHost.querySelector('#wr-id') as HTMLInputElement | null;
            idEl?.addEventListener('input', () => {
                const newId = (idEl.value || '').trim();
                if (!newId) return;
                const exists = rules.some(r => r.id === newId);
                if (exists && newId !== selectedRuleId) return;
                const idx = rules.findIndex(r => r.id === selectedRuleId);
                if (idx < 0) return;
                rules[idx] = { ...rules[idx], id: newId };
                selectedRuleId = newId;
                renderRulesList();
            });

            const sevEl = formHost.querySelector('#wr-severity') as HTMLSelectElement | null;
            sevEl?.addEventListener('change', () => updateRule({ severity: sevEl.value }));

            const titleEl = formHost.querySelector('#wr-title') as HTMLInputElement | null;
            titleEl?.addEventListener('input', () => updateRule({ title: titleEl.value }));

            const summaryEl = formHost.querySelector('#wr-summary') as HTMLTextAreaElement | null;
            summaryEl?.addEventListener('input', () => updateRule({ summary: summaryEl.value }));

            const detailsEl = formHost.querySelector('#wr-details') as HTMLTextAreaElement | null;
            detailsEl?.addEventListener('input', () => updateRule({ details: detailsEl.value }));

            const kindEl = formHost.querySelector('#wr-kind') as HTMLSelectElement | null;
            kindEl?.addEventListener('change', () => {
                const t = kindEl.value;
                if (t === 'FileExists') setKind({ type: 'FileExists' });
                else if (t === 'CsvHasColumns') setKind({ type: 'CsvHasColumns', columns: [] });
                else if (t === 'CsvAnyMatch') setKind({ type: 'CsvAnyMatch', matches: [{ column: '', regex: '' }], column: '', regex: '' });
                else if (t === 'CsvRowCountGreater') setKind({ type: 'CsvRowCountGreater', threshold: 0 });
                else if (t === 'TextFileContains') setKind({ type: 'TextFileContains', regexes: [''], regex: '' });
            });

            const columnsEl = formHost.querySelector('#wr-columns') as HTMLInputElement | null;
            columnsEl?.addEventListener('input', () => {
                if (!selectedRuleId) return;
                const cols = (columnsEl.value || '')
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean);
                setKind({ type: 'CsvHasColumns', columns: cols }, false);
            });

            const getCurrentAnyMatchMatches = (): Array<{ column: string; regex: string }> => {
                if (!selectedRuleId) return [];
                const idx = rules.findIndex(r => r.id === selectedRuleId);
                if (idx < 0) return [];
                const k: any = rules[idx].kind as any;
                const arr = Array.isArray(k?.matches) ? k.matches : [];
                if (arr.length > 0) return arr.map((m: any) => ({ column: String(m?.column || ''), regex: String(m?.regex || '') }));
                if (String(k?.column || '').trim() || String(k?.regex || '').trim()) {
                    return [{ column: String(k?.column || ''), regex: String(k?.regex || '') }];
                }
                return [{ column: '', regex: '' }];
            };

            const applyAnyMatchFromDom = () => {
                if (!selectedRuleId) return;
                const rows = Array.from(formHost.querySelectorAll('.warning-anymatch-row')) as HTMLElement[];
                const matches = rows
                    .map(row => {
                        const colEl = row.querySelector('.wr-anymatch-column') as HTMLInputElement | null;
                        const rxEl = row.querySelector('.wr-anymatch-regex') as HTMLInputElement | null;
                        return { column: (colEl?.value || '').trim(), regex: (rxEl?.value || '').trim() };
                    })
                    .filter(m => m.column.length > 0 && m.regex.length > 0);
                setKind({ type: 'CsvAnyMatch', matches, column: '', regex: '' }, false);
            };

            formHost.querySelectorAll('.wr-anymatch-column').forEach(el => {
                el.addEventListener('input', applyAnyMatchFromDom);
            });
            formHost.querySelectorAll('.wr-anymatch-regex').forEach(el => {
                el.addEventListener('input', applyAnyMatchFromDom);
            });

            const anyMatchAddBtn = formHost.querySelector('#wr-anymatch-add') as HTMLButtonElement | null;
            anyMatchAddBtn?.addEventListener('click', () => {
                const arr = getCurrentAnyMatchMatches();
                arr.push({ column: '', regex: '' });
                setKind({ type: 'CsvAnyMatch', matches: arr, column: '', regex: '' }, true);
            });

            formHost.querySelectorAll('.warning-param-remove[data-remove-idx]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idxStr = (btn as HTMLElement).getAttribute('data-remove-idx');
                    const rm = Number(idxStr);
                    if (!Number.isFinite(rm)) return;
                    let arr = getCurrentAnyMatchMatches();
                    arr = arr.filter((_, i) => i !== rm);
                    if (arr.length === 0) arr = [{ column: '', regex: '' }];
                    setKind({ type: 'CsvAnyMatch', matches: arr, column: '', regex: '' }, true);
                });
            });

            const thresholdEl = formHost.querySelector('#wr-row-threshold') as HTMLInputElement | null;
            thresholdEl?.addEventListener('input', () => {
                const n = Number(thresholdEl.value || 0);
                setKind({ type: 'CsvRowCountGreater', threshold: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0 }, false);
            });

            const getCurrentTextRegexes = (): string[] => {
                if (!selectedRuleId) return [''];
                const idx = rules.findIndex(r => r.id === selectedRuleId);
                if (idx < 0) return [''];
                const k: any = rules[idx].kind as any;
                const arr = Array.isArray(k?.regexes) ? k.regexes : [];
                if (arr.length > 0) return arr.map((s: any) => String(s || ''));
                if (String(k?.regex || '').trim()) return [String(k?.regex || '')];
                return [''];
            };

            const applyTextRegexesFromDom = () => {
                if (!selectedRuleId) return;
                const rows = Array.from(formHost.querySelectorAll('.warning-text-regex-row')) as HTMLElement[];
                const regexes = rows
                    .map(row => {
                        const el = row.querySelector('.wr-text-regex') as HTMLInputElement | null;
                        return (el?.value || '').trim();
                    })
                    .filter(Boolean);
                setKind({ type: 'TextFileContains', regexes, regex: '' }, false);
            };

            formHost.querySelectorAll('.wr-text-regex').forEach(el => {
                el.addEventListener('input', applyTextRegexesFromDom);
            });

            const textAddBtn = formHost.querySelector('#wr-text-add') as HTMLButtonElement | null;
            textAddBtn?.addEventListener('click', () => {
                const arr = getCurrentTextRegexes();
                arr.push('');
                setKind({ type: 'TextFileContains', regexes: arr, regex: '' }, true);
            });

            formHost.querySelectorAll('.warning-param-remove[data-text-remove-idx]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idxStr = (btn as HTMLElement).getAttribute('data-text-remove-idx');
                    const rm = Number(idxStr);
                    if (!Number.isFinite(rm)) return;
                    let arr = getCurrentTextRegexes();
                    arr = arr.filter((_, i) => i !== rm);
                    if (arr.length === 0) arr = [''];
                    setKind({ type: 'TextFileContains', regexes: arr, regex: '' }, true);
                });
            });
        };

        const stemOf = (name: string): string => {
            const base = (name || '').split(/[\\/]/).pop() || name || '';
            const idx = base.indexOf('.');
            return idx >= 0 ? base.slice(0, idx) : base;
        };

        const inferOutputFileFromRuleFile = (ruleFileName: string, outputCandidates: string[]): string | null => {
            const lower = (ruleFileName || '').toLowerCase();
            if (!lower.endsWith('_warning.json')) return null;
            const stem = ruleFileName.slice(0, ruleFileName.length - '_warning.json'.length);
            const match = outputCandidates.find(n => stemOf(n).toLowerCase() === stem.toLowerCase());
            return match || `${stem}.csv`;
        };

        const loadFilesForSelector = async (): Promise<string[]> => {
            let outputFiles: OutputFileInfo[] = [];
            try {
                const files = await invoke('read_output_directory') as OutputFileInfo[];
                outputFiles = Array.isArray(files) ? files : [];
            } catch {
                outputFiles = [];
            }

            let warningFiles: OutputFileInfo[] = [];
            try {
                const files = await invoke('read_warning_directory') as OutputFileInfo[];
                warningFiles = Array.isArray(files) ? files : [];
            } catch {
                warningFiles = [];
            }

            const outputCandidates = outputFiles.filter(f => !f.is_dir).map(f => f.name);
            const inferredFromWarnings = warningFiles
                .filter(f => !f.is_dir)
                .map(f => inferOutputFileFromRuleFile(f.name, outputCandidates))
                .filter((x): x is string => !!x);

            const all = new Set<string>([...outputCandidates, ...inferredFromWarnings]);
            return Array.from(all).sort((a, b) => a.localeCompare(b));
        };

        const loadRulesForFile = async (file: string) => {
            try {
                rules = await invoke('load_warning_rules_command', { file }) as WarningRule[];
                if (!Array.isArray(rules)) rules = [];
                // 兼容：确保 file 字段有值
                rules = rules.map(r => ({ ...r, file: r.file || file }));
                selectedRuleId = rules[0]?.id || null;
                renderRulesList();
                renderRuleForm();
            } catch (error) {
                console.error('[WarningPage] load_warning_rules_command failed:', error);
                MessageManager.showError('加载规则失败');
                rules = [];
                selectedRuleId = null;
                renderRulesList();
                renderRuleForm();
            }
        };

        addBtn?.addEventListener('click', () => {
            if (!currentFile) {
                MessageManager.showWarning('请先选择文件');
                return;
            }
            const newId = `rule-${Date.now()}`;
            const newRule: WarningRule = {
                id: newId,
                enabled: true,
                file: currentFile,
                severity: 'info',
                title: '新规则',
                summary: '',
                details: '',
                kind: { type: 'CsvAnyMatch', matches: [{ column: '', regex: '' }], column: '', regex: '' }
            };
            rules.unshift(newRule);
            selectedRuleId = newId;
            renderRulesList();
            renderRuleForm();
        });

        deleteBtn?.addEventListener('click', () => {
            if (!selectedRuleId) return;
            rules = rules.filter(r => r.id !== selectedRuleId);
            selectedRuleId = rules[0]?.id || null;
            renderRulesList();
            renderRuleForm();
        });

        saveBtn?.addEventListener('click', async () => {
            if (!currentFile) {
                MessageManager.showWarning('请先选择文件');
                return;
            }
            try {
                // 归一化：强制所有规则绑定到当前文件，避免 file 为空/不一致导致评估跳过
                const normalized = rules.map(r => ({ ...r, file: currentFile }));
                await invoke('save_warning_rules_command', { file: currentFile, rules: normalized });
                MessageManager.showSuccess('规则已保存');
                await this.refreshWarningsFromBackend();
                close();
            } catch (error) {
                console.error('[WarningPage] save_warning_rules_command failed:', error);
                MessageManager.showError('保存规则失败');
            }
        });

        const init = async () => {
            try {
                const candidates = await loadFilesForSelector();
                const preferred = candidates.find(n => n.toLowerCase() === 'process.csv') || candidates[0] || 'process.csv';

                if (fileSelect) {
                    fileSelect.innerHTML = candidates.map(n => `<option value="${this.escapeHtml(n)}">${this.escapeHtml(n)}</option>`).join('');
                    if (!candidates.includes(preferred)) {
                        fileSelect.innerHTML = `<option value="${this.escapeHtml(preferred)}">${this.escapeHtml(preferred)}</option>` + fileSelect.innerHTML;
                    }
                    fileSelect.value = preferred;
                }

                currentFile = (fileSelect?.value || preferred);

                addFileBtn?.addEventListener('click', async () => {
                    const input = await showPrompt({ title: '输出文件名', placeholder: '例如 netscan.csv', validate: v => !v ? '文件名不能为空' : /[<>:"/\\|?*]/.test(v) ? '文件名不能包含 < > : " / \\ | ? *' : null });
                    if (!input) return;
                    let name = (input || '').trim();
                    name = name.split(/[\\/]/).pop() || '';
                    if (!name) return;
                    if (!name.includes('.')) {
                        name = `${name}.csv`;
                    }

                    if (fileSelect) {
                        const exists = Array.from(fileSelect.options).some(o => (o.value || '').toLowerCase() === name.toLowerCase());
                        if (!exists) {
                            fileSelect.innerHTML = `<option value="${this.escapeHtml(name)}">${this.escapeHtml(name)}</option>` + fileSelect.innerHTML;
                        }
                        fileSelect.value = name;
                    }

                    currentFile = name;
                    await loadRulesForFile(currentFile);
                });

                fileSelect?.addEventListener('change', async () => {
                    currentFile = fileSelect.value;
                    await loadRulesForFile(currentFile);
                });

                await loadRulesForFile(currentFile);
            } catch (error) {
                console.error('[WarningPage] failed to initialize rule editor:', error);
                MessageManager.showError('初始化规则编辑器失败');
            }
        };

        // ── 页签切换 + 内置规则库面板 ──────────────────────────────
        const tabs = Array.from(modal.querySelectorAll('.warning-rules-tab')) as HTMLElement[];
        const panels = Array.from(modal.querySelectorAll('.warning-rules-tabpanel')) as HTMLElement[];
        const builtinListHost = modal.querySelector('#warning-builtin-list') as HTMLElement | null;
        const builtinGlobalToggle = modal.querySelector('#warning-builtin-global') as HTMLInputElement | null;
        let builtinLoaded = false;

        const sevText = (s: string): string => {
            const v = (s || '').toLowerCase();
            if (v === 'critical') return '紧急';
            if (v === 'high') return '高';
            if (v === 'medium') return '中';
            if (v === 'low') return '低';
            return '信息';
        };

        const renderBuiltinPanel = (resp: BuiltinRulesResponse) => {
            if (!builtinListHost) return;
            if (builtinGlobalToggle) builtinGlobalToggle.checked = !!resp.global_enabled;

            const rules = Array.isArray(resp.rules) ? resp.rules : [];
            if (rules.length === 0) {
                builtinListHost.innerHTML = `<div class="warning-rules-list-empty">暂无内置规则</div>`;
                return;
            }

            const globalOff = !resp.global_enabled;
            const groups = new Map<string, BuiltinRuleView[]>();
            rules.forEach(r => {
                const key = r.category || '其他';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(r);
            });

            builtinListHost.innerHTML = Array.from(groups.entries()).map(([cat, items]) => {
                const rows = items.map(r => {
                    const sev = (r.severity || 'info').toLowerCase();
                    return `
              <div class="warning-builtin-item ${r.enabled ? '' : 'disabled'}" data-id="${this.escapeHtml(r.id)}">
                <div class="warning-builtin-item-main">
                  <div class="warning-builtin-item-title">
                    <span class="warning-rules-item-pill sev-${sev}">${this.escapeHtml(sevText(r.severity))}</span>
                    <span class="warning-builtin-name">${this.escapeHtml(r.title)}</span>
                    <span class="warning-builtin-file">${this.escapeHtml(r.file)}</span>
                  </div>
                  ${r.summary ? `<div class="warning-builtin-summary">${this.escapeHtml(r.summary)}</div>` : ''}
                  <div class="warning-builtin-explain">${this.escapeHtml(r.explain)}</div>
                </div>
                <div class="warning-builtin-item-actions">
                  <label class="warning-switch" title="启用/停用该规则">
                    <input type="checkbox" class="warning-builtin-toggle" data-id="${this.escapeHtml(r.id)}" ${r.enabled ? 'checked' : ''} ${globalOff ? 'disabled' : ''}>
                    <span class="warning-switch-slider"></span>
                  </label>
                  <button type="button" class="warning-rules-btn secondary warning-builtin-copy" data-id="${this.escapeHtml(r.id)}">复制为外置</button>
                </div>
              </div>
            `;
                }).join('');
                return `
            <div class="warning-builtin-group">
              <div class="warning-builtin-group-title">${this.escapeHtml(cat)} <span class="warning-builtin-group-count">${items.length}</span></div>
              ${rows}
            </div>
          `;
            }).join('');

            builtinListHost.querySelectorAll('.warning-builtin-toggle').forEach(el => {
                el.addEventListener('change', async () => {
                    const input = el as HTMLInputElement;
                    const id = input.getAttribute('data-id') || '';
                    if (!id) return;
                    try {
                        await invoke('set_builtin_warning_enabled', { id, enabled: input.checked });
                        const row = input.closest('.warning-builtin-item') as HTMLElement | null;
                        if (row) row.classList.toggle('disabled', !input.checked);
                        await this.refreshWarningsFromBackend();
                    } catch (error) {
                        console.error('[WarningPage] set_builtin_warning_enabled failed:', error);
                        MessageManager.showError('更新内置规则状态失败');
                        input.checked = !input.checked;
                    }
                });
            });

            builtinListHost.querySelectorAll('.warning-builtin-copy').forEach(el => {
                el.addEventListener('click', async () => {
                    const id = (el as HTMLElement).getAttribute('data-id') || '';
                    if (!id) return;
                    try {
                        const file = await invoke('copy_builtin_warning_to_external', { id }) as string;
                        MessageManager.showSuccess(`已复制到外置规则：${file}`);
                    } catch (error) {
                        console.error('[WarningPage] copy_builtin_warning_to_external failed:', error);
                        MessageManager.showError('复制为外置规则失败');
                    }
                });
            });
        };

        const loadBuiltinPanel = async () => {
            if (!builtinListHost) return;
            try {
                const resp = await invoke('get_builtin_warning_rules') as BuiltinRulesResponse;
                renderBuiltinPanel(resp);
                builtinLoaded = true;
            } catch (error) {
                console.error('[WarningPage] get_builtin_warning_rules failed:', error);
                MessageManager.showError('加载内置规则失败');
                builtinListHost.innerHTML = `<div class="warning-rules-list-empty">加载失败</div>`;
            }
        };

        builtinGlobalToggle?.addEventListener('change', async () => {
            try {
                await invoke('set_builtin_warnings_global_enabled', { enabled: builtinGlobalToggle.checked });
                await this.refreshWarningsFromBackend();
                await loadBuiltinPanel();
            } catch (error) {
                console.error('[WarningPage] set_builtin_warnings_global_enabled failed:', error);
                MessageManager.showError('更新内置规则库开关失败');
                builtinGlobalToggle.checked = !builtinGlobalToggle.checked;
            }
        });

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const name = tab.getAttribute('data-tab') || 'external';
                tabs.forEach(t => t.classList.toggle('active', t === tab));
                panels.forEach(p => {
                    const show = p.getAttribute('data-panel') === name;
                    (p as HTMLElement).style.display = show ? '' : 'none';
                });
                if (name === 'builtin' && !builtinLoaded) {
                    void loadBuiltinPanel();
                }
            });
        });

        requestAnimationFrame(() => overlay.classList.add('show'));
        await init();
    }

    private renderWarningsList(): void {
        if (!this.container) return;
        const host = this.container.querySelector('#warning-cards') as HTMLElement | null;
        if (!host) return;

        let warnings = this.getWarnings();

        if (this.severityFilter !== 'all') {
            warnings = warnings.filter(w => w.severity === this.severityFilter);
        }

        if (warnings.length === 0) {
            host.innerHTML = `
        <div class="warning-empty">
          <div class="warning-empty-title">暂无告警</div>
          <div class="warning-empty-subtitle">当前筛选条件下没有匹配的告警项</div>
        </div>
      `;
            return;
        }

        const html = warnings
            .sort((a, b) => b.createdAt - a.createdAt)
            .map(w => this.renderWarningCard(w))
            .join('');

        host.innerHTML = html;
    }

    private renderWarningCard(w: WarningItem): string {
        const time = new Date(w.createdAt).toLocaleString();
        const tags = (w.tags || []).map(t => `<span class="warning-tag">${this.escapeHtml(t)}</span>`).join('');
        const evidence = (w.evidence || []).map(e => `<li>${this.escapeHtml(e)}</li>`).join('');
        const isBuiltin = (w.source || '').startsWith('内置规则');
        const builtinChip = isBuiltin ? `<span class="warning-builtin-chip">内置</span>` : '';
        const detailBtn = (w.evidence && w.evidence.length)
            ? `<button type="button" class="warning-detail-btn" data-id="${this.escapeHtml(w.id)}">查看详情</button>`
            : '';

        return `
      <div class="warning-card severity-${w.severity}">
        <div class="warning-card-header">
          <div class="warning-card-title">${builtinChip}${this.escapeHtml(w.title)}</div>
          <div class="warning-card-meta">
            <span class="warning-severity">${this.getSeverityText(w.severity)}</span>
            <span class="warning-time">${this.escapeHtml(time)}</span>
          </div>
        </div>

        ${w.summary ? `<div class="warning-summary">${this.escapeHtml(w.summary)}</div>` : ''}
        ${w.details ? `<div class="warning-details">${this.escapeHtml(w.details)}</div>` : ''}

        ${evidence ? `<div class="warning-evidence"><div class="warning-evidence-title">证据</div><ul class="warning-evidence-list">${evidence}</ul></div>` : ''}

        <div class="warning-card-footer">
          <div class="warning-source">${w.source ? this.escapeHtml(w.source) : ''}</div>
          <div class="warning-footer-right">
            ${detailBtn}
            <div class="warning-tags">${tags}</div>
          </div>
        </div>

        ${w.isExample ? `<div class="warning-example-badge">示例</div>` : ''}
      </div>
    `;
    }

    private openWarningDetailModal(w: WarningItem): void {
        const overlay = document.createElement('div');
        overlay.className = 'warning-detail-overlay';

        const modal = document.createElement('div');
        modal.className = `warning-detail-modal severity-${w.severity}`;

        const time = new Date(w.createdAt).toLocaleString();
        const evidence = (w.evidence || []).map(e => `<li>${this.escapeHtml(e)}</li>`).join('');

        const metaParts: string[] = [`<span>时间：${this.escapeHtml(time)}</span>`];
        if (w.file) metaParts.push(`<span>目标文件：${this.escapeHtml(w.file)}</span>`);
        if (w.source) metaParts.push(`<span>来源：${this.escapeHtml(w.source)}</span>`);

        modal.innerHTML = `
      <div class="warning-detail-header">
        <div class="warning-detail-title">
          <span class="warning-severity">${this.getSeverityText(w.severity)}</span>
          <span>${this.escapeHtml(w.title)}</span>
        </div>
        <button class="warning-detail-close" type="button">×</button>
      </div>
      <div class="warning-detail-body">
        <div class="warning-detail-meta">${metaParts.join('')}</div>
        ${w.summary ? `<div class="warning-detail-section"><div class="warning-detail-section-title">摘要</div><div class="warning-detail-text">${this.escapeHtml(w.summary)}</div></div>` : ''}
        ${w.details ? `<div class="warning-detail-section"><div class="warning-detail-section-title">详情</div><div class="warning-detail-text">${this.escapeHtml(w.details)}</div></div>` : ''}
        ${evidence ? `<div class="warning-detail-section"><div class="warning-detail-section-title">证据</div><ul class="warning-detail-evidence">${evidence}</ul></div>` : ''}
      </div>
    `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = () => {
            overlay.classList.remove('show');
            document.removeEventListener('keydown', onKey);
            setTimeout(() => overlay.remove(), 200);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };

        const closeBtn = modal.querySelector('.warning-detail-close') as HTMLButtonElement | null;
        closeBtn?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        document.addEventListener('keydown', onKey);

        requestAnimationFrame(() => overlay.classList.add('show'));
    }

    private getSeverityText(sev: WarningSeverity): string {
        if (sev === 'critical') return '紧急';
        if (sev === 'high') return '高';
        if (sev === 'medium') return '中';
        if (sev === 'low') return '低';
        return '信息';
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

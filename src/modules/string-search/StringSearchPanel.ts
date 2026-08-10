/**
 * 字符串搜索面板组件 - 内嵌式界面
 * 支持在主界面中嵌入显示，同时保留独立窗口模式
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../core/settingsHelper';
import { getMountLetter, mountPath } from '../core/mountDrive';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { renderStringSearchTemplate } from './template';

import { showPrompt } from '../core/confirmDialog';
import { debounce } from '../utils/helpers';
import { showFriendlyError } from '../utils/errorMessage';
import { LANGUAGE_DOM_EVENT_NAME, translate } from '../../i18n';
import {
    StringSearchConfig,
    SearchResult,
    FoundString,
    SearchProgress,
    DEFAULT_SEARCH_CONFIG,
    SortConfig,
    ColumnFilters,
    TAG_PRESETS,
    TagPreset,
    StringCategory,
    StringCluster,
    SearchBookmark,
    VisualizationData,
    YaraConfig,
    YaraScanResult,
    YaraRuleMatch,
    YaraScanProgress,
} from './types';

export class StringSearchPanel {
    private container: HTMLElement | null = null;
    private isSearching: boolean = false;
    private currentResults: SearchResult | null = null;
    private filteredResults: FoundString[] | null = null;
    private currentPage: number = 1;
    private pageSize: number = 100;
    /** 排序/过滤结果缓存：避免每次翻页/重渲都对全量结果重新排序过滤 */
    private sfCache: { sig: string; data: FoundString[] } | null = null;
    /** 标签/书签变更版本号，用于使排序过滤缓存失效 */
    private tagVersion: number = 0;
    private secondarySearchTerm: string = '';
    private totalFoundCount: number = 0;
    private searchStartTime: number | null = null;
    private searchConfig: StringSearchConfig = { ...DEFAULT_SEARCH_CONFIG };
    private unlisteners: UnlistenFn[] = [];
    private initialized: boolean = false;
    private languageListenerBound: boolean = false;
    private readonly handleLanguageChange = (): void => {
        if (this.visualizationVisible) this.renderVisualization();
    };

    // HEX Context 相关状态
    private currentSelectedString: string = '';
    private currentSelectedOffset: number = 0;
    private currentSelectedByteLength: number = 0;
    private currentSelectedFilePath: string = '';  // 源文件路径
    private hexContextBefore: number[] = [];
    private hexContextAfter: number[] = [];
    private isLoadingContext: boolean = false;

    // 熵值筛选
    private entropyFilter: string = 'none'; // none, low, medium, high, very-high, crypto

    // P0: 排序/过滤/标记
    private sortConfig: SortConfig | null = null;
    private columnFilters: ColumnFilters = { offset: '', encoding: '', content: '' };
    private taggedResults: Map<string, string[]> = new Map(); // "offset_hex" -> tags
    private selectedIndices: Set<number> = new Set(); // 多选
    private kbdIndex: number = -1; // 键盘导航当前行（全局索引）
    private lastClickedIndex: number = -1;
    private bookmarks: SearchBookmark[] = [];

    // P1-B: 聚类
    private clusterView: boolean = false;
    private clusters: StringCluster[] = [];

    // P2-B: 可视化
    private visualizationVisible: boolean = false;
    private visualizationData: VisualizationData | null = null;

    // YARA
    private yaraRulePaths: string[] = [];
    private yaraResults: YaraScanResult | null = null;
    private yaraScanning: boolean = false;

    // Toast 管理
    private toastTimer: ReturnType<typeof setTimeout> | null = null;

    // 搜索速度
    private lastProgressUpdate: { time: number; bytes: number } | null = null;

    constructor() {}

    /**
     * 渲染面板HTML
     */
    render(): string {
        return renderStringSearchTemplate();
    }

    /**
     * 初始化面板
     */
    async initialize(container: HTMLElement): Promise<void> {
        this.container = container;

        if (!this.languageListenerBound) {
            window.addEventListener(LANGUAGE_DOM_EVENT_NAME, this.handleLanguageChange);
            this.languageListenerBound = true;
        }

        if (this.initialized) {
            // 已初始化过，只需重新绑定事件并恢复状态
            this.bindEvents();
            this.restoreUIState();
            return;
        }

        this.bindEvents();
        await this.setupTauriEventListeners();
        await this.loadInitialImagePath();

        this.initialized = true;
    }

    /**
     * 恢复 UI 状态（切换标签页后重新进入时调用）
     */
    private restoreUIState(): void {
        if (!this.container) return;

        // 1. 恢复搜索模式
        this.restoreSearchMode();

        // 2. 恢复搜索配置到 UI
        this.restoreSearchConfig();

        // 3. 恢复选中的预设
        this.restoreSelectedPresets();

        // 4. 恢复熵值筛选
        this.restoreEntropyFilter();

        // 5. 恢复搜索状态（进度条显示）
        if (this.isSearching) {
            this.updateUIForSearching(true);
        }

        // 6. 恢复搜索结果
        if (this.currentResults && this.currentResults.strings.length > 0) {
            this.renderResults();
        }
    }

    /**
     * 恢复搜索模式 UI
     */
    private restoreSearchMode(): void {
        if (!this.container) return;

        const mode = this.getCurrentMode();
        const modeOptions = this.container.querySelectorAll('.ss-mode-tab');
        modeOptions.forEach(option => {
            const optionMode = (option as HTMLElement).dataset.mode;
            option.classList.toggle('active', optionMode === mode);
        });

        // 显示对应的输入组
        const pathInputGroup = this.container.querySelector('#pathInputGroup') as HTMLElement;
        const imageStatusGroup = this.container.querySelector('#imageStatusGroup') as HTMLElement;
        const processInputGroup = this.container.querySelector('#processInputGroup') as HTMLElement;

        if (pathInputGroup) pathInputGroup.style.display = 'none';
        if (imageStatusGroup) imageStatusGroup.style.display = 'none';
        if (processInputGroup) processInputGroup.style.display = 'none';

        switch (mode) {
            case 'image':
                if (imageStatusGroup) imageStatusGroup.style.display = 'flex';
                // 重新获取最新的镜像路径并更新 UI
                this.loadInitialImagePath();
                break;
            case 'file':
            case 'folder':
                if (pathInputGroup) pathInputGroup.style.display = 'flex';
                // 恢复路径输入值
                const targetPathInput = this.container.querySelector('#targetPathPanel') as HTMLInputElement;
                if (targetPathInput) {
                    const searchMode = this.searchConfig.mode;
                    if ('FileSearch' in searchMode) {
                        targetPathInput.value = searchMode.FileSearch.file_path || '';
                    } else if ('FolderSearch' in searchMode) {
                        targetPathInput.value = searchMode.FolderSearch.folder_path || '';
                    }
                }
                break;
            case 'process':
                if (processInputGroup) processInputGroup.style.display = 'flex';
                break;
        }
    }

    /**
     * 恢复搜索配置到 UI
     */
    private restoreSearchConfig(): void {
        if (!this.container) return;

        // 恢复编码选择
        const encodingCheckboxes = this.container.querySelectorAll('.encoding-checkbox') as NodeListOf<HTMLInputElement>;
        encodingCheckboxes.forEach(cb => {
            cb.checked = this.searchConfig.encodings?.includes(cb.value) ?? false;
        });
        this.updateEncodingLabel();

        // 恢复搜索模式输入
        const searchPattern = this.container.querySelector('#searchPatternPanel') as HTMLInputElement;
        if (searchPattern && this.searchConfig.search_pattern) {
            searchPattern.value = this.searchConfig.search_pattern;
            const clearBtn = this.container.querySelector('#clearPatternBtn') as HTMLElement;
            if (clearBtn) clearBtn.style.display = 'flex';
        }

        // 恢复正则和大小写开关
        const regexBtn = this.container.querySelector('#useRegexPanel') as HTMLElement;
        if (regexBtn) {
            regexBtn.classList.toggle('active', this.searchConfig.use_regex ?? false);
        }

        const caseBtn = this.container.querySelector('#caseSensitivePanel') as HTMLElement;
        if (caseBtn) {
            caseBtn.classList.toggle('active', this.searchConfig.case_sensitive ?? false);
        }

        // 恢复高级选项
        const minLength = this.container.querySelector('#minLengthPanel') as HTMLInputElement;
        if (minLength) {
            minLength.value = String(this.searchConfig.min_length ?? 4);
        }

        const maxResults = this.container.querySelector('#maxResultsPanel') as HTMLInputElement;
        if (maxResults) {
            maxResults.value = String(this.searchConfig.max_results ?? 10000);
        }
    }

    /**
     * 恢复选中的预设
     */
    private restoreSelectedPresets(): void {
        if (!this.container || this.selectedPresets.length === 0) return;

        // 恢复 checkbox 状态
        this.selectedPresets.forEach(preset => {
            const item = this.container?.querySelector(`.ss-preset-item[data-regex="${preset.pattern.replace(/"/g, '\\"')}"]`);
            const checkbox = item?.querySelector('.ss-preset-checkbox') as HTMLInputElement;
            if (checkbox) checkbox.checked = true;
        });

        // 重新渲染预设标签
        this.updateSelectedPresetsTags();
    }

    /**
     * 恢复熵值筛选
     */
    private restoreEntropyFilter(): void {
        if (!this.container) return;

        const entropySelect = this.container.querySelector('#entropyFilterSelect') as HTMLSelectElement;
        if (entropySelect) {
            entropySelect.value = this.entropyFilter;
        }
    }

    /**
     * 绑定DOM事件
     */
    private bindEvents(): void {
        if (!this.container) return;

        // 独立窗口按钮
        const openWindowBtn = this.container.querySelector('#openWindowBtn');
        openWindowBtn?.addEventListener('click', () => this.openInWindow());

        // 搜索模式选择
        const modeOptions = this.container.querySelectorAll('.ss-mode-tab');
        modeOptions.forEach(option => {
            option.addEventListener('click', () => {
                const mode = (option as HTMLElement).dataset.mode;
                if (mode) this.selectMode(mode);
            });
        });

        // 编码下拉菜单
        this.bindDropdownEvents();

        // Toggle 按钮 (正则/大小写)
        this.bindToggleButtons();

        // 预设下拉
        this.bindPresetEvents();

        // 熵值筛选下拉框
        const entropySelect = this.container.querySelector('#entropyFilterSelect') as HTMLSelectElement;
        entropySelect?.addEventListener('change', () => {
            this.entropyFilter = entropySelect.value;
            // 对现有结果进行筛选
            if (this.currentResults) {
                this.applyEntropyFilter();
                this.renderResults();
            }
        });

        // 搜索模式输入清除按钮
        this.bindClearPatternButton();

        // 结果列表点击
        this.bindResultListEvents();

        // 浏览按钮
        const browseBtn = this.container.querySelector('#browseBtnPanel');
        browseBtn?.addEventListener('click', () => this.browseFile());

        // 切换到单文件模式按钮
        const switchToFileBtn = this.container.querySelector('#switchToFileModeBtn');
        switchToFileBtn?.addEventListener('click', () => this.selectMode('file'));

        // 进程选择器下拉菜单
        this.bindProcessDropdown();

        // 刷新进程列表按钮
        const refreshProcessBtn = this.container.querySelector('#refreshProcessBtn');
        refreshProcessBtn?.addEventListener('click', () => this.loadAvailableProcesses());

        // 开始搜索
        const startBtn = this.container.querySelector('#startSearchBtnPanel');
        startBtn?.addEventListener('click', () => this.startSearch());

        // 停止搜索
        const stopBtn = this.container.querySelector('#stopSearchBtnPanel');
        stopBtn?.addEventListener('click', () => this.stopSearch());

        // 导出按钮
        const exportBtn = this.container.querySelector('#exportBtnPanel');
        exportBtn?.addEventListener('click', () => this.exportResults());

        // 提取 IOC 按钮
        const extractIocBtn = this.container.querySelector('#extractIocBtnPanel');
        extractIocBtn?.addEventListener('click', () => this.extractIocFromResults());

        const copyAllBtn = this.container.querySelector('#copyAllBtnPanel');
        copyAllBtn?.addEventListener('click', () => this.copyAllResults());

        // 清空按钮
        const clearBtn = this.container.querySelector('#clearBtnPanel');
        clearBtn?.addEventListener('click', () => this.clearResults());

        // 二次扫描按钮
        const secondaryScanBtn = this.container.querySelector('#secondaryScanBtn');
        secondaryScanBtn?.addEventListener('click', () => this.performSecondaryScan());

        // P0: 排序列头点击
        this.container.querySelectorAll('.ss-sortable').forEach(el => {
            el.addEventListener('click', () => {
                const col = (el as HTMLElement).dataset.sort as SortConfig['column'];
                if (!col) return;
                if (this.sortConfig && this.sortConfig.column === col) {
                    if (this.sortConfig.direction === 'asc') {
                        this.sortConfig.direction = 'desc';
                    } else {
                        this.sortConfig = null; // 第三次点击取消排序
                    }
                } else {
                    this.sortConfig = { column: col, direction: 'asc' };
                }
                this.currentPage = 1;
                this.renderResults();
            });
        });

        // P0: 列过滤输入
        const filterOffset = this.container.querySelector('#filterOffset') as HTMLInputElement;
        const filterContent = this.container.querySelector('#filterContent') as HTMLInputElement;
        const filterEncoding = this.container.querySelector('#filterEncoding') as HTMLInputElement;

        const debounceFilter = () => {
            this.columnFilters = {
                offset: filterOffset?.value || '',
                content: filterContent?.value || '',
                encoding: filterEncoding?.value || '',
            };
            this.currentPage = 1;
            this.renderResults();
        };

        let filterTimer: ReturnType<typeof setTimeout> | null = null;
        const debouncedFilter = () => {
            if (filterTimer) clearTimeout(filterTimer);
            filterTimer = setTimeout(debounceFilter, 200);
        };
        filterOffset?.addEventListener('input', debouncedFilter);
        filterContent?.addEventListener('input', debouncedFilter);
        filterEncoding?.addEventListener('input', debouncedFilter);

        // P0: 标签筛选
        const tagFilterSelect = this.container.querySelector('#tagFilterSelect') as HTMLSelectElement;
        tagFilterSelect?.addEventListener('change', () => {
            this.currentPage = 1;
            this.renderResults();
        });

        // P1-B: 聚类切换
        const clusterToggle = this.container.querySelector('#clusterToggleBtn');
        clusterToggle?.addEventListener('click', () => {
            this.clusterView = !this.clusterView;
            clusterToggle.classList.toggle('active', this.clusterView);
            if (this.clusterView) {
                this.clusters = [];
                this.computeClusters();
            }
            this.renderResults();
        });

        // P2-B: 可视化切换
        const vizToggle = this.container.querySelector('#vizToggleBtn');
        const vizPanel = this.container.querySelector('#vizPanel') as HTMLElement;
        const vizClose = this.container.querySelector('#vizCloseBtn');
        vizToggle?.addEventListener('click', () => {
            this.visualizationVisible = !this.visualizationVisible;
            vizToggle.classList.toggle('active', this.visualizationVisible);
            if (vizPanel) vizPanel.style.display = this.visualizationVisible ? 'block' : 'none';
            if (this.visualizationVisible) this.renderVisualization();
        });
        vizClose?.addEventListener('click', () => {
            this.visualizationVisible = false;
            vizToggle?.classList.remove('active');
            if (vizPanel) vizPanel.style.display = 'none';
        });

        // YARA: 图标按钮加载规则
        const yaraToggleBtn = this.container.querySelector('#yaraLoadRulesBtn');
        yaraToggleBtn?.addEventListener('click', () => this.yaraLoadRules());


        // 会话保存/加载
        const saveSessionBtn = this.container.querySelector('#saveSessionBtn');
        saveSessionBtn?.addEventListener('click', () => this.saveSession());

        const loadSessionBtn = this.container.querySelector('#loadSessionBtn');
        loadSessionBtn?.addEventListener('click', () => this.loadSession());

        // 邻近搜索
        this.bindProximitySearch();

        // 分页按钮
        const prevBtn = this.container.querySelector('#prevPageBtnPanel');
        prevBtn?.addEventListener('click', () => this.prevPage());

        const nextBtn = this.container.querySelector('#nextPageBtnPanel');
        nextBtn?.addEventListener('click', () => this.nextPage());

        // HEX Context 加载按钮
        this.bindContextButtons();

        // 配置变更
        this.bindConfigEvents();

        // 键盘快捷键
        this.bindKeyboardShortcuts();
    }

    /**
     * 绑定键盘快捷键
     */
    private bindKeyboardShortcuts(): void {
        if (!this.container) return;

        // 搜索输入框 Enter 触发搜索
        const searchInput = this.container.querySelector('#searchPatternPanel') as HTMLInputElement;
        searchInput?.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.isSearching) {
                    this.startSearch();
                }
            }
        });

        // 全局 Escape 停止搜索
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && this.isSearching) {
                e.preventDefault();
                this.stopSearch();
                this.showToast('搜索已停止', 'info');
            }
        };
        document.addEventListener('keydown', handleEscape);

        // 结果列表键盘导航：↑↓ 在当前页行间移动并预览
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
            const resultsList = this.container?.querySelector('#resultsListPanel') as HTMLElement | null;
            if (!resultsList || resultsList.offsetParent === null) return; // 列表不可见
            const rows = Array.from(resultsList.querySelectorAll('.ss-result-item'));
            if (rows.length === 0) return;
            e.preventDefault();
            const indices = rows
                .map(r => parseInt(r.getAttribute('data-index') || '-1'))
                .filter(i => i >= 0);
            if (indices.length === 0) return;
            let pos = indices.indexOf(this.kbdIndex);
            if (e.key === 'ArrowDown') {
                pos = pos === -1 ? 0 : Math.min(pos + 1, indices.length - 1);
            } else {
                pos = pos === -1 ? indices.length - 1 : Math.max(pos - 1, 0);
            }
            this.selectResultItem(indices[pos]); // 内部会更新 kbdIndex 与高亮/详情
            const activeRow = resultsList.querySelector(`.ss-result-item[data-index="${indices[pos]}"]`) as HTMLElement | null;
            activeRow?.scrollIntoView({ block: 'nearest' });
        });
    }

    /**
     * 绑定配置变更事件
     */
    private bindConfigEvents(): void {
        if (!this.container) return;

        // 编码选择
        const encodingCheckboxes = this.container.querySelectorAll('.encoding-checkbox');
        encodingCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                this.updateEncodings();
                this.updateEncodingLabel();
            });
        });

        // 搜索选项
        const searchPattern = this.container.querySelector('#searchPatternPanel') as HTMLInputElement;
        searchPattern?.addEventListener('input', (e) => {
            const value = (e.target as HTMLInputElement).value.trim();
            this.searchConfig.search_pattern = value || undefined;
            const clearBtn = this.container?.querySelector('#clearPatternBtn') as HTMLElement;
            if (clearBtn) clearBtn.style.display = value ? 'flex' : 'none';
        });

        // 高级选项
        const minLength = this.container.querySelector('#minLengthPanel') as HTMLInputElement;
        minLength?.addEventListener('change', (e) => {
            this.searchConfig.min_length = parseInt((e.target as HTMLInputElement).value) || 4;
        });

        const maxResults = this.container.querySelector('#maxResultsPanel') as HTMLInputElement;
        maxResults?.addEventListener('change', (e) => {
            this.searchConfig.max_results = parseInt((e.target as HTMLInputElement).value) || 10000;
        });

        // 目标路径
        const targetPath = this.container.querySelector('#targetPathPanel') as HTMLInputElement;
        targetPath?.addEventListener('change', (e) => {
            this.updateTargetPath((e.target as HTMLInputElement).value);
        });
    }

    /**
     * 绑定下拉菜单事件
     */
    private bindDropdownEvents(): void {
        if (!this.container) return;

        const encodingTrigger = this.container.querySelector('#encodingTrigger');
        const encodingMenu = this.container.querySelector('#encodingMenu') as HTMLElement;

        encodingTrigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = encodingMenu?.style.display === 'block';
            this.closeAllDropdowns();
            if (encodingMenu && !isOpen) {
                encodingMenu.style.display = 'block';
            }
        });

        document.addEventListener('click', () => this.closeAllDropdowns());
        encodingMenu?.addEventListener('click', (e) => e.stopPropagation());
    }

    /**
     * 绑定 Toggle 按钮事件
     */
    private bindToggleButtons(): void {
        if (!this.container) return;

        const regexBtn = this.container.querySelector('#useRegexPanel') as HTMLElement;
        regexBtn?.addEventListener('click', () => {
            regexBtn.classList.toggle('active');
            this.searchConfig.use_regex = regexBtn.classList.contains('active');
        });

        const caseBtn = this.container.querySelector('#caseSensitivePanel') as HTMLElement;
        caseBtn?.addEventListener('click', () => {
            caseBtn.classList.toggle('active');
            this.searchConfig.case_sensitive = caseBtn.classList.contains('active');
        });
    }

    // 选中的预设列表
    private selectedPresets: Array<{label: string, pattern: string}> = [];

    /**
     * 绑定预设下拉事件
     */
    private bindPresetEvents(): void {
        if (!this.container) return;

        const presetsTrigger = this.container.querySelector('#presetsTrigger');
        const presetsMenu = this.container.querySelector('#presetsMenu') as HTMLElement;
        const searchInput = this.container.querySelector('#presetsSearchInput') as HTMLInputElement;

        presetsTrigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = presetsMenu?.style.display === 'block';
            this.closeAllDropdowns();
            if (presetsMenu && !isOpen) {
                presetsMenu.style.display = 'block';
                // 聚焦搜索框
                setTimeout(() => searchInput?.focus(), 100);
            }
        });

        presetsMenu?.addEventListener('click', (e) => e.stopPropagation());

        // 预设搜索功能
        searchInput?.addEventListener('input', debounce((e: Event) => {
            this.filterPresets((e.target as HTMLInputElement).value);
        }, 200));

        // 预设 checkbox 多选
        const presetCheckboxes = this.container.querySelectorAll('.ss-preset-checkbox');
        presetCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const item = (checkbox as HTMLElement).closest('.ss-preset-item') as HTMLElement;
                const pattern = item?.dataset.regex || '';
                const label = item?.dataset.label || '';

                if ((checkbox as HTMLInputElement).checked) {
                    // 添加到选中列表
                    if (!this.selectedPresets.find(p => p.pattern === pattern)) {
                        this.selectedPresets.push({ label, pattern });
                    }
                } else {
                    // 从选中列表移除
                    this.selectedPresets = this.selectedPresets.filter(p => p.pattern !== pattern);
                }

                this.updateSelectedPresetsTags();
                this.updateSearchPatternFromPresets();
            });
        });

        // 点击预设项时切换 checkbox
        const presetItems = this.container.querySelectorAll('.ss-preset-item');
        presetItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // 如果点击的是 checkbox 本身，不处理
                if ((e.target as HTMLElement).classList.contains('ss-preset-checkbox')) return;

                const checkbox = item.querySelector('.ss-preset-checkbox') as HTMLInputElement;
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    }

    /**
     * 更新选中预设的标签显示
     */
    private updateSelectedPresetsTags(): void {
        if (!this.container) return;

        const container = this.container.querySelector('#selectedPresetsContainer');
        if (!container) return;

        container.innerHTML = this.selectedPresets.map((preset, idx) => `
            <span class="ss-preset-tag" data-index="${idx}">
                <span class="ss-preset-tag-label" title="${preset.pattern}">${preset.label}</span>
                <button class="ss-preset-tag-remove" data-pattern="${preset.pattern.replace(/"/g, '&quot;')}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </span>
        `).join('');

        // 绑定删除按钮事件
        container.querySelectorAll('.ss-preset-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const pattern = (btn as HTMLElement).dataset.pattern || '';
                this.removeSelectedPreset(pattern);
            });
        });

        // 更新清空按钮显示
        const clearBtn = this.container.querySelector('#clearPatternBtn') as HTMLElement;
        if (clearBtn) {
            clearBtn.style.display = this.selectedPresets.length > 0 ? 'flex' : 'none';
        }
    }

    /**
     * 移除选中的预设
     */
    private removeSelectedPreset(pattern: string): void {
        this.selectedPresets = this.selectedPresets.filter(p => p.pattern !== pattern);

        // 取消对应 checkbox
        if (this.container) {
            const item = this.container.querySelector(`.ss-preset-item[data-regex="${pattern.replace(/"/g, '\\"')}"]`);
            const checkbox = item?.querySelector('.ss-preset-checkbox') as HTMLInputElement;
            if (checkbox) checkbox.checked = false;
        }

        this.updateSelectedPresetsTags();
        this.updateSearchPatternFromPresets();
    }

    /**
     * 根据选中的预设更新搜索模式
     */
    private updateSearchPatternFromPresets(): void {
        if (!this.container) return;

        const searchInput = this.container.querySelector('#searchPatternPanel') as HTMLInputElement;

        if (this.selectedPresets.length === 0) {
            // 没有选中预设，清空输入框
            if (searchInput) searchInput.value = '';
            this.searchConfig.search_pattern = '';
        } else if (this.selectedPresets.length === 1) {
            // 单个预设，直接使用
            const pattern = this.selectedPresets[0].pattern;
            if (searchInput) searchInput.value = pattern;
            this.searchConfig.search_pattern = pattern;
        } else {
            // 多个预设，用 | 连接（正则OR）
            const combinedPattern = this.selectedPresets.map(p => `(${p.pattern})`).join('|');
            if (searchInput) searchInput.value = combinedPattern;
            this.searchConfig.search_pattern = combinedPattern;
        }

        // 确保正则模式开启
        if (this.selectedPresets.length > 0) {
            const regexBtn = this.container.querySelector('#useRegexPanel') as HTMLElement;
            if (regexBtn && !regexBtn.classList.contains('active')) {
                regexBtn.classList.add('active');
                this.searchConfig.use_regex = true;
            }
        }
    }

    /**
     * 过滤预设
     */
    private filterPresets(query: string): void {
        if (!this.container) return;

        const lowerQuery = query.toLowerCase().trim();
        const groups = this.container.querySelectorAll('.ss-preset-group');

        groups.forEach(group => {
            const items = group.querySelectorAll('.ss-preset-item');
            let hasVisibleItems = false;

            items.forEach(item => {
                const name = item.querySelector('.ss-preset-name')?.textContent?.toLowerCase() || '';
                const pattern = item.querySelector('.ss-preset-pattern')?.textContent?.toLowerCase() || '';

                const isMatch = !lowerQuery || name.includes(lowerQuery) || pattern.includes(lowerQuery);

                (item as HTMLElement).style.display = isMatch ? 'block' : 'none';
                if (isMatch) hasVisibleItems = true;
            });

            (group as HTMLElement).style.display = hasVisibleItems ? 'block' : 'none';
        });
    }

    /**
     * 绑定清除搜索模式按钮
     */
    private bindClearPatternButton(): void {
        if (!this.container) return;

        const clearBtn = this.container.querySelector('#clearPatternBtn');
        clearBtn?.addEventListener('click', () => {
            const searchInput = this.container?.querySelector('#searchPatternPanel') as HTMLInputElement;
            if (searchInput) {
                searchInput.value = '';
                this.searchConfig.search_pattern = undefined;
            }
            (clearBtn as HTMLElement).style.display = 'none';
        });
    }

    /**
     * 绑定结果列表事件
     */
    private bindResultListEvents(): void {
        if (!this.container) return;

        const resultsList = this.container.querySelector('#resultsListPanel');
        resultsList?.addEventListener('click', (e) => {
            // 行内"复制内容"快捷按钮（hover 显示），优先处理并阻止触发行选中
            const copyBtn = (e.target as HTMLElement).closest('.ss-row-copy');
            if (copyBtn) {
                e.stopPropagation();
                const idx = parseInt(copyBtn.getAttribute('data-copy-index') || '0');
                const str = this.getSortedFilteredResults()[idx];
                if (str) {
                    navigator.clipboard.writeText(str.content)
                        .then(() => this.showToast('已复制', 'success'))
                        .catch(() => this.showToast('复制失败', 'error'));
                }
                return;
            }
            const target = (e.target as HTMLElement).closest('.ss-result-item');
            if (target) {
                const index = parseInt(target.getAttribute('data-index') || '0');
                this.selectResultItem(index);
            }
        });

        // 右键菜单
        resultsList?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const target = (e.target as HTMLElement).closest('.ss-result-item');
            if (target) {
                const index = parseInt(target.getAttribute('data-index') || '0');
                this.showContextMenu(e as MouseEvent, index);
            }
        });

        // 点击其他区域关闭右键菜单
        document.addEventListener('click', () => this.hideContextMenu());
    }

    /**
     * 显示右键菜单
     */
    private showContextMenu(e: MouseEvent, index: number): void {
        this.hideContextMenu();

        const strings = this.getSortedFilteredResults();
        const str = strings[index];
        if (!str) return;

        // 检查是否为内存镜像模式
        const isImageMode = this.getCurrentMode() === 'image';
        const tagKey = this.getTagKey(str);
        const currentTags = this.taggedResults.get(tagKey) || [];
        const isBookmarked = this.bookmarks.some(b => b.offset === str.offset);

        // 标签子菜单项
        const tagItems = ['可疑', 'IOC', '良性', '证据', '关键线索'].map(tag => {
            const checked = currentTags.includes(tag) ? ' &#10003;' : '';
            return `<div class="ss-context-menu-item" data-action="toggle-tag" data-tag="${tag}">
                <span>${tag}${checked}</span>
            </div>`;
        }).join('');

        const menu = document.createElement('div');
        menu.className = 'ss-context-menu';
        menu.id = 'ssContextMenu';
        menu.innerHTML = `
            <div class="ss-context-menu-item" data-action="copy-value">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>复制内容</span>
            </div>
            <div class="ss-context-menu-item" data-action="copy-offset">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                <span>复制偏移量</span>
            </div>
            <div class="ss-context-menu-item" data-action="copy-hex-offset">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                <span>复制偏移量 (HEX)</span>
            </div>
            <div class="ss-context-menu-item" data-action="open-hex">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                <span>在 Hex 查看器中定位</span>
            </div>
            <div class="ss-context-menu-divider"></div>
            <div class="ss-context-menu-item" data-action="copy-all">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>复制全部信息</span>
            </div>
            <div class="ss-context-menu-divider"></div>
            <div class="ss-context-submenu">
                <div class="ss-context-menu-item">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                    <span>标记为...</span>
                    <span style="margin-left:auto;font-size:10px">&#9654;</span>
                </div>
                <div class="ss-context-submenu-content">
                    ${tagItems}
                    <div class="ss-context-menu-divider"></div>
                    <div class="ss-context-menu-item" data-action="custom-tag">
                        <span>自定义标签...</span>
                    </div>
                    ${currentTags.length > 0 ? `
                    <div class="ss-context-menu-divider"></div>
                    <div class="ss-context-menu-item" data-action="clear-tags" style="color:#ef4444">
                        <span>清除所有标签</span>
                    </div>` : ''}
                </div>
            </div>
            <div class="ss-context-menu-item" data-action="toggle-bookmark">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>${isBookmarked ? '取消收藏' : '收藏此发现'}</span>
            </div>
            ${isImageMode ? `
            <div class="ss-context-menu-divider"></div>
            <div class="ss-context-menu-item" data-action="locate-process">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
                <span>定位字符串所在进程</span>
            </div>
            ` : ''}
        `;

        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        document.body.appendChild(menu);

        // 绑定菜单项点击
        menu.querySelectorAll('.ss-context-menu-item').forEach(item => {
            item.addEventListener('click', async () => {
                const action = (item as HTMLElement).dataset.action;
                if (action === 'toggle-tag') {
                    const tag = (item as HTMLElement).dataset.tag || '';
                    this.toggleTag(str, tag);
                    this.hideContextMenu();
                    this.renderResults();
                } else if (action === 'custom-tag') {
                    this.hideContextMenu();
                    const tag = await showPrompt({ title: '添加标签', placeholder: '输入自定义标签' });
                    if (tag && tag.trim()) {
                        this.addTag(str, tag.trim());
                        this.renderResults();
                    }
                } else if (action === 'clear-tags') {
                    this.taggedResults.delete(tagKey);
                    this.hideContextMenu();
                    this.renderResults();
                } else if (action === 'toggle-bookmark') {
                    this.toggleBookmark(str);
                    this.hideContextMenu();
                    this.renderResults();
                } else {
                    await this.handleContextMenuAction(action || '', str);
                    this.hideContextMenu();
                }
            });
        });

        // 确保菜单不超出屏幕
        requestAnimationFrame(() => {
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                menu.style.left = `${window.innerWidth - rect.width - 10}px`;
            }
            if (rect.bottom > window.innerHeight) {
                menu.style.top = `${window.innerHeight - rect.height - 10}px`;
            }
        });
    }

    /**
     * 切换标签
     */
    private toggleTag(str: FoundString, tag: string): void {
        const key = this.getTagKey(str);
        const tags = this.taggedResults.get(key) || [];
        const idx = tags.indexOf(tag);
        if (idx >= 0) {
            tags.splice(idx, 1);
        } else {
            tags.push(tag);
        }
        if (tags.length > 0) {
            this.taggedResults.set(key, tags);
        } else {
            this.taggedResults.delete(key);
        }
        this.tagVersion++;
    }

    /**
     * 添加标签
     */
    private addTag(str: FoundString, tag: string): void {
        const key = this.getTagKey(str);
        const tags = this.taggedResults.get(key) || [];
        if (!tags.includes(tag)) {
            tags.push(tag);
            this.taggedResults.set(key, tags);
            this.tagVersion++;
        }
    }

    /**
     * 切换收藏
     */
    private toggleBookmark(str: FoundString): void {
        const idx = this.bookmarks.findIndex(b => b.offset === str.offset);
        if (idx >= 0) {
            this.bookmarks.splice(idx, 1);
        } else {
            this.bookmarks.push({
                offset: str.offset,
                content: str.content.substring(0, 200),
                encoding: str.encoding,
                note: '',
                timestamp: Date.now(),
            });
        }
        this.tagVersion++;
    }

    /**
     * 隐藏右键菜单
     */
    private hideContextMenu(): void {
        const menu = document.getElementById('ssContextMenu');
        menu?.remove();
    }

    /**
     * 处理右键菜单操作
     */
    private async handleContextMenuAction(action: string, str: any): Promise<void> {
        // 处理定位进程操作
        if (action === 'locate-process') {
            await this.performPhys2Virt(str.offset);
            return;
        }

        // 在 Hex 查看器中定位当前偏移
        if (action === 'open-hex') {
            await this.openInHexViewer(str.offset);
            return;
        }

        let textToCopy = '';

        switch (action) {
            case 'copy-value':
                textToCopy = str.content;
                break;
            case 'copy-offset':
                textToCopy = str.offset.toString();
                break;
            case 'copy-hex-offset':
                textToCopy = `0x${str.offset.toString(16).toUpperCase()}`;
                break;
            case 'copy-all':
                textToCopy = `偏移量: 0x${str.offset.toString(16).toUpperCase()}\n编码: ${str.encoding}\n长度: ${str.byte_length}b\n内容: ${str.content}`;
                break;
        }

        if (textToCopy) {
            try {
                await navigator.clipboard.writeText(textToCopy);
                this.showToast('已复制', 'success');
            } catch (e) {
                console.error('复制失败:', e);
                this.showToast('复制失败', 'error');
            }
        }
    }

    /**
     * 从当前结果（过滤后优先）提取 IOC：打开 IOC 提取窗口并注入文本
     */
    private async extractIocFromResults(): Promise<void> {
        const strings = this.filteredResults || this.currentResults?.strings || [];
        if (strings.length === 0) {
            this.showToast('当前无结果可提取', 'error');
            return;
        }
        const text = strings.map((s: any) => s.content).join('\n');
        try {
            await invoke('open_ioc_extractor_window');
            // 等待窗口初始化并注册监听后再注入文本
            const { emit } = await import('@tauri-apps/api/event');
            setTimeout(() => { void emit('ioc-input-text', text); }, 800);
            this.showToast('已发送到 IOC 提取', 'success');
        } catch (e) {
            console.error('打开 IOC 提取失败:', e);
            this.showToast('打开 IOC 提取失败', 'error');
        }
    }

    /**
     * 在 Hex 查看器中打开当前搜索源，并定位到指定物理偏移
     */
    private async openInHexViewer(offset: number): Promise<void> {
        try {
            // 优先使用当前选中的文件；否则回退到当前加载的内存镜像
            let sourcePath = this.currentSelectedFilePath || '';
            if (!sourcePath) {
                try {
                    const settings = await loadAppSettings();
                    sourcePath = settings?.current_image_path || '';
                } catch { /* ignore */ }
            }
            if (!sourcePath) {
                this.showToast('无法确定源文件路径', 'error');
                return;
            }
            await invoke('open_hex_viewer_window', { filePath: sourcePath, offset });
        } catch (e) {
            console.error('打开 Hex 查看器失败:', e);
            this.showToast('打开 Hex 查看器失败', 'error');
        }
    }

    /**
     * 执行 Phys2Virt 定位进程操作
     */
    private async performPhys2Virt(offset: number): Promise<void> {
        const offsetHex = `0x${offset.toString(16).toUpperCase().padStart(8, '0')}`;

        try {
            console.log('[Phys2Virt] 开始定位进程');
            console.log('[Phys2Virt] 原始偏移量:', offset);
            console.log('[Phys2Virt] 十六进制偏移量:', offsetHex);

            // 显示加载模态框
            this.showPhys2VirtModal('loading', offsetHex, '正在定位进程...');

            // 1. 使用 cmd /C echo 命令写入偏移量到 phys.txt，命令执行完成后直接读取结果
            const echoCommand = `cmd /C "echo ${offsetHex} > ${mountPath('misc', 'phys2virt', 'phys.txt')}"`;
            console.log('[Phys2Virt] 执行命令:', echoCommand);

            const writeResult = await invoke('execute_plugin_command', {
                command: echoCommand
            });
            console.log('[Phys2Virt] 写入命令执行结果:', writeResult);

            // 2. 命令执行完成后直接读取结果
            let result = '';
            try {
                result = await invoke<string>('read_file', {
                    path: mountPath('misc', 'phys2virt', 'virt.txt')
                });
                console.log('[Phys2Virt] 读取 virt.txt 结果:', result ? `成功 (${result.length} 字符)` : '文件为空');
            } catch (e) {
                console.error('[Phys2Virt] 读取 virt.txt 失败:', e);
                this.showPhys2VirtModal('error', offsetHex, `读取结果失败: ${e}`);
                return;
            }

            if (!result || !result.trim()) {
                console.error('[Phys2Virt] virt.txt 为空或无内容');
                this.showPhys2VirtModal('error', offsetHex, '未能获取定位结果（文件为空）');
                return;
            }

            // 3. 解析结果并关联进程名称
            console.log('[Phys2Virt] 成功获取结果:', result.trim());
            const enrichedResult = await this.enrichPhys2VirtResult(result.trim());
            console.log('[Phys2Virt] 关联进程名称后的结果:', enrichedResult);

            this.showPhys2VirtModal('success', offsetHex, result.trim(), enrichedResult);

            // 4. 生成 txt 文件到 output 目录
            await this.generatePhys2VirtTxtFile(offset, result.trim(), enrichedResult);

        } catch (error) {
            console.error('Phys2Virt 失败:', error);
            this.showPhys2VirtModal('error', offsetHex, `操作失败: ${error}`);
        }
    }

    /**
     * 延迟函数
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 解析 virt.txt 结果并关联进程名称
     */
    private async enrichPhys2VirtResult(rawResult: string): Promise<Array<{pid: string, virtualAddr: string, processName: string}>> {
        const lines = rawResult.trim().split('\n').filter(line => line.trim());
        const results: Array<{pid: string, virtualAddr: string, processName: string}> = [];

        // 读取 process.csv 获取 PID 到进程名称的映射
        const processMap = await this.loadProcessMap();

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
                const pid = parts[0];
                const virtualAddr = parts[1];
                const processName = processMap.get(pid) || '未知进程';

                results.push({
                    pid,
                    virtualAddr,
                    processName
                });
            }
        }

        return results;
    }

    /**
     * 解析 CSV 行（支持引号包裹的字段）
     */
    private parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    /**
     * 加载 process.csv 获取 PID 到进程名称的映射
     */
    private async loadProcessMap(): Promise<Map<string, string>> {
        const processMap = new Map<string, string>();

        try {
            const settings = await loadAppSettings();
            const outputPath = settings?.output_path || '';

            if (!outputPath) {
                console.warn('[Phys2Virt] 未设置 output 路径，无法读取 process.csv');
                return processMap;
            }

            // 尝试多个可能的路径
            const possiblePaths = [
                `${outputPath}\\process.csv`,
                `${outputPath}\\forensic\\csv\\process.csv`,
                `${outputPath}\\csv\\process.csv`
            ];

            let csvContent = '';
            let foundPath = '';

            for (const path of possiblePaths) {
                try {
                    console.log('[Phys2Virt] 尝试读取 process.csv:', path);
                    csvContent = await invoke<string>('read_file', {
                        path: path
                    });
                    foundPath = path;
                    console.log('[Phys2Virt] 成功读取 process.csv:', foundPath);
                    break;
                } catch (e) {
                    console.log('[Phys2Virt] 路径不存在，尝试下一个:', path);
                }
            }

            if (!csvContent) {
                console.warn('[Phys2Virt] 所有路径都未找到 process.csv');
                return processMap;
            }

            // 解析 CSV（支持引号包裹的字段）
            const lines = csvContent.split('\n');
            let pidIndex = -1;
            let nameIndex = -1;

            // 查找 PID 和 Name 列的索引
            if (lines.length > 0) {
                const headers = this.parseCSVLine(lines[0]);
                pidIndex = headers.findIndex(h => h.toLowerCase() === 'pid');
                nameIndex = headers.findIndex(h => h.toLowerCase() === 'name');

                console.log('[Phys2Virt] CSV 列索引 - PID:', pidIndex, 'Name:', nameIndex);
                console.log('[Phys2Virt] CSV 表头:', headers);
            }

            if (pidIndex === -1 || nameIndex === -1) {
                console.warn('[Phys2Virt] process.csv 中未找到 PID 或 Name 列');
                return processMap;
            }

            // 解析数据行
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const columns = this.parseCSVLine(line);
                if (columns.length > Math.max(pidIndex, nameIndex)) {
                    const pid = columns[pidIndex].trim();
                    const name = columns[nameIndex].trim();
                    if (pid && name) {
                        processMap.set(pid, name);
                    }
                }
            }

            console.log(`[Phys2Virt] 成功加载 ${processMap.size} 个进程映射`);

        } catch (error) {
            console.error('[Phys2Virt] 读取 process.csv 失败:', error);
        }

        return processMap;
    }

    /**
     * 渲染 Phys2Virt 结果表格
     */
    private renderPhys2VirtResult(
        enrichedData: Array<{pid: string, virtualAddr: string, processName: string}> | undefined,
        rawContent: string
    ): string {
        if (!enrichedData || enrichedData.length === 0) {
            return `<pre>${this.escapeHtml(rawContent)}</pre>`;
        }

        return `
            <div class="ss-phys2virt-table-wrapper">
                <table class="ss-phys2virt-table">
                    <thead>
                        <tr>
                            <th>PID</th>
                            <th>进程名称</th>
                            <th>虚拟地址</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${enrichedData.map(item => `
                            <tr>
                                <td><code>${this.escapeHtml(item.pid)}</code></td>
                                <td><strong>${this.escapeHtml(item.processName)}</strong></td>
                                <td><code>${this.escapeHtml(item.virtualAddr)}</code></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * 显示 Phys2Virt 模态框
     */
    private showPhys2VirtModal(
        status: 'loading' | 'success' | 'error',
        offset: string,
        content: string,
        enrichedData?: Array<{pid: string, virtualAddr: string, processName: string}>
    ): void {
        // 移除旧的模态框
        const existingModal = document.getElementById('phys2virtModal');
        existingModal?.remove();

        const modal = document.createElement('div');
        modal.id = 'phys2virtModal';
        modal.className = 'ss-phys2virt-modal-overlay';

        let statusIcon = '';
        let statusClass = '';

        switch (status) {
            case 'loading':
                statusIcon = `<div class="ss-phys2virt-spinner"></div>`;
                statusClass = 'loading';
                break;
            case 'success':
                statusIcon = `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#22c55e" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
                statusClass = 'success';
                break;
            case 'error':
                statusIcon = `<svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
                statusClass = 'error';
                break;
        }

        modal.innerHTML = `
            <div class="ss-phys2virt-modal ${statusClass}">
                <div class="ss-phys2virt-header">
                    <h3>定位进程</h3>
                    ${status !== 'loading' ? `<button class="ss-phys2virt-close" id="closePhys2VirtModal">&times;</button>` : ''}
                </div>
                <div class="ss-phys2virt-body">
                    <div class="ss-phys2virt-icon">${statusIcon}</div>
                    <div class="ss-phys2virt-offset">物理偏移: <code>${offset}</code></div>
                    <div class="ss-phys2virt-content">
                        ${status === 'loading' ? `<p>${content}</p>` : this.renderPhys2VirtResult(enrichedData, content)}
                    </div>
                </div>
                ${status === 'success' ? `
                <div class="ss-phys2virt-footer">
                    <button class="ss-phys2virt-btn" id="copyPhys2VirtResult">复制结果</button>
                </div>
                ` : ''}
            </div>
        `;

        document.body.appendChild(modal);

        // 绑定关闭按钮
        const closeBtn = modal.querySelector('#closePhys2VirtModal');
        closeBtn?.addEventListener('click', () => modal.remove());

        // 绑定复制按钮
        const copyBtn = modal.querySelector('#copyPhys2VirtResult');
        copyBtn?.addEventListener('click', async () => {
            try {
                // 复制原始结果
                await navigator.clipboard.writeText(content);
                (copyBtn as HTMLButtonElement).textContent = '已复制!';
                setTimeout(() => {
                    (copyBtn as HTMLButtonElement).textContent = '复制结果';
                }, 1500);
            } catch (e) {
                console.error('复制失败:', e);
            }
        });

        // 点击遮罩层关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal && status !== 'loading') {
                modal.remove();
            }
        });
    }

    /**
     * 生成 Phys2Virt 结果的 txt 文件
     */
    private async generatePhys2VirtTxtFile(
        offset: number,
        result: string,
        enrichedData?: Array<{pid: string, virtualAddr: string, processName: string}>
    ): Promise<void> {
        try {
            const settings = await loadAppSettings();
            const outputPath = settings?.output_path || '';

            if (!outputPath) {
                console.warn('未设置 output 路径，无法生成 txt 文件');
                return;
            }

            const offsetHex = `0x${offset.toString(16).toUpperCase()}`;
            const fileName = `${offsetHex}_phys2virt.txt`;
            const filePath = `${outputPath}\\${fileName}`;

            // 生成文本内容
            const txtContent = this.generatePhys2VirtTxtContent(offset, offsetHex, result, enrichedData);

            await invoke('write_file', {
                path: filePath,
                content: txtContent
            });

            console.log(`Phys2Virt txt 文件已生成: ${filePath}`);
        } catch (error) {
            console.error('生成 txt 文件失败:', error);
        }
    }

    /**
     * 生成 Phys2Virt txt 文件内容
     */
    private generatePhys2VirtTxtContent(
        offset: number,
        offsetHex: string,
        result: string,
        enrichedData?: Array<{pid: string, virtualAddr: string, processName: string}>
    ): string {
        const timestamp = new Date().toISOString();

        let content = `Phys2Virt 定位结果
========================================
生成时间: ${timestamp}
物理偏移: ${offsetHex} (${offset})
========================================

`;

        if (enrichedData && enrichedData.length > 0) {
            content += `定位结果（关联进程名称）:\n`;
            content += `----------------------------------------\n`;
            content += `PID\t\t进程名称\t\t虚拟地址\n`;
            content += `----------------------------------------\n`;
            enrichedData.forEach(item => {
                content += `${item.pid}\t\t${item.processName}\t\t${item.virtualAddr}\n`;
            });
            content += `----------------------------------------\n\n`;
        }

        content += `原始结果:\n`;
        content += `----------------------------------------\n`;
        content += `${result}\n`;
        content += `----------------------------------------\n`;

        return content;
    }

    // 当前视图模式: 'hex' | 'string'
    private contextViewMode: 'hex' | 'string' = 'hex';
    // 当前编码
    private contextEncoding: string = 'ascii';
    // 缓存当前加载的字节数据
    private currentContextBytes: number[] = [];
    private currentContextStartOffset: number = 0;

    /**
     * 绑定 HEX Context 加载按钮
     */
    private bindContextButtons(): void {
        if (!this.container) return;

        const loadBeforeBtn = this.container.querySelector('#loadContextBeforeBtn');
        loadBeforeBtn?.addEventListener('click', () => this.loadHexContext('before'));

        const loadAfterBtn = this.container.querySelector('#loadContextAfterBtn');
        loadAfterBtn?.addEventListener('click', () => this.loadHexContext('after'));

        // 收缩/展开字符串内容按钮
        const toggleValueBtn = this.container.querySelector('#toggleValueBtn');
        toggleValueBtn?.addEventListener('click', () => this.toggleDetailValue());

        // 视图切换按钮
        const hexViewBtn = this.container.querySelector('#hexViewBtn');
        const stringViewBtn = this.container.querySelector('#stringViewBtn');

        hexViewBtn?.addEventListener('click', () => this.switchContextView('hex'));
        stringViewBtn?.addEventListener('click', () => this.switchContextView('string'));

        // 编码选择
        const encodingSelect = this.container.querySelector('#contextEncodingSelect') as HTMLSelectElement;
        encodingSelect?.addEventListener('change', () => {
            this.contextEncoding = encodingSelect.value;
            // 如果当前是字符串视图，重新渲染
            if (this.contextViewMode === 'string' && this.currentContextBytes.length > 0) {
                const hexContent = this.container?.querySelector('#hexContextContent') as HTMLElement;
                if (hexContent) {
                    this.renderStringContext(hexContent, this.currentContextStartOffset, this.currentContextBytes);
                }
            }
        });
    }

    /**
     * 切换上下文视图模式
     */
    private switchContextView(mode: 'hex' | 'string'): void {
        if (!this.container || this.contextViewMode === mode) return;

        this.contextViewMode = mode;

        // 更新按钮状态
        const hexViewBtn = this.container.querySelector('#hexViewBtn');
        const stringViewBtn = this.container.querySelector('#stringViewBtn');

        hexViewBtn?.classList.toggle('active', mode === 'hex');
        stringViewBtn?.classList.toggle('active', mode === 'string');

        // 重新渲染当前数据
        const hexContent = this.container.querySelector('#hexContextContent') as HTMLElement;
        if (hexContent && this.currentContextBytes.length > 0) {
            if (mode === 'hex') {
                this.renderHexContext(hexContent, this.currentContextStartOffset, this.currentContextBytes);
            } else {
                this.renderStringContext(hexContent, this.currentContextStartOffset, this.currentContextBytes);
            }
        }
    }

    /**
     * 渲染字符串视图上下文
     */
    private renderStringContext(container: HTMLElement, startOffset: number, bytes: number[]): void {
        const encoding = this.contextEncoding;
        let content = '';

        // 根据编码解码字节
        if (encoding === 'ascii') {
            content = this.decodeAsAscii(bytes, startOffset);
        } else if (encoding === 'utf-8') {
            content = this.decodeWithTextDecoder(bytes, startOffset, 'utf-8');
        } else if (encoding === 'utf-16le') {
            content = this.decodeWithTextDecoder(bytes, startOffset, 'utf-16le');
        } else if (encoding === 'utf-16be') {
            content = this.decodeWithTextDecoder(bytes, startOffset, 'utf-16be');
        } else if (encoding === 'gbk') {
            content = this.decodeWithTextDecoder(bytes, startOffset, 'gbk');
        } else {
            content = this.decodeAsAscii(bytes, startOffset);
        }

        container.innerHTML = `<div class="ss-string-view">${content}</div>`;
    }

    /**
     * ASCII 解码
     */
    private decodeAsAscii(bytes: number[], startOffset: number): string {
        let content = '';
        let currentLine = '';
        let lineOffset = startOffset;
        const bytesPerLine = 64;

        for (let i = 0; i < bytes.length; i++) {
            const byte = bytes[i];
            if (byte >= 32 && byte <= 126) {
                currentLine += String.fromCharCode(byte);
            } else if (byte === 10) {
                currentLine += '↵';
            } else if (byte === 13) {
                currentLine += '←';
            } else if (byte === 9) {
                currentLine += '→';
            } else if (byte === 0) {
                currentLine += '·';
            } else {
                currentLine += '.';
            }

            if ((i + 1) % bytesPerLine === 0 || i === bytes.length - 1) {
                const offsetHex = lineOffset.toString(16).toUpperCase().padStart(8, '0');
                content += `<div class="ss-string-row">`;
                content += `<span class="ss-string-offset">0x${offsetHex}</span>`;
                content += `<span class="ss-string-content">${this.escapeHtml(currentLine)}</span>`;
                content += `</div>`;
                lineOffset += bytesPerLine;
                currentLine = '';
            }
        }
        return content;
    }

    /**
     * 使用 TextDecoder 解码
     */
    private decodeWithTextDecoder(bytes: number[], startOffset: number, encoding: string): string {
        let content = '';
        const charsPerLine = 64;
        const uint8Array = new Uint8Array(bytes);

        try {
            const decoder = new TextDecoder(encoding, { fatal: false });
            const decoded = decoder.decode(uint8Array);

            // 按行分割显示
            let lineOffset = startOffset;
            for (let i = 0; i < decoded.length; i += charsPerLine) {
                const lineChars = decoded.slice(i, i + charsPerLine);
                // 替换不可见字符
                let displayLine = '';
                for (const char of lineChars) {
                    const code = char.charCodeAt(0);
                    if (code === 10) {
                        displayLine += '↵';
                    } else if (code === 13) {
                        displayLine += '←';
                    } else if (code === 9) {
                        displayLine += '→';
                    } else if (code === 0) {
                        displayLine += '·';
                    } else if (code < 32 || (code >= 0x7F && code < 0xA0)) {
                        displayLine += '.';
                    } else {
                        displayLine += char;
                    }
                }

                const offsetHex = lineOffset.toString(16).toUpperCase().padStart(8, '0');
                content += `<div class="ss-string-row">`;
                content += `<span class="ss-string-offset">0x${offsetHex}</span>`;
                content += `<span class="ss-string-content">${this.escapeHtml(displayLine)}</span>`;
                content += `</div>`;

                // 估算字节偏移（对于多字节编码不精确，但足够显示用）
                lineOffset += encoding.startsWith('utf-16') ? charsPerLine * 2 : charsPerLine;
            }
        } catch (e) {
            content = `<div class="ss-string-row"><span class="ss-string-content" style="color:#ef4444;">解码失败: ${encoding}</span></div>`;
        }

        return content;
    }

    /**
     * 切换字符串内容的收缩/展开状态
     */
    private toggleDetailValue(): void {
        if (!this.container) return;

        const detailValue = this.container.querySelector('#detailValue');
        const collapseIcon = this.container.querySelector('.ss-collapse-icon');

        if (detailValue) {
            detailValue.classList.toggle('collapsed');
        }
        if (collapseIcon) {
            collapseIcon.classList.toggle('rotated');
        }
    }

    /**
     * 关闭所有下拉菜单
     */
    private closeAllDropdowns(): void {
        if (!this.container) return;
        const menus = this.container.querySelectorAll('.ss-dropdown-menu');
        menus.forEach(menu => {
            (menu as HTMLElement).style.display = 'none';
        });
    }

    /**
     * 更新编码标签显示
     */
    private updateEncodingLabel(): void {
        if (!this.container) return;
        const count = this.container.querySelectorAll('.encoding-checkbox:checked').length;
        const label = this.container.querySelector('.ss-encoding-label');
        const countEl = this.container.querySelector('.ss-encoding-count');
        if (label) label.textContent = `${count} 编码`;
        if (countEl) countEl.textContent = `${count} 选定`;
    }

    /**
     * 设置Tauri事件监听
     */
    private async setupTauriEventListeners(): Promise<void> {
        const unlistenProgress = await listen('string-search-progress', (event: any) => {
            if (!this.isSearching) return;
            this.updateProgress(event.payload);
        });
        this.unlisteners.push(unlistenProgress);

        const unlistenCompleted = await listen('string-search-completed', (event: any) => {
            this.handleSearchCompleted(event.payload);
        });
        this.unlisteners.push(unlistenCompleted);

        const unlistenError = await listen('string-search-error', (event: any) => {
            this.handleSearchError(event.payload);
        });
        this.unlisteners.push(unlistenError);

        // 流式批次结果（搜索过程中每个 chunk 完成后推送）
        const unlistenBatch = await listen<FoundString[]>('string-search-batch', (event) => {
            if (!this.isSearching) return;
            this.handleSearchBatch(event.payload);
        });
        this.unlisteners.push(unlistenBatch);
    }

    /**
     * 加载初始镜像路径并更新UI
     */
    private async loadInitialImagePath(): Promise<void> {
        try {
            const settings = await loadAppSettings();
            const imagePath = settings?.current_image_path || '';
            this.updateImageStatus(imagePath);
            if (imagePath) {
                this.searchConfig.mode = { ImageSearch: { image_path: imagePath } };
            }
        } catch (error) {
            console.warn('无法获取当前镜像路径:', error);
            this.updateImageStatus('');
        }
    }

    /**
     * 更新镜像状态显示
     */
    private updateImageStatus(imagePath: string): void {
        if (!this.container) return;

        const imageInfo = this.container.querySelector('#imageInfoDisplay');
        const imageLabel = this.container.querySelector('#imagePathLabel');
        const switchBtn = this.container.querySelector('#switchToFileModeBtn') as HTMLElement;

        if (imagePath) {
            imageInfo?.classList.remove('no-image');
            if (imageLabel) {
                const fileName = imagePath.split(/[/\\]/).pop() || imagePath;
                imageLabel.textContent = fileName;
                imageLabel.setAttribute('title', imagePath);
            }
            if (switchBtn) switchBtn.style.display = 'none';
        } else {
            imageInfo?.classList.add('no-image');
            if (imageLabel) {
                imageLabel.textContent = '未加载内存镜像，请切换到单文件模式';
            }
            if (switchBtn) switchBtn.style.display = 'inline-flex';
        }
    }

    /**
     * 选择搜索模式
     */
    private async selectMode(mode: string): Promise<void> {
        if (!this.container) return;

        const modeOptions = this.container.querySelectorAll('.ss-mode-tab');
        modeOptions.forEach(option => {
            const optionMode = (option as HTMLElement).dataset.mode;
            option.classList.toggle('active', optionMode === mode);
        });

        // 获取各个输入组
        const pathInputGroup = this.container.querySelector('#pathInputGroup') as HTMLElement;
        const imageStatusGroup = this.container.querySelector('#imageStatusGroup') as HTMLElement;
        const processInputGroup = this.container.querySelector('#processInputGroup') as HTMLElement;
        const targetPathInput = this.container.querySelector('#targetPathPanel') as HTMLInputElement;

        // 隐藏所有输入组
        if (pathInputGroup) pathInputGroup.style.display = 'none';
        if (imageStatusGroup) imageStatusGroup.style.display = 'none';
        if (processInputGroup) processInputGroup.style.display = 'none';

        switch (mode) {
            case 'image':
                // 内存镜像模式：显示镜像状态，使用已加载的镜像
                if (imageStatusGroup) imageStatusGroup.style.display = 'flex';
                try {
                    const settings = await loadAppSettings();
                    const imagePath = settings?.current_image_path || '';
                    this.updateImageStatus(imagePath);
                    this.searchConfig.mode = { ImageSearch: { image_path: imagePath } };
                } catch (e) {
                    this.updateImageStatus('');
                }
                break;

            case 'file':
                // 单文件模式：显示路径输入
                if (pathInputGroup) pathInputGroup.style.display = 'flex';
                if (targetPathInput) {
                    targetPathInput.placeholder = '选择要搜索的单个文件...';
                }
                this.searchConfig.mode = { FileSearch: { file_path: targetPathInput?.value || '' } };
                break;

            case 'folder':
                // 文件夹模式：显示路径输入，默认使用output目录
                if (pathInputGroup) pathInputGroup.style.display = 'flex';
                if (targetPathInput) {
                    targetPathInput.placeholder = '选择要搜索的文件夹...';
                    // 默认使用output目录
                    if (!targetPathInput.value) {
                        try {
                            const settings = await loadAppSettings();
                            if (settings?.output_path) {
                                targetPathInput.value = settings.output_path;
                            }
                        } catch (e) {
                            console.warn('无法获取output目录:', e);
                        }
                    }
                }
                this.searchConfig.mode = { FolderSearch: { folder_path: targetPathInput?.value || '' } };
                break;

            case 'process':
                // 进程模式：显示进程选择器
                if (processInputGroup) processInputGroup.style.display = 'flex';
                this.searchConfig.mode = { ProcessSearch: { process_id: 0 } };
                // 加载进程列表
                await this.loadAvailableProcesses();
                break;
        }
    }

    /**
     * 绑定进程选择器下拉菜单事件
     */
    private bindProcessDropdown(): void {
        if (!this.container) return;

        const processTrigger = this.container.querySelector('#processSelectTrigger');
        const processMenu = this.container.querySelector('#processMenu') as HTMLElement;
        const processSearchInput = this.container.querySelector('#processSearchInput') as HTMLInputElement;

        processTrigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = processMenu?.style.display === 'block';
            this.closeAllDropdowns();
            if (processMenu && !isOpen) {
                processMenu.style.display = 'block';
                setTimeout(() => processSearchInput?.focus(), 100);
            }
        });

        processMenu?.addEventListener('click', (e) => e.stopPropagation());

        // 进程搜索功能
        processSearchInput?.addEventListener('input', debounce((e: Event) => {
            this.filterProcessList((e.target as HTMLInputElement).value);
        }, 200));
    }

    /**
     * 过滤进程列表
     */
    private filterProcessList(query: string): void {
        if (!this.container) return;

        const lowerQuery = query.toLowerCase().trim();
        const items = this.container.querySelectorAll('.ss-process-item');

        items.forEach(item => {
            const name = item.querySelector('.ss-process-name')?.textContent?.toLowerCase() || '';
            const isMatch = !lowerQuery || name.includes(lowerQuery);
            (item as HTMLElement).style.display = isMatch ? 'flex' : 'none';
        });
    }

    /**
     * 加载可用进程列表（从挂载盘）
     */
    private async loadAvailableProcesses(): Promise<void> {
        if (!this.container) return;

        const processListContainer = this.container.querySelector('#processListContainer') as HTMLElement;
        if (!processListContainer) return;

        processListContainer.innerHTML = '<div class="ss-process-loading">正在加载进程列表...</div>';

        try {
            // 扫描挂载盘 \name\ 目录
            const processes: Array<{name: string, pid: number, path: string, displayName: string}> = [];

            const nameDir = await invoke<Array<{name: string, is_dir: boolean}>>('get_file_list', { path: mountPath('name') }).catch(() => []);

            for (const item of nameDir) {
                if (item.is_dir) {
                    const minidumpPath = mountPath('name', item.name, 'minidump', 'minidump.dmp');
                    // 解析进程名和PID
                    const processMatch = item.name.match(/^(.+\.exe)-(\d+)$/);
                    if (processMatch) {
                        const [, processName, pid] = processMatch;
                        processes.push({
                            name: processName,
                            pid: parseInt(pid),
                            path: minidumpPath,
                            displayName: `${processName} (PID: ${pid})`
                        });
                    } else {
                        processes.push({
                            name: item.name,
                            pid: 0,
                            path: minidumpPath,
                            displayName: item.name
                        });
                    }
                }
            }

            if (processes.length === 0) {
                processListContainer.innerHTML = `<div class="ss-process-empty">未找到进程（请确保${getMountLetter()}盘已挂载）</div>`;
            } else {
                processListContainer.innerHTML = processes.map(p => `
                    <div class="ss-process-item" data-path="${p.path}" data-pid="${p.pid}">
                        <span class="ss-process-name">${p.displayName}</span>
                        <span class="ss-process-path">${p.path}</span>
                    </div>
                `).join('');

                // 绑定点击事件
                const items = processListContainer.querySelectorAll('.ss-process-item');
                items.forEach(item => {
                    item.addEventListener('click', () => {
                        const path = (item as HTMLElement).dataset.path || '';
                        const displayName = item.querySelector('.ss-process-name')?.textContent || '';

                        // 更新标签
                        const label = this.container?.querySelector('#processSelectLabel');
                        if (label) label.textContent = displayName;

                        // 设置搜索模式
                        this.searchConfig.mode = { FileSearch: { file_path: path } };

                        this.closeAllDropdowns();
                    });
                });
            }
        } catch (error) {
            console.error('加载进程列表失败:', error);
            processListContainer.innerHTML = `<div class="ss-process-empty">加载失败（${getMountLetter()}盘可能未挂载）</div>`;
        }
    }

    /**
     * 浏览文件/文件夹
     */
    private async browseFile(): Promise<void> {
        try {
            const currentMode = this.getCurrentMode();

            let selected: string | null = null;
            if (currentMode === 'folder') {
                selected = await open({
                    directory: true,
                    multiple: false
                }) as string | null;
            } else {
                selected = await open({
                    multiple: false,
                    directory: false
                }) as string | null;
            }

            if (selected) {
                const targetPathInput = this.container?.querySelector('#targetPathPanel') as HTMLInputElement;
                if (targetPathInput) {
                    targetPathInput.value = selected;
                }
                this.updateTargetPath(selected);
            }
        } catch (error) {
            console.error('选择文件失败:', error);
        }
    }

    /**
     * 获取当前搜索模式
     */
    private getCurrentMode(): string {
        if ('ImageSearch' in this.searchConfig.mode) return 'image';
        if ('FileSearch' in this.searchConfig.mode) return 'file';
        if ('FolderSearch' in this.searchConfig.mode) return 'folder';
        if ('ProcessSearch' in this.searchConfig.mode) return 'process';
        return 'image';
    }

    /**
     * 更新目标路径
     */
    private updateTargetPath(path: string): void {
        const mode = this.searchConfig.mode;
        if ('FileSearch' in mode) {
            this.searchConfig.mode = { FileSearch: { file_path: path } };
        } else if ('FolderSearch' in mode) {
            this.searchConfig.mode = { FolderSearch: { folder_path: path } };
        } else if ('ImageSearch' in mode) {
            this.searchConfig.mode = { ImageSearch: { image_path: path } };
        }
    }

    /**
     * 更新编码配置
     */
    private updateEncodings(): void {
        if (!this.container) return;

        const selectedEncodings: string[] = [];
        const checkboxes = this.container.querySelectorAll('.encoding-checkbox:checked');
        checkboxes.forEach(cb => {
            selectedEncodings.push((cb as HTMLInputElement).value);
        });
        this.searchConfig.encodings = selectedEncodings;
    }

    /**
     * 开始搜索
     */
    private async startSearch(): Promise<void> {
        // 如果上一次搜索还在跑，先强制停止
        if (this.isSearching || this.yaraScanning) {
            await this.stopSearch();
            // 短暂延迟让后端处理取消
            await new Promise(r => setTimeout(r, 100));
        }

        // YARA 模式
        if (this.yaraRulePaths.length > 0) {
            await this.startYaraScan();
            return;
        }

        try {
            this.updateEncodings();

            const isValid = await invoke('validate_string_search_config', {
                config: this.searchConfig
            });

            if (!isValid) {
                this.showError('配置验证失败，请检查参数');
                return;
            }

            // 先清空旧结果
            // 注意：handleSearchBatch 采用「增量追加」渲染，依据 #resultsListPanel 现有
            // 子节点数（existingCount）决定从哪里开始追加；而 handleSearchCompleted 又
            // 刻意不做全量 renderResults()。因此若这里不清空上一次遗留的列表 DOM，
            // 连续搜索时 existingCount 仍为上次的条数，新批次永远追加不进去，
            // 导致 .ss-list-content 列表一直停留在上一次的结果上（不更新）。
            this.currentResults = null;
            this.filteredResults = null;
            this.currentPage = 1;
            this.totalFoundCount = 0;
            this.secondarySearchTerm = '';
            this.clusters = [];
            this.clusterView = false;
            this.sfCache = null;
            this.selectedIndices.clear();
            this.kbdIndex = -1;
            this.lastClickedIndex = -1;

            // 清空上一次搜索遗留的结果列表 DOM 与详情面板，让增量渲染从空列表重新开始
            if (this.container) {
                const prevResultsList = this.container.querySelector('#resultsListPanel') as HTMLElement | null;
                if (prevResultsList) prevResultsList.innerHTML = '';
                const clusterToggle = this.container.querySelector('#clusterToggleBtn');
                clusterToggle?.classList.remove('active');
                this.resetDetailPanel();
            }

            this.isSearching = true;
            this.searchStartTime = Date.now();
            this.updateUIForSearching(true);


            await invoke('execute_string_search_with_progress', {
                config: this.searchConfig
            });



        } catch (error) {
            this.isSearching = false;
            this.updateUIForSearching(false);
            showFriendlyError(error, '字符串搜索');
        }
    }

    /**
     * 停止搜索
     */
    private async stopSearch(): Promise<void> {
        // 立即重置所有搜索状态
        this.isSearching = false;
        this.yaraScanning = false;

        // 清除批次渲染定时器
        if (this.batchRenderTimer) {
            clearTimeout(this.batchRenderTimer);
            this.batchRenderTimer = null;
        }

        try {
            await invoke('stop_string_search');
            await invoke('yara_stop_scan');
        } catch (_) {
            // ignore
        }

        this.updateUIForSearching(false);
        this.showToast('搜索已停止', 'info');
    }

    /**
     * 更新搜索状态UI
     */
    private updateUIForSearching(searching: boolean): void {
        if (!this.container) return;

        const startBtn = this.container.querySelector('#startSearchBtnPanel') as HTMLElement;
        const stopBtn = this.container.querySelector('#stopSearchBtnPanel') as HTMLElement;
        const progressSection = this.container.querySelector('#progressSectionPanel') as HTMLElement;

        if (startBtn) startBtn.style.display = searching ? 'none' : 'flex';
        if (stopBtn) stopBtn.style.display = searching ? 'flex' : 'none';
        if (progressSection) progressSection.style.display = searching ? 'block' : 'none';

        // 重置搜索速度追踪
        if (searching) {
            this.lastProgressUpdate = null;
        }
    }

    /**
     * 更新进度
     */
    private updateProgress(progress: SearchProgress): void {
        if (!this.container || !this.isSearching) return;

        const progressStatus = this.container.querySelector('#progressStatusPanel');
        const progressBar = this.container.querySelector('#progressBarPanel') as HTMLElement;

        // 计算搜索速度
        let speedText = '';
        const now = Date.now();
        if (this.lastProgressUpdate && progress.processed_bytes > this.lastProgressUpdate.bytes) {
            const timeDelta = (now - this.lastProgressUpdate.time) / 1000;
            if (timeDelta > 0.3) {
                const bytesDelta = progress.processed_bytes - this.lastProgressUpdate.bytes;
                const speedMBps = (bytesDelta / (1024 * 1024)) / timeDelta;
                speedText = ` · ${speedMBps.toFixed(1)} MB/s`;
                this.lastProgressUpdate = { time: now, bytes: progress.processed_bytes };
            }
        } else {
            this.lastProgressUpdate = { time: now, bytes: progress.processed_bytes };
        }

        if (progressStatus) {
            const foundText = progress.status || `已找到 ${progress.found_count} 个字符串...`;
            progressStatus.textContent = foundText + speedText;
        }

        if (progressBar && progress.total_bytes > 0) {
            const percent = Math.min(100, (progress.processed_bytes / progress.total_bytes) * 100);
            progressBar.style.width = `${percent}%`;
        }

        this.totalFoundCount = progress.found_count;

        if (progress.completed) {
            this.isSearching = false;
            this.updateUIForSearching(false);
        }
    }

    /**
     * 处理搜索完成
     */
    // 增量渲染节流
    private batchRenderTimer: ReturnType<typeof setTimeout> | null = null;
    private batchPendingCount: number = 0;

    /**
     * 处理流式批次结果（搜索进行中逐步推送）
     */
    private handleSearchBatch(batch: FoundString[]): void {
        if (!batch || batch.length === 0) return;

        // 初始化 currentResults（首次批次到达时）
        if (!this.currentResults) {
            this.currentResults = {
                strings: [],
                stats: { duration_ms: 0, processed_bytes: 0, total_found: 0, encoding_stats: {} },
                truncated: false,
                page: 1,
                page_size: 100,
                total_pages: 1,
                has_more: false,
            };

            // 首次：切换空状态为列表状态
            const emptyState = this.container?.querySelector('#emptyStatePanel') as HTMLElement;
            const resultsList = this.container?.querySelector('#resultsListPanel') as HTMLElement;
            const listToolbar = this.container?.querySelector('#listToolbar') as HTMLElement;
            if (emptyState) emptyState.style.display = 'none';
            if (resultsList) resultsList.style.display = 'block';
            if (listToolbar) listToolbar.style.display = 'flex';
        }

        // 追加结果
        this.currentResults.strings.push(...batch);
        this.currentResults.stats.total_found = this.currentResults.strings.length;

        // 更新结果计数（即时，无 DOM 重建）
        const resultCount = this.container?.querySelector('#resultCountPanel');
        if (resultCount) {
            resultCount.textContent = `${this.currentResults.strings.length} 命中 (搜索中...)`;
        }
        const resultsStats = this.container?.querySelector('#resultsStatsPanel') as HTMLElement;
        if (resultsStats) resultsStats.style.display = 'flex';

        // 增量 DOM 追加：只往第1页列表尾部添加新条目，不重建已有DOM
        if (this.currentPage === 1) {
            const resultsList = this.container?.querySelector('#resultsListPanel') as HTMLElement;
            if (resultsList) {
                const existingCount = resultsList.children.length;
                const total = this.currentResults.strings.length;
                // 只渲染第1页内的新增项
                const pageEnd = Math.min(total, this.pageSize);
                if (existingCount < pageEnd) {
                    const fragment = document.createDocumentFragment();
                    for (let i = existingCount; i < pageEnd; i++) {
                        const str = this.currentResults.strings[i];
                        fragment.appendChild(this.createResultItemElement(str, i));
                    }
                    resultsList.appendChild(fragment);
                }
            }
        }
    }

    /**
     * 创建单个结果列表项 DOM 元素（用于增量追加）
     */
    private createResultItemElement(str: FoundString, index: number): HTMLLIElement {
        const li = document.createElement('li');
        li.className = 'ss-result-item';
        li.dataset.index = String(index);

        const offsetHex = `0x${str.offset.toString(16).toUpperCase().padStart(8, '0')}`;
        const tagKey = this.getTagKey(str);
        const tags = this.taggedResults.get(tagKey) || [];
        const tagHTML = tags.map(t => `<span class="ss-result-tag-label" data-tag="${t}">${t}</span>`).join('');

        let entropyTag = '';
        if (str.entropy !== undefined) {
            const e = str.entropy;
            const level = e < 1 ? 'zero' : e < 3 ? 'low' : e < 4 ? 'hex' : e < 5.5 ? 'code' : e < 6 ? 'base64' : e < 7.5 ? 'very-high' : 'crypto';
            entropyTag = `<span class="ss-result-tag ss-entropy-tag" data-entropy-level="${level}" title="熵值: ${e.toFixed(2)}">熵: ${e.toFixed(1)}</span>`;
        }

        li.innerHTML = `
            <div class="ss-result-meta">
                <span class="ss-result-offset">${offsetHex}</span>
                <div class="ss-result-tags">
                    <span class="ss-result-tag" data-encoding="${str.encoding}">${str.encoding}</span>
                    <span class="ss-result-tag">${str.byte_length}b</span>
                    ${entropyTag}
                    ${tagHTML}
                </div>
            </div>
            <div class="ss-result-value">${this.escapeHtml(str.content.substring(0, 200))}</div>
        `;

        // 点击选中
        li.addEventListener('click', () => this.selectResultItem(index));
        // 右键
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, index);
        });

        return li;
    }

    private handleSearchCompleted(result: SearchResult): void {
        this.isSearching = false;

        // 清除批次渲染定时器
        if (this.batchRenderTimer) {
            clearTimeout(this.batchRenderTimer);
            this.batchRenderTimer = null;
        }

        // 用最终结果替换（后端去重 + 按 offset 排序后的）。
        // 关键：流式批次是按「扫描顺序」增量追加进 DOM 的（每行 data-index = 扫描序），
        // 而最终结果经后端去重并按 offset 重排，两者的顺序与数量都不一致。若沿用流式
        // DOM 不重建，点击某行时 selectResultItem 会用该行的「扫描序 index」去最终
        // （已排序）数组取值，导致左侧所点条目与右侧详情 / HEX 预览不符。
        // 因此必须基于最终结果重建列表，使每行 data-index 与 getSortedFilteredResults()
        // 对齐（与 YARA 完成路径保持一致）。
        this.currentResults = result;
        this.filteredResults = null;
        this.sfCache = null;
        this.selectedIndices.clear();
        this.kbdIndex = -1;
        this.lastClickedIndex = -1;
        this.updateUIForSearching(false);

        // 重建结果列表：renderResults 内部会同步命中数、耗时、二次扫描按钮与分页等
        // 全部统计 UI，无需再手工逐项更新。
        this.renderResults();

        const duration = this.searchStartTime ? Date.now() - this.searchStartTime : 0;
        const durationText = duration > 1000 ? `${(duration / 1000).toFixed(1)}s` : `${duration}ms`;
        this.showToast(`搜索完成：${result.strings.length} 个结果 (${durationText})`, 'success');
    }

    /**
     * 处理搜索错误
     */
    private handleSearchError(error: string): void {
        this.isSearching = false;
        this.updateUIForSearching(false);
        console.error('搜索错误:', error);
        this.showToast(`搜索失败: ${error}`, 'error');
    }

    /**
     * 绑定邻近搜索事件
     */
    private bindProximitySearch(): void {
        if (!this.container) return;

        const toggleBtn = this.container.querySelector('#proximityToggle') as HTMLButtonElement | null;
        const configPanel = this.container.querySelector('#proximityConfig') as HTMLElement | null;
        const searchBtn = this.container.querySelector('#proximitySearchBtn') as HTMLButtonElement | null;

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const isActive = toggleBtn.classList.toggle('active');
                if (configPanel) {
                    configPanel.style.display = isActive ? 'flex' : 'none';
                }
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.performProximitySearch());
        }
    }

    /**
     * 执行邻近搜索
     */
    private async performProximitySearch(): Promise<void> {
        if (!this.container) return;

        if (!this.currentResults || this.currentResults.strings.length === 0) {
            this.showError('请先执行普通搜索获取结果');
            return;
        }

        const keyword1Input = this.container.querySelector('#proximityKeyword1') as HTMLInputElement | null;
        const keyword2Input = this.container.querySelector('#proximityKeyword2') as HTMLInputElement | null;
        const distanceInput = this.container.querySelector('#proximityDistance') as HTMLInputElement | null;

        const keyword1 = keyword1Input?.value.trim() || '';
        const keyword2 = keyword2Input?.value.trim() || '';
        const maxDistance = parseInt(distanceInput?.value || '64', 10);

        if (!keyword1 || !keyword2) {
            this.showError('请输入两个关键词');
            return;
        }

        // 在现有结果中查找邻近匹配
        const strings = this.currentResults.strings;
        const proximityResults: typeof strings = [];

        // 按偏移量排序
        const sortedStrings = [...strings].sort((a, b) => Number(a.offset) - Number(b.offset));

        for (let i = 0; i < sortedStrings.length; i++) {
            const str1 = sortedStrings[i];
            const content1Lower = str1.content.toLowerCase();
            const k1Lower = keyword1.toLowerCase();
            const k2Lower = keyword2.toLowerCase();

            // 检查当前字符串是否包含关键词1
            if (content1Lower.includes(k1Lower)) {
                // 查找距离内是否有包含关键词2的字符串
                for (let j = 0; j < sortedStrings.length; j++) {
                    if (i === j) continue;
                    const str2 = sortedStrings[j];
                    const distance = Math.abs(Number(str2.offset) - Number(str1.offset));

                    if (distance <= maxDistance && str2.content.toLowerCase().includes(k2Lower)) {
                        // 找到邻近匹配，添加两个字符串（如果还没添加）
                        if (!proximityResults.find(s => s.offset === str1.offset)) {
                            proximityResults.push(str1);
                        }
                        if (!proximityResults.find(s => s.offset === str2.offset)) {
                            proximityResults.push(str2);
                        }
                    }
                }
            }
        }

        // 按偏移量排序结果
        proximityResults.sort((a, b) => Number(a.offset) - Number(b.offset));

        // 更新筛选结果
        this.filteredResults = proximityResults;
        this.currentPage = 1;
        this.renderResults();

        // 显示统计
        const statsPanel = this.container.querySelector('#resultsStatsPanel') as HTMLElement | null;
        const resultCount = this.container.querySelector('#resultCountPanel');
        if (statsPanel) statsPanel.style.display = 'flex';
        if (resultCount) {
            resultCount.textContent = `邻近匹配: ${proximityResults.length} 命中 (${keyword1} ↔ ${keyword2}, ≤${maxDistance}字节)`;
        }
    }

    /**
     * 应用熵值筛选
     */
    private applyEntropyFilter(): void {
        if (!this.currentResults) return;

        if (this.entropyFilter === 'none') {
            this.filteredResults = null;
            return;
        }

        const strings = this.currentResults.strings;
        this.filteredResults = strings.filter(str => {
            if (str.entropy === undefined) return true;
            const entropy = str.entropy;

            switch (this.entropyFilter) {
                case 'zero':
                    return entropy >= 0 && entropy < 1.0;
                case 'low':
                    return entropy >= 1.0 && entropy < 3.0;
                case 'hex':
                    return entropy >= 3.5 && entropy < 4.0;
                case 'code':
                    return entropy >= 4.5 && entropy < 5.5;
                case 'base64':
                    return entropy >= 5.8 && entropy < 6.0;
                case 'very-high':
                    return entropy >= 6.0 && entropy < 7.5;
                case 'crypto':
                    return entropy >= 7.5;
                default:
                    return true;
            }
        });

        // 重置分页
        this.currentPage = 1;
    }

    /**
     * 渲染搜索结果
     */
    /**
     * 获取排序和过滤后的结果集
     */
    private getSortedFilteredResults(): FoundString[] {
        let strings = this.filteredResults || this.currentResults?.strings || [];

        // 标签筛选
        const tagFilterSelect = this.container?.querySelector('#tagFilterSelect') as HTMLSelectElement;
        const tagFilter = tagFilterSelect?.value || '';

        // 缓存命中检查：base 指纹 + 过滤/排序配置 + 标签版本均未变化时直接返回缓存，避免对全量结果重排
        const fpFirst = strings.length ? strings[0].offset : -1;
        const fpLast = strings.length ? strings[strings.length - 1].offset : -1;
        const sig = [
            strings.length, fpFirst, fpLast,
            this.filteredResults ? 'f' : 'c',
            tagFilter,
            this.columnFilters.offset, this.columnFilters.content, this.columnFilters.encoding,
            this.sortConfig ? `${this.sortConfig.column}:${this.sortConfig.direction}` : '',
            this.taggedResults.size, this.bookmarks.length, this.tagVersion,
        ].join('|');
        if (this.sfCache && this.sfCache.sig === sig) {
            return this.sfCache.data;
        }

        if (tagFilter) {
            strings = strings.filter(str => {
                const key = `0x${str.offset.toString(16)}`;
                const tags = this.taggedResults.get(key);
                const isBookmarked = this.bookmarks.some(b => b.offset === str.offset);
                if (tagFilter === '__tagged') return tags && tags.length > 0;
                if (tagFilter === '__untagged') return !tags || tags.length === 0;
                if (tagFilter === '__bookmarked') return isBookmarked;
                return tags?.includes(tagFilter);
            });
        }

        // 列过滤
        if (this.columnFilters.offset) {
            const f = this.columnFilters.offset.toLowerCase();
            strings = strings.filter(s => `0x${s.offset.toString(16)}`.toLowerCase().includes(f));
        }
        if (this.columnFilters.content) {
            const f = this.columnFilters.content.toLowerCase();
            strings = strings.filter(s => s.content.toLowerCase().includes(f));
        }
        if (this.columnFilters.encoding) {
            const f = this.columnFilters.encoding.toLowerCase();
            strings = strings.filter(s => s.encoding.toLowerCase().includes(f));
        }

        // 排序
        if (this.sortConfig) {
            const { column, direction } = this.sortConfig;
            const mult = direction === 'asc' ? 1 : -1;
            strings = [...strings].sort((a, b) => {
                let cmp = 0;
                switch (column) {
                    case 'offset': cmp = a.offset - b.offset; break;
                    case 'encoding': cmp = a.encoding.localeCompare(b.encoding); break;
                    case 'byte_length': cmp = a.byte_length - b.byte_length; break;
                    case 'entropy': cmp = (a.entropy ?? 0) - (b.entropy ?? 0); break;
                    case 'content': cmp = a.content.localeCompare(b.content); break;
                }
                return cmp * mult;
            });
        }

        this.sfCache = { sig, data: strings };
        return strings;
    }

    /**
     * 获取偏移量对应的标签key
     */
    private getTagKey(str: FoundString): string {
        return `0x${str.offset.toString(16)}`;
    }

    private renderResults(): void {
        if (!this.container || !this.currentResults) return;

        const emptyState = this.container.querySelector('#emptyStatePanel') as HTMLElement;
        const resultsList = this.container.querySelector('#resultsListPanel') as HTMLElement;
        const resultsStats = this.container.querySelector('#resultsStatsPanel') as HTMLElement;
        const pagination = this.container.querySelector('#paginationPanel') as HTMLElement;
        const resultCount = this.container.querySelector('#resultCountPanel');
        const searchDuration = this.container.querySelector('#searchDurationPanel');
        const listToolbar = this.container.querySelector('#listToolbar') as HTMLElement;
        const filterRow = this.container.querySelector('#filterRow') as HTMLElement;
        const clusterPanel = this.container.querySelector('#clusterPanel') as HTMLElement;

        if (!resultsList) return;

        const allStrings = this.filteredResults || this.currentResults.strings;

        if (allStrings.length === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            if (resultsList) resultsList.style.display = 'none';
            if (resultsStats) resultsStats.style.display = 'none';
            if (pagination) pagination.style.display = 'none';
            if (listToolbar) listToolbar.style.display = 'none';
            if (filterRow) filterRow.style.display = 'none';
            // 确保聚类面板和相关元素也被隐藏，避免卡在聚类视图
            if (clusterPanel) clusterPanel.style.display = 'none';
            const listContent = this.container.querySelector('.ss-list-content') as HTMLElement;
            const sortableHeader = this.container.querySelector('#sortableHeader') as HTMLElement;
            if (listContent) listContent.style.display = 'none';
            if (sortableHeader) sortableHeader.style.display = 'none';
            // 重置聚类视图状态
            if (this.clusterView) {
                this.clusterView = false;
                const clusterToggle = this.container.querySelector('#clusterToggleBtn');
                clusterToggle?.classList.remove('active');
            }
            this.resetDetailPanel();
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (resultsList) resultsList.style.display = this.clusterView ? 'none' : 'block';
        if (resultsStats) resultsStats.style.display = 'flex';
        if (listToolbar) listToolbar.style.display = 'flex';
        if (filterRow) filterRow.style.display = this.clusterView ? 'none' : 'flex';

        // 聚类视图：隐藏列表区域，显示聚类面板
        const listContent = this.container.querySelector('.ss-list-content') as HTMLElement;
        const sortableHeader = this.container.querySelector('#sortableHeader') as HTMLElement;
        if (listContent) listContent.style.display = this.clusterView ? 'none' : '';
        if (sortableHeader) sortableHeader.style.display = this.clusterView ? 'none' : '';
        if (clusterPanel) {
            clusterPanel.style.display = this.clusterView ? 'block' : 'none';
        }

        if (resultCount) {
            const truncatedText = this.currentResults.truncated ? ' (已截断)' : '';
            resultCount.textContent = `${allStrings.length} 命中${truncatedText}`;
        }

        // 显示二次扫描按钮
        const secondaryScanBtn = this.container.querySelector('#secondaryScanBtn') as HTMLElement;
        if (secondaryScanBtn && allStrings.length > 0) {
            secondaryScanBtn.style.display = 'inline-flex';
        }
        if (searchDuration && this.currentResults.stats) {
            searchDuration.textContent = `${this.currentResults.stats.duration_ms}ms`;
        }

        // 聚类模式渲染
        if (this.clusterView) {
            this.renderClusterView();
            if (pagination) pagination.style.display = 'none';
            return;
        }

        // 获取排序过滤后的结果
        const strings = this.getSortedFilteredResults();

        // 更新排序指示器
        this.updateSortIndicators();

        const totalPages = Math.ceil(strings.length / this.pageSize);
        const startIdx = (this.currentPage - 1) * this.pageSize;
        const endIdx = Math.min(startIdx + this.pageSize, strings.length);
        const pageStrings = strings.slice(startIdx, endIdx);

        const showSourceFile = this.getCurrentMode() === 'folder';

        resultsList.innerHTML = pageStrings.map((str, idx) => {
            const globalIdx = startIdx + idx;
            const offsetHex = `0x${str.offset.toString(16).toUpperCase().padStart(8, '0')}`;
            const contentPreview = this.highlightMatchText(str.content);
            const tagKey = this.getTagKey(str);
            const tags = this.taggedResults.get(tagKey) || [];
            const isBookmarked = this.bookmarks.some(b => b.offset === str.offset);
            const isMultiSelected = this.selectedIndices.has(globalIdx);

            // 标签 HTML
            const tagHTML = tags.map(t => `<span class="ss-result-tag-label" data-tag="${t}">${t}</span>`).join('');
            const bookmarkHTML = isBookmarked ? '<span class="ss-bookmark-indicator" title="已收藏">&#9733;</span>' : '';

            // 根据熵值范围生成带颜色的标签
            let entropyTag = '';
            if (str.entropy !== undefined) {
                const entropy = str.entropy;
                let entropyLevel = 'low';

                if (entropy < 1.0) entropyLevel = 'zero';
                else if (entropy < 3.0) entropyLevel = 'low';
                else if (entropy < 4.0) entropyLevel = 'hex';
                else if (entropy < 5.5) entropyLevel = 'code';
                else if (entropy < 6.0) entropyLevel = 'base64';
                else if (entropy < 7.5) entropyLevel = 'very-high';
                else entropyLevel = 'crypto';

                entropyTag = `<span class="ss-result-tag ss-entropy-tag" data-entropy-level="${entropyLevel}" title="熵值: ${entropy.toFixed(2)}">熵: ${entropy.toFixed(1)}</span>`;
            }

            const staggerDelay = Math.min(idx * 20, 400);
            return `
                <li class="ss-result-item${isMultiSelected ? ' multi-selected' : ''}" data-index="${globalIdx}" style="animation-delay: ${staggerDelay}ms">
                    <div class="ss-result-meta">
                        ${bookmarkHTML}<span class="ss-result-offset">${offsetHex}</span>
                        <div class="ss-result-tags">
                            <span class="ss-result-tag" data-encoding="${str.encoding}">${str.encoding}</span>
                            <span class="ss-result-tag">${str.byte_length}b</span>
                            ${entropyTag}
                            ${showSourceFile && str.source_file ? `<span class="ss-result-tag">${this.getFileName(str.source_file)}</span>` : ''}
                            ${tagHTML}
                        </div>
                    </div>
                    <div class="ss-result-value">${contentPreview}</div>
                    <button class="ss-row-copy" data-copy-index="${globalIdx}" title="复制内容" aria-label="复制内容"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                </li>
            `;
        }).join('');

        if (pagination && totalPages > 1) {
            pagination.style.display = 'flex';
            const pageInfo = this.container.querySelector('#pageInfoPanel');
            if (pageInfo) {
                pageInfo.textContent = `${this.currentPage} / ${totalPages}`;
            }
        } else if (pagination) {
            pagination.style.display = 'none';
        }
    }

    /**
     * 更新排序列头指示器
     */
    private updateSortIndicators(): void {
        if (!this.container) return;
        const sortables = this.container.querySelectorAll('.ss-sortable');
        sortables.forEach(el => {
            el.classList.remove('asc', 'desc');
            if (this.sortConfig && (el as HTMLElement).dataset.sort === this.sortConfig.column) {
                el.classList.add(this.sortConfig.direction);
            }
        });
    }

    /**
     * 渲染聚类视图
     */
    private renderClusterView(): void {
        if (!this.container) return;
        const content = this.container.querySelector('#clusterContent') as HTMLElement;
        if (!content) return;

        // 如果还没有聚类数据，先计算
        if (this.clusters.length === 0) {
            this.computeClusters();
        }

        content.innerHTML = this.clusters.map((cluster, ci) => {
            const arrowClass = cluster.collapsed ? '' : 'expanded';
            const itemsHTML = cluster.collapsed ? '' : cluster.strings.slice(0, 200).map((str, si) => {
                const offsetHex = `0x${str.offset.toString(16).toUpperCase().padStart(8, '0')}`;
                const tagKey = this.getTagKey(str);
                const tags = this.taggedResults.get(tagKey) || [];
                const tagHTML = tags.map(t => `<span class="ss-result-tag-label" data-tag="${t}">${t}</span>`).join('');
                let entropyTag = '';
                if (str.entropy !== undefined) {
                    entropyTag = `<span class="ss-result-tag ss-entropy-tag" title="熵值: ${str.entropy.toFixed(2)}">熵: ${str.entropy.toFixed(1)}</span>`;
                }
                return `<li class="ss-result-item ss-cluster-result-item" data-cluster="${ci}" data-cluster-idx="${si}">
                    <div class="ss-result-meta">
                        <span class="ss-result-offset">${offsetHex}</span>
                        <div class="ss-result-tags">
                            <span class="ss-result-tag" data-encoding="${str.encoding}">${str.encoding}</span>
                            <span class="ss-result-tag">${str.byte_length}b</span>
                            ${entropyTag}
                            ${tagHTML}
                        </div>
                    </div>
                    <div class="ss-result-value">${this.highlightMatchText(str.content.substring(0, 120))}</div>
                </li>`;
            }).join('');
            return `<div class="ss-cluster-group">
                <div class="ss-cluster-header" data-cluster="${ci}">
                    <span class="ss-cluster-arrow ${arrowClass}">&#9654;</span>
                    <span>${cluster.label}</span>
                    <span class="ss-cluster-count">${cluster.count}</span>
                </div>
                ${!cluster.collapsed ? `<ul class="ss-cluster-items">${itemsHTML}</ul>` : ''}
            </div>`;
        }).join('');

        // 绑定聚类头部点击（展开/折叠）
        content.querySelectorAll('.ss-cluster-header').forEach(header => {
            header.addEventListener('click', () => {
                const ci = parseInt((header as HTMLElement).dataset.cluster || '0');
                if (this.clusters[ci]) {
                    this.clusters[ci].collapsed = !this.clusters[ci].collapsed;
                    this.renderClusterView();
                }
            });
        });

        // 绑定聚类项点击（显示详情）
        content.querySelectorAll('.ss-cluster-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const ci = parseInt((item as HTMLElement).dataset.cluster || '0');
                const si = parseInt((item as HTMLElement).dataset.clusterIdx || '0');
                const cluster = this.clusters[ci];
                if (!cluster) return;
                const str = cluster.strings[si];
                if (!str) return;

                // 高亮选中态
                content.querySelectorAll('.ss-cluster-result-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');

                // 聚类视图中已持有 str 对象，直接填充详情面板
                this.showDetailForString(str);
            });

            // 右键菜单
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const ci = parseInt((item as HTMLElement).dataset.cluster || '0');
                const si = parseInt((item as HTMLElement).dataset.clusterIdx || '0');
                const cluster = this.clusters[ci];
                if (!cluster) return;
                const str = cluster.strings[si];
                if (!str) return;
                // 在排序后的结果中查找索引，用于右键菜单操作
                const sortedStrings = this.getSortedFilteredResults();
                const sortedIdx = sortedStrings.findIndex(s => s.offset === str.offset && s.content === str.content);
                if (sortedIdx >= 0) {
                    this.showContextMenu(e as MouseEvent, sortedIdx);
                }
            });
        });
    }

    /**
     * 直接用 FoundString 数据填充详情面板
     */
    private showDetailForString(str: FoundString): void {
        if (!this.container) return;

        const emptyDetail = this.container.querySelector('#detailEmptyPanel') as HTMLElement;
        const detailContent = this.container.querySelector('#detailContentPanel') as HTMLElement;
        if (emptyDetail) emptyDetail.style.display = 'none';
        if (detailContent) detailContent.style.display = 'flex';

        const offsetEl = this.container.querySelector('#detailOffset');
        const encodingEl = this.container.querySelector('#detailEncoding');
        const lengthEl = this.container.querySelector('#detailLength');
        const valueEl = this.container.querySelector('#detailValue');

        if (offsetEl) offsetEl.textContent = `0x${str.offset.toString(16).toUpperCase().padStart(8, '0')}`;
        if (encodingEl) encodingEl.textContent = str.encoding;
        if (lengthEl) lengthEl.textContent = `${str.byte_length} bytes`;
        if (valueEl) valueEl.textContent = str.content;

        this.currentSelectedString = str.content;
        this.currentSelectedOffset = str.offset;
        this.currentSelectedByteLength = str.byte_length;
        this.currentSelectedFilePath = this.getSourceFilePath(str);
        this.hexContextBefore = [];
        this.hexContextAfter = [];

        this.loadInitialHexContext();
    }

    /**
     * 计算字符串聚类
     */
    private computeClusters(): void {
        const strings = this.filteredResults || this.currentResults?.strings || [];

        const categories: Record<StringCategory, { label: string; regex?: RegExp; strings: FoundString[] }> = {
            url: { label: 'URL 链接', regex: /^https?:\/\//i, strings: [] },
            ip_address: { label: 'IP 地址', regex: /^(?:\d{1,3}\.){3}\d{1,3}/, strings: [] },
            email: { label: '邮箱地址', regex: /[\w.+-]+@[\w.-]+\.\w{2,}/, strings: [] },
            file_path: { label: '文件路径', regex: /^[a-zA-Z]:\\|^\/(?:usr|etc|var|home|tmp)/, strings: [] },
            registry_key: { label: '注册表键', regex: /^(?:HKEY_|HK(?:LM|CU|CR|U|CC))/i, strings: [] },
            dll_api: { label: 'DLL / API', regex: /\.dll$|^(?:Kernel32|User32|Ntdll|Advapi32)/i, strings: [] },
            hash: { label: '哈希值', regex: /^[a-fA-F0-9]{32,64}$/, strings: [] },
            encoded_data: { label: '编码数据 (Base64/Hex)', regex: /^(?:[A-Za-z0-9+\/]{40,}|[0-9A-Fa-f]{32,})/, strings: [] },
            crypto_key: { label: '密钥/Token', regex: /^(?:-----BEGIN|sk-|gh[pousr]_|AKIA|eyJ)/, strings: [] },
            plaintext: { label: '纯文本', strings: [] },
            other: { label: '其他', strings: [] },
        };

        for (const str of strings) {
            let matched = false;
            for (const [key, cat] of Object.entries(categories)) {
                if (key === 'plaintext' || key === 'other') continue;
                if (cat.regex && cat.regex.test(str.content)) {
                    cat.strings.push(str);
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                // 纯文本判断：大部分是可打印ASCII字符且有空格
                if (/^[\x20-\x7e]+$/.test(str.content) && str.content.includes(' ')) {
                    categories.plaintext.strings.push(str);
                } else {
                    categories.other.strings.push(str);
                }
            }
        }

        this.clusters = Object.entries(categories)
            .filter(([, cat]) => cat.strings.length > 0)
            .map(([key, cat]) => ({
                category: key as StringCategory,
                label: cat.label,
                count: cat.strings.length,
                strings: cat.strings,
                collapsed: true,
            }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * 选择结果项并显示详情
     */
    private selectResultItem(index: number): void {
        if (!this.container || !this.currentResults) return;

        // 使用与 renderResults 一致的排序/过滤结果，确保 data-index 对应正确的项
        const strings = this.getSortedFilteredResults();
        if (index < 0 || index >= strings.length) return;

        const str = strings[index];
        this.kbdIndex = index;

        // 更新选中状态
        const items = this.container.querySelectorAll('.ss-result-item');
        items.forEach(item => {
            item.classList.toggle('selected', parseInt(item.getAttribute('data-index') || '-1') === index);
        });

        // 显示详情面板
        const emptyDetail = this.container.querySelector('#detailEmptyPanel') as HTMLElement;
        const detailContent = this.container.querySelector('#detailContentPanel') as HTMLElement;

        if (emptyDetail) emptyDetail.style.display = 'none';
        if (detailContent) detailContent.style.display = 'flex';

        // 填充详情
        const offsetEl = this.container.querySelector('#detailOffset');
        const encodingEl = this.container.querySelector('#detailEncoding');
        const lengthEl = this.container.querySelector('#detailLength');
        const valueEl = this.container.querySelector('#detailValue');

        if (offsetEl) offsetEl.textContent = `0x${str.offset.toString(16).toUpperCase().padStart(8, '0')}`;
        if (encodingEl) encodingEl.textContent = str.encoding;
        if (lengthEl) lengthEl.textContent = `${str.byte_length} bytes`;
        if (valueEl) valueEl.textContent = str.content;

        // 保存当前选中项信息用于 HEX Context
        this.currentSelectedString = str.content;
        this.currentSelectedOffset = str.offset;
        this.currentSelectedByteLength = str.byte_length;
        this.currentSelectedFilePath = this.getSourceFilePath(str);
        this.hexContextBefore = [];
        this.hexContextAfter = [];

        // 复制按钮
        const copyBtn = this.container.querySelector('#copyStringBtn');
        copyBtn?.removeEventListener('click', this.handleCopyString);
        copyBtn?.addEventListener('click', this.handleCopyString);

        // 自动加载初始 HEX Context
        this.loadInitialHexContext();
    }

    /**
     * 加载初始 HEX Context（字符串本身的上下文）
     */
    private async loadInitialHexContext(): Promise<void> {
        if (!this.container) return;

        const hexContent = this.container.querySelector('#hexContextContent') as HTMLElement;
        if (!hexContent) return;

        // 计算要读取的范围：字符串前后各显示一些字节
        const contextSize = 64; // 前后各64字节
        const startOffset = Math.max(0, this.currentSelectedOffset - contextSize);
        const endOffset = this.currentSelectedOffset + this.currentSelectedByteLength + contextSize;
        const totalSize = endOffset - startOffset;

        try {
            this.setContextLoading(true);

            const bytes = await invoke<number[]>('read_memory_bytes', {
                offset: startOffset,
                size: totalSize,
                filePath: this.currentSelectedFilePath || null
            });

            if (bytes && bytes.length > 0) {
                // 缓存数据用于视图切换
                this.currentContextBytes = bytes;
                this.currentContextStartOffset = startOffset;

                // 根据当前视图模式渲染
                if (this.contextViewMode === 'hex') {
                    this.renderHexContext(hexContent, startOffset, bytes);
                } else {
                    this.renderStringContext(hexContent, startOffset, bytes);
                }
            } else {
                hexContent.innerHTML = '<div style="padding:20px;color:#94a3b8;text-align:center;">无法读取数据</div>';
            }
        } catch (error) {
            console.error('加载 HEX Context 失败:', error);
            hexContent.innerHTML = '<div style="padding:20px;color:#94a3b8;text-align:center;">加载失败，请重试</div>';
        } finally {
            this.setContextLoading(false);
        }
    }

    /**
     * 加载更多 HEX Context
     */
    private async loadHexContext(direction: 'before' | 'after'): Promise<void> {
        if (!this.container || this.isLoadingContext) return;

        const loadSize = 1024; // 1KB
        let offset: number;
        let size: number;

        if (direction === 'before') {
            const currentStart = this.hexContextBefore.length > 0
                ? this.currentSelectedOffset - this.hexContextBefore.length
                : this.currentSelectedOffset - 64;
            offset = Math.max(0, currentStart - loadSize);
            size = currentStart - offset;
            if (size <= 0) {
                console.log('已到达文件开头');
                return;
            }
        } else {
            const currentEnd = this.hexContextAfter.length > 0
                ? this.currentSelectedOffset + this.currentSelectedByteLength + this.hexContextAfter.length
                : this.currentSelectedOffset + this.currentSelectedByteLength + 64;
            offset = currentEnd;
            size = loadSize;
        }

        try {
            this.isLoadingContext = true;
            this.setContextLoading(true);

            const bytes = await invoke<number[]>('read_memory_bytes', {
                offset,
                size,
                filePath: this.currentSelectedFilePath || null
            });

            if (bytes && bytes.length > 0) {
                if (direction === 'before') {
                    this.hexContextBefore = [...bytes, ...this.hexContextBefore];
                } else {
                    this.hexContextAfter = [...this.hexContextAfter, ...bytes];
                }

                // 重新渲染完整上下文
                await this.reloadFullContext();
            }
        } catch (error) {
            console.error(`加载${direction === 'before' ? '前' : '后'}上下文失败:`, error);
        } finally {
            this.isLoadingContext = false;
            this.setContextLoading(false);
        }
    }

    /**
     * 重新加载完整上下文
     */
    private async reloadFullContext(): Promise<void> {
        const hexContent = this.container?.querySelector('#hexContextContent') as HTMLElement;
        if (!hexContent) return;

        const baseContextSize = 64;
        const beforeSize = this.hexContextBefore.length || baseContextSize;
        const afterSize = this.hexContextAfter.length || baseContextSize;

        const startOffset = Math.max(0, this.currentSelectedOffset - beforeSize);
        const endOffset = this.currentSelectedOffset + this.currentSelectedByteLength + afterSize;
        const totalSize = endOffset - startOffset;

        try {
            const bytes = await invoke<number[]>('read_memory_bytes', {
                offset: startOffset,
                size: totalSize,
                filePath: this.currentSelectedFilePath || null
            });

            if (bytes && bytes.length > 0) {
                // 缓存数据用于视图切换
                this.currentContextBytes = bytes;
                this.currentContextStartOffset = startOffset;

                // 根据当前视图模式渲染
                if (this.contextViewMode === 'hex') {
                    this.renderHexContext(hexContent, startOffset, bytes);
                } else {
                    this.renderStringContext(hexContent, startOffset, bytes);
                }
            }
        } catch (error) {
            console.error('重新加载上下文失败:', error);
        }
    }

    /**
     * 获取字符串的源文件路径
     */
    private getSourceFilePath(str: FoundString): string {
        // 如果有 source_file_path，优先使用（文件夹搜索模式）
        if (str.source_file_path) {
            return str.source_file_path;
        }

        // 根据搜索模式确定文件路径
        const mode = this.searchConfig.mode;
        if ('FileSearch' in mode) {
            return mode.FileSearch.file_path;
        }
        if ('FolderSearch' in mode && str.source_file) {
            // source_file 可能是相对路径，需要拼接
            const folderPath = mode.FolderSearch.folder_path;
            if (str.source_file.includes('/') || str.source_file.includes('\\')) {
                return str.source_file;  // 已经是完整路径
            }
            return `${folderPath}/${str.source_file}`;
        }
        if ('ImageSearch' in mode) {
            return mode.ImageSearch.image_path;
        }

        // 默认返回空，后端会使用当前加载的内存镜像
        return '';
    }

    /**
     * 渲染 HEX Context
     */
    private renderHexContext(container: HTMLElement, startOffset: number, bytes: number[]): void {
        const rows: string[] = [];
        const bytesPerRow = 16;

        // 计算字符串在当前数据中的相对位置
        const stringStart = this.currentSelectedOffset - startOffset;
        const stringEnd = stringStart + this.currentSelectedByteLength;

        for (let i = 0; i < bytes.length; i += bytesPerRow) {
            const rowOffset = startOffset + i;
            const rowBytes = bytes.slice(i, i + bytesPerRow);

            // 检查这一行是否包含匹配的字符串
            const rowStart = i;
            const rowEnd = i + bytesPerRow;
            const isHighlightRow = (rowStart < stringEnd && rowEnd > stringStart);

            // 构建十六进制字符串
            let hexStr = '';
            let asciiStr = '';

            for (let j = 0; j < bytesPerRow; j++) {
                const byteIndex = i + j;
                const isMatch = byteIndex >= stringStart && byteIndex < stringEnd;

                if (j < rowBytes.length) {
                    const byte = rowBytes[j];
                    const hexByte = byte.toString(16).padStart(2, '0');

                    if (isMatch) {
                        hexStr += `<span class="ss-hex-match">${hexByte}</span> `;
                    } else {
                        hexStr += hexByte + ' ';
                    }

                    // ASCII 字符
                    const char = (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
                    if (isMatch) {
                        asciiStr += `<span class="ss-hex-match">${this.escapeHtml(char)}</span>`;
                    } else {
                        asciiStr += this.escapeHtml(char);
                    }
                } else {
                    hexStr += '   ';
                    asciiStr += ' ';
                }

                // 每8字节添加额外空格
                if (j === 7) {
                    hexStr += ' ';
                }
            }

            rows.push(`
                <div class="ss-hex-row${isHighlightRow ? ' ss-hex-highlight' : ''}">
                    <span class="ss-hex-addr">0x${rowOffset.toString(16).toUpperCase().padStart(8, '0')}</span>
                    <span class="ss-hex-bytes">${hexStr}</span>
                    <span class="ss-hex-ascii">${asciiStr}</span>
                </div>
            `);
        }

        container.innerHTML = rows.join('');
    }

    /**
     * 设置上下文加载状态
     */
    private setContextLoading(loading: boolean): void {
        if (!this.container) return;
        const loadingEl = this.container.querySelector('#contextLoading') as HTMLElement;
        if (loadingEl) {
            loadingEl.style.display = loading ? 'flex' : 'none';
        }
    }

    private handleCopyString = async (): Promise<void> => {
        if (this.currentSelectedString) {
            try {
                await navigator.clipboard.writeText(this.currentSelectedString);
                this.showToast('已复制到剪贴板', 'success');
            } catch (e) {
                console.error('复制失败:', e);
                this.showToast('复制失败', 'error');
            }
        }
    };

    /**
     * 重置详情面板
     */
    private resetDetailPanel(): void {
        if (!this.container) return;
        const emptyDetail = this.container.querySelector('#detailEmptyPanel') as HTMLElement;
        const detailContent = this.container.querySelector('#detailContentPanel') as HTMLElement;
        if (emptyDetail) emptyDetail.style.display = 'flex';
        if (detailContent) detailContent.style.display = 'none';
    }

    /**
     * 获取文件名
     */
    private getFileName(path: string): string {
        const parts = path.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || path;
    }

    /**
     * 应用二次筛选
     */
    private applySecondaryFilter(): void {
        if (!this.currentResults) return;

        if (!this.secondarySearchTerm.trim()) {
            this.filteredResults = null;
        } else {
            const term = this.secondarySearchTerm.toLowerCase();
            this.filteredResults = this.currentResults.strings.filter(str =>
                str.content.toLowerCase().includes(term)
            );
        }

        this.currentPage = 1;
        this.renderResults();
    }

    /**
     * 上一页
     */
    private prevPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderResults();
        }
    }

    /**
     * 下一页
     */
    private nextPage(): void {
        const strings = this.filteredResults || this.currentResults?.strings || [];
        const totalPages = Math.ceil(strings.length / this.pageSize);
        if (this.currentPage < totalPages) {
            this.currentPage++;
            this.renderResults();
        }
    }

    /**
     * 导出结果
     */
    /** 复制当前（过滤/排序后）全部结果内容到剪贴板，每行一条 */
    private async copyAllResults(): Promise<void> {
        const strings = this.getSortedFilteredResults();
        if (strings.length === 0) {
            this.showToast('没有可复制的结果', 'info');
            return;
        }
        const text = strings.map(s => s.content).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(`已复制 ${strings.length} 条结果`, 'success');
        } catch {
            this.showToast('复制失败', 'error');
        }
    }

    private async exportResults(): Promise<void> {
        if (!this.currentResults || this.currentResults.strings.length === 0) return;

        try {
            const savePath = await save({
                filters: [
                    { name: 'CSV', extensions: ['csv'] },
                    { name: 'JSON', extensions: ['json'] },
                    { name: 'Text', extensions: ['txt'] }
                ]
            });

            if (!savePath) return;

            const strings = this.getSortedFilteredResults();
            let content = '';

            if (savePath.endsWith('.csv')) {
                content = 'Offset,Encoding,Length,Entropy,Tags,Content\n' +
                    strings.map(s => {
                        const tags = this.taggedResults.get(this.getTagKey(s)) || [];
                        return `"0x${s.offset.toString(16)}","${s.encoding}","${s.byte_length}","${s.entropy?.toFixed(2) ?? ''}","${tags.join(';')}","${s.content.replace(/"/g, '""')}"`;
                    }).join('\n');
            } else if (savePath.endsWith('.json')) {
                const enriched = strings.map(s => ({
                    ...s,
                    tags: this.taggedResults.get(this.getTagKey(s)) || [],
                    bookmarked: this.bookmarks.some(b => b.offset === s.offset),
                }));
                content = JSON.stringify(enriched, null, 2);
            } else {
                content = strings.map(s => {
                    const tags = this.taggedResults.get(this.getTagKey(s)) || [];
                    const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
                    return `[0x${s.offset.toString(16)}]${tagStr} ${s.content}`;
                }).join('\n');
            }

            await invoke('write_text_file', { path: savePath, content });
            this.showToast('导出成功', 'success');
        } catch (error) {
            console.error('导出失败:', error);
        }
    }

    /**
     * 二次扫描（基于现有结果筛选）
     */
    private async performSecondaryScan(): Promise<void> {
        if (!this.container || !this.currentResults) return;

        const searchPattern = this.searchConfig.search_pattern;
        if (!searchPattern) {
            this.showError('请先输入搜索关键词');
            return;
        }

        const strings = this.filteredResults || this.currentResults.strings;
        if (strings.length === 0) return;

        try {
            // 在当前结果中进行二次筛选
            const filtered = strings.filter(str => {
                if (this.searchConfig.use_regex) {
                    try {
                        const regex = new RegExp(searchPattern, this.searchConfig.case_sensitive ? '' : 'i');
                        return regex.test(str.content);
                    } catch (e) {
                        return false;
                    }
                } else {
                    const content = this.searchConfig.case_sensitive ? str.content : str.content.toLowerCase();
                    const pattern = this.searchConfig.case_sensitive ? searchPattern : searchPattern.toLowerCase();
                    return content.includes(pattern);
                }
            });

            // 更新过滤结果
            this.filteredResults = filtered;
            this.currentPage = 1;
            this.renderResults();

            // 显示提示
            const resultCount = this.container.querySelector('#resultCountPanel');
            if (resultCount) {
                resultCount.textContent = `${filtered.length} 命中 (二次筛选)`;
            }
        } catch (error) {
            console.error('二次扫描失败:', error);
            this.showError('二次扫描失败');
        }
    }

    /**
     * 清空结果
     */
    private clearResults(): void {
        this.currentResults = null;
        this.filteredResults = null;
        this.currentPage = 1;

        // 隐藏二次扫描按钮
        const secondaryScanBtn = this.container?.querySelector('#secondaryScanBtn') as HTMLElement;
        if (secondaryScanBtn) {
            secondaryScanBtn.style.display = 'none';
        }
        this.totalFoundCount = 0;
        this.secondarySearchTerm = '';
        this.sortConfig = null;
        this.columnFilters = { offset: '', encoding: '', content: '' };
        this.selectedIndices.clear();
        this.clusterView = false;
        this.clusters = [];
        this.visualizationVisible = false;
        this.visualizationData = null;

        if (!this.container) return;

        const emptyState = this.container.querySelector('#emptyStatePanel') as HTMLElement;
        const resultsList = this.container.querySelector('#resultsListPanel') as HTMLElement;
        const resultsStats = this.container.querySelector('#resultsStatsPanel') as HTMLElement;
        const pagination = this.container.querySelector('#paginationPanel') as HTMLElement;

        if (emptyState) emptyState.style.display = 'flex';
        if (resultsList) {
            resultsList.style.display = 'none';
            resultsList.innerHTML = '';
        }
        if (resultsStats) resultsStats.style.display = 'none';
        if (pagination) pagination.style.display = 'none';

        this.resetDetailPanel();
    }

    /**
     * 在独立窗口中打开
     */
    private async openInWindow(): Promise<void> {
        try {
            await invoke('open_string_search_window');
        } catch (error) {
            console.error('打开窗口失败:', error);
        }
    }

    /**
     * 显示错误
     */
    private showError(message: string): void {
        console.error('字符串搜索错误:', message);
        this.showToast(message, 'error');
    }

    /**
     * Toast 通知
     */
    private showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
        // 移除旧的 toast
        const existing = document.querySelector('.ss-toast');
        existing?.remove();
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }

        const iconMap: Record<string, string> = {
            success: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            info: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
            warning: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
        };

        const toast = document.createElement('div');
        toast.className = `ss-toast ss-toast-${type}`;
        toast.innerHTML = `${iconMap[type] || ''}<span>${this.escapeHtml(message)}</span>`;
        document.body.appendChild(toast);

        this.toastTimer = setTimeout(() => {
            toast.remove();
            this.toastTimer = null;
        }, 2600);
    }

    /**
     * 高亮搜索匹配文本
     */
    private highlightMatchText(content: string): string {
        const pattern = this.searchConfig.search_pattern;
        if (!pattern) return this.escapeHtml(content);

        try {
            const escaped = this.escapeHtml(content);
            if (this.searchConfig.use_regex) {
                const flags = this.searchConfig.case_sensitive ? 'g' : 'gi';
                const regex = new RegExp(`(${pattern})`, flags);
                return escaped.replace(regex, '<span class="ss-highlight">$1</span>');
            } else {
                const term = this.escapeHtml(pattern);
                const flags = this.searchConfig.case_sensitive ? 'g' : 'gi';
                const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, flags);
                return escaped.replace(regex, '<span class="ss-highlight">$1</span>');
            }
        } catch {
            return this.escapeHtml(content);
        }
    }

    /**
     * HTML转义
     */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== 会话管理 ====================

    /**
     * 保存搜索会话
     */
    private async saveSession(): Promise<void> {
        if (!this.currentResults || this.currentResults.strings.length === 0) {
            this.showToast('没有可保存的结果', 'warning');
            return;
        }

        try {
            const savePath = await save({
                filters: [{ name: 'Search Session', extensions: ['json'] }],
                defaultPath: `string-search-session-${Date.now()}.json`,
            });
            if (!savePath) return;

            const session = {
                version: 1,
                timestamp: Date.now(),
                config: this.searchConfig,
                results: this.currentResults,
                tags: Object.fromEntries(this.taggedResults),
                bookmarks: this.bookmarks,
                entropyFilter: this.entropyFilter,
                sortConfig: this.sortConfig,
            };

            await invoke('write_text_file', {
                path: savePath,
                content: JSON.stringify(session, null, 2)
            });

            this.showToast('会话已保存', 'success');
        } catch (error) {
            console.error('保存会话失败:', error);
            this.showError('保存会话失败');
        }
    }

    /**
     * 加载搜索会话
     */
    private async loadSession(): Promise<void> {
        try {
            const selected = await open({
                filters: [{ name: 'Search Session', extensions: ['json'] }],
                multiple: false,
            });
            if (!selected) return;

            const content = await invoke<string>('read_file', { path: selected });
            const session = JSON.parse(content);

            if (!session.version || !session.results) {
                this.showError('无效的会话文件');
                return;
            }

            // 恢复搜索配置
            if (session.config) {
                this.searchConfig = session.config;
                this.restoreSearchConfig();
            }

            // 恢复结果
            this.currentResults = session.results;
            this.filteredResults = null;
            this.currentPage = 1;

            // 恢复标签
            this.taggedResults = new Map(Object.entries(session.tags || {}));

            // 恢复书签
            this.bookmarks = session.bookmarks || [];

            // 恢复熵值过滤
            if (session.entropyFilter) {
                this.entropyFilter = session.entropyFilter;
                this.restoreEntropyFilter();
            }

            // 恢复排序
            this.sortConfig = session.sortConfig || null;

            // 应用熵值过滤
            if (this.entropyFilter !== 'none') {
                this.applyEntropyFilter();
            }

            this.renderResults();
            this.showToast(`已加载会话 (${this.currentResults?.strings.length ?? 0} 条结果)`, 'success');
        } catch (error) {
            console.error('加载会话失败:', error);
            this.showError('加载会话失败');
        }
    }

    // ==================== YARA 功能 ====================

    /**
     * 加载 YARA 规则文件
     */
    private async yaraLoadRules(): Promise<void> {
        // 已加载规则时再次点击 → 取消 YARA 模式
        if (this.yaraRulePaths.length > 0) {
            this.yaraRulePaths = [];
            this.updateYaraUI();
            this.showToast('已取消 YARA 规则', 'info');
            return;
        }

        try {
            const selected = await open({
                multiple: true,
                filters: [
                    { name: 'YARA Rules', extensions: ['yar', 'yara'] },
                    { name: 'All Files', extensions: ['*'] },
                ]
            });
            if (!selected) return;
            const paths = Array.isArray(selected) ? selected : [selected];
            this.yaraRulePaths = paths;
            this.updateYaraUI();
        } catch (e) {
            console.error('加载规则文件失败:', e);
        }
    }

    /**
     * 更新 YARA 按钮状态 + 搜索框禁用
     */
    private updateYaraUI(): void {
        const btn = this.container?.querySelector('#yaraLoadRulesBtn') as HTMLElement;
        const searchInput = this.container?.querySelector('#searchPatternPanel') as HTMLInputElement;
        const regexBtn = this.container?.querySelector('#useRegexPanel') as HTMLElement;
        const caseBtn = this.container?.querySelector('#caseSensitivePanel') as HTMLElement;
        const hasRules = this.yaraRulePaths.length > 0;

        // 按钮 active
        if (btn) {
            btn.classList.toggle('active', hasRules);
            if (hasRules) {
                const name = this.yaraRulePaths.length === 1
                    ? this.yaraRulePaths[0].split(/[/\\]/).pop() || ''
                    : `${this.yaraRulePaths.length} 个规则`;
                btn.title = `YARA: ${name} (再次点击取消)`;
            } else {
                btn.title = 'YARA 规则扫描 (点击加载规则)';
            }
        }

        // 搜索框禁用
        if (searchInput) {
            searchInput.disabled = hasRules;
            searchInput.placeholder = hasRules ? 'YARA 模式 — 点击搜索按钮执行规则扫描' : '搜索字符串 / 正则表达式...';
        }

        // 正则/大小写按钮禁用
        if (regexBtn) regexBtn.classList.toggle('disabled', hasRules);
        if (caseBtn) caseBtn.classList.toggle('disabled', hasRules);
    }

    /**
     * 获取当前模式的扫描目标路径
     */
    private async getTargetFilePath(): Promise<string> {
        const mode = this.getCurrentMode();
        switch (mode) {
            case 'image': {
                const settings = await loadAppSettings();
                return settings?.current_image_path || '';
            }
            case 'file': {
                const cfg = this.searchConfig.mode;
                if ('FileSearch' in cfg) return cfg.FileSearch.file_path;
                return '';
            }
            default:
                return '';
        }
    }

    /**
     * 开始 YARA 扫描，结果转为 FoundString[] 复用现有列表
     */
    /**
     * 将 YaraRuleMatch 转为 FoundString[]
     */
    private yaraRuleToFoundStrings(rule: YaraRuleMatch): FoundString[] {
        return rule.matched_strings.map(match => ({
            offset: match.offset,
            content: `[${rule.rule_name}] ${match.identifier}: ${match.matched_data_hex.substring(0, 60)}`,
            encoding: 'YARA',
            byte_length: match.length,
            source_file: rule.rule_name,
        }));
    }

    private async startYaraScan(): Promise<void> {
        if (this.yaraRulePaths.length === 0) {
            this.showError('请先加载 YARA 规则文件');
            return;
        }

        const targetPath = await this.getTargetFilePath();
        if (!targetPath) {
            this.showError('请先加载内存镜像或选择文件');
            return;
        }

        this.yaraScanning = true;
        this.currentResults = null;
        this.filteredResults = null;
        this.currentPage = 1;
        this.clusters = [];

        this.updateUIForSearching(true);
        const progressStatus = this.container?.querySelector('#progressStatusPanel');
        if (progressStatus) progressStatus.textContent = '正在执行 YARA 扫描...';

        // 监听进度
        const progressUnlisten = await listen<YaraScanProgress>('yara-scan-progress', (event) => {
            if (!this.yaraScanning) return;
            if (progressStatus) progressStatus.textContent = event.payload.status;
        });

        // 流式批次（每匹配一条规则推送）
        const batchUnlisten = await listen<YaraRuleMatch>('yara-scan-batch', (event) => {
            if (!this.yaraScanning) return;
            const batch = this.yaraRuleToFoundStrings(event.payload);
            if (batch.length > 0) this.handleSearchBatch(batch);
        });

        // 完成事件
        const completedUnlisten = await listen<YaraScanResult>('yara-scan-completed', (event) => {
            const result = event.payload;
            this.yaraResults = result;
            this.yaraScanning = false;

            if (this.batchRenderTimer) {
                clearTimeout(this.batchRenderTimer);
                this.batchRenderTimer = null;
            }

            // 最终完整结果
            const foundStrings = result.matches.flatMap(r => this.yaraRuleToFoundStrings(r));
            foundStrings.sort((a, b) => a.offset - b.offset);
            this.currentResults = {
                strings: foundStrings,
                stats: {
                    duration_ms: result.stats.duration_ms,
                    processed_bytes: result.stats.file_size,
                    total_found: foundStrings.length,
                    encoding_stats: { 'YARA': foundStrings.length },
                },
                truncated: false, page: 1, page_size: foundStrings.length,
                total_pages: 1, has_more: false,
            };
            this.filteredResults = null;
            this.renderResults();
            this.updateUIForSearching(false);
            this.showToast(`YARA: ${result.stats.rules_matched} 规则匹配, ${result.stats.strings_matched} 命中 (${result.stats.duration_ms}ms)`, 'success');

            progressUnlisten();
            batchUnlisten();
            completedUnlisten();
            errorUnlisten();
        });

        // 错误事件
        const errorUnlisten = await listen<string>('yara-scan-error', (event) => {
            this.yaraScanning = false;
            this.updateUIForSearching(false);
            this.showError(`YARA: ${event.payload}`);

            progressUnlisten();
            batchUnlisten();
            completedUnlisten();
            errorUnlisten();
        });

        // 发起扫描（立即返回，结果通过事件推送）
        try {
            await invoke('yara_scan', {
                config: {
                    rule_paths: this.yaraRulePaths,
                    target_path: targetPath,
                } as YaraConfig
            });
        } catch (error) {
            this.yaraScanning = false;
            this.updateUIForSearching(false);
            showFriendlyError(error, 'YARA 扫描');
            progressUnlisten();
            batchUnlisten();
            completedUnlisten();
            errorUnlisten();
        }
    }

    /**
     * P2-B: 渲染可视化图表
     */
    private renderVisualization(): void {
        if (!this.container || !this.currentResults) return;
        const strings = this.filteredResults || this.currentResults.strings;
        if (strings.length === 0) return;

        // 偏移量分布直方图
        this.renderOffsetHistogram(strings);
        // 熵值热力图
        this.renderEntropyHeatmap(strings);
        // 编码分布
        this.renderEncodingPie(strings);
        // 长度分布
        this.renderLengthHistogram(strings);
    }

    private renderOffsetHistogram(strings: FoundString[]): void {
        const canvas = this.container?.querySelector('#vizOffsetCanvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width = canvas.offsetWidth * 2;
        const h = canvas.height = 160;
        ctx.clearRect(0, 0, w, h);

        const offsets = strings.map(s => s.offset);
        const minOff = Math.min(...offsets);
        const maxOff = Math.max(...offsets);
        const range = maxOff - minOff || 1;
        const bucketCount = Math.min(80, strings.length);
        const bucketSize = range / bucketCount;
        const buckets = new Array(bucketCount).fill(0);

        for (const off of offsets) {
            const idx = Math.min(Math.floor((off - minOff) / bucketSize), bucketCount - 1);
            buckets[idx]++;
        }

        const maxCount = Math.max(...buckets, 1);
        const barW = (w - 20) / bucketCount;
        const isDark = document.documentElement.dataset.theme === 'dark';

        ctx.fillStyle = isDark ? '#334155' : '#e2e8f0';
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < bucketCount; i++) {
            const barH = (buckets[i] / maxCount) * (h - 20);
            const x = 10 + i * barW;
            const gradient = ctx.createLinearGradient(x, h - 10, x, h - 10 - barH);
            gradient.addColorStop(0, '#6366f1');
            gradient.addColorStop(1, '#818cf8');
            ctx.fillStyle = gradient;
            ctx.fillRect(x, h - 10 - barH, barW - 1, barH);
        }

        // 绑定点击跳转
        canvas.onclick = (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width * w;
            const bucketIdx = Math.floor((x - 10) / barW);
            if (bucketIdx >= 0 && bucketIdx < bucketCount) {
                const targetOffset = minOff + bucketIdx * bucketSize;
                // 跳转到最接近该偏移的结果
                const closest = strings.reduce((prev, curr) =>
                    Math.abs(curr.offset - targetOffset) < Math.abs(prev.offset - targetOffset) ? curr : prev
                );
                const idx = strings.indexOf(closest);
                if (idx >= 0) {
                    this.currentPage = Math.floor(idx / this.pageSize) + 1;
                    this.renderResults();
                    this.selectResultItem(idx);
                }
            }
        };
    }

    private renderEntropyHeatmap(strings: FoundString[]): void {
        const canvas = this.container?.querySelector('#vizEntropyCanvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width = canvas.offsetWidth * 2;
        const h = canvas.height = 80;
        ctx.clearRect(0, 0, w, h);

        const withEntropy = strings.filter(s => s.entropy !== undefined);
        if (withEntropy.length === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '20px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(translate('无熵值数据'), w / 2, h / 2 + 6);
            return;
        }

        const offsets = withEntropy.map(s => s.offset);
        const minOff = Math.min(...offsets);
        const maxOff = Math.max(...offsets);
        const range = maxOff - minOff || 1;
        const segments = Math.min(w - 20, withEntropy.length);
        const segW = (w - 20) / segments;

        for (let i = 0; i < segments; i++) {
            const targetOff = minOff + (range * i) / segments;
            // 找最近的字符串
            let closest = withEntropy[0];
            let minDist = Infinity;
            for (const s of withEntropy) {
                const dist = Math.abs(s.offset - targetOff);
                if (dist < minDist) { minDist = dist; closest = s; }
            }
            const ent = closest.entropy || 0;
            // 蓝(0) -> 绿(3.5) -> 黄(5.5) -> 红(8)
            const r = ent < 4 ? 0 : Math.min(255, (ent - 4) * 64);
            const g = ent < 3.5 ? Math.min(255, ent * 73) : Math.max(0, 255 - (ent - 3.5) * 57);
            const b = Math.max(0, 255 - ent * 32);
            ctx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
            ctx.fillRect(10 + i * segW, 0, segW + 1, h);
        }
    }

    private renderEncodingPie(strings: FoundString[]): void {
        const canvas = this.container?.querySelector('#vizEncodingCanvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width = 360;
        const h = canvas.height = 200;
        ctx.clearRect(0, 0, w, h);

        const counts: Record<string, number> = {};
        for (const s of strings) {
            counts[s.encoding] = (counts[s.encoding] || 0) + 1;
        }
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const total = strings.length;
        const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];
        const cx = 70, cy = h / 2, r = 55;

        let startAngle = -Math.PI / 2;
        entries.forEach(([_enc, count], i) => {
            const angle = (count / total) * 2 * Math.PI;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, startAngle, startAngle + angle);
            ctx.closePath();
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            startAngle += angle;
        });

        // 图例
        const isDark = document.documentElement.dataset.theme === 'dark';
        ctx.font = '20px sans-serif';
        ctx.textAlign = 'left';
        entries.forEach(([enc, count], i) => {
            const y = 24 + i * 28;
            ctx.fillStyle = colors[i % colors.length];
            ctx.fillRect(150, y - 12, 16, 16);
            ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
            ctx.fillText(`${enc}: ${count} (${((count/total)*100).toFixed(1)}%)`, 172, y);
        });
    }

    private renderLengthHistogram(strings: FoundString[]): void {
        const canvas = this.container?.querySelector('#vizLengthCanvas') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width = 360;
        const h = canvas.height = 200;
        ctx.clearRect(0, 0, w, h);

        const lengths = strings.map(s => s.byte_length);
        const maxLen = Math.min(Math.max(...lengths), 500);
        const bucketCount = 20;
        const bucketSize = Math.max(1, Math.ceil(maxLen / bucketCount));
        const buckets = new Array(bucketCount).fill(0);

        for (const len of lengths) {
            const idx = Math.min(Math.floor(len / bucketSize), bucketCount - 1);
            buckets[idx]++;
        }

        const maxCount = Math.max(...buckets, 1);
        const barW = (w - 40) / bucketCount;
        const isDark = document.documentElement.dataset.theme === 'dark';

        for (let i = 0; i < bucketCount; i++) {
            const barH = (buckets[i] / maxCount) * (h - 40);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(20 + i * barW, h - 20 - barH, barW - 2, barH);
        }

        // 底部标签
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`0`, 20, h - 4);
        ctx.fillText(`${maxLen}b`, w - 20, h - 4);
    }

    /**
     * 销毁面板
     */
    destroy(): void {
        this.unlisteners.forEach(unlisten => unlisten());
        this.unlisteners = [];
        if (this.languageListenerBound) {
            window.removeEventListener(LANGUAGE_DOM_EVENT_NAME, this.handleLanguageChange);
            this.languageListenerBound = false;
        }
        this.container = null;
        this.initialized = false;
    }
}

// 导出单例
export const stringSearchPanel = new StringSearchPanel();

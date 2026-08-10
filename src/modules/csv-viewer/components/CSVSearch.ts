/**
 * CSV搜索组件
 * 负责CSV数据的搜索和过滤功能
 */

/** 搜索选项状态 */
export interface SearchOptionState {
    caseSensitive: boolean;
    wholeWord: boolean;
    useRegex: boolean;
}

/** 搜索组件配置 */
export interface CSVSearchOptions {
    onSearch?: (keyword: string, searchOptions: SearchOptionState) => void;
    onClear?: () => void;
    debounceTime?: number;
    minSearchLength?: number;
    caseSensitive?: boolean;
    [key: string]: unknown;
}

/** 搜索内部状态 */
interface SearchState {
    currentKeyword: string;
    isSearching: boolean;
    searchTimeout: ReturnType<typeof setTimeout> | null;
}

/** 搜索状态快照 */
interface SearchStateSnapshot {
    keyword: string;
    isSearching: boolean;
    hasValue: boolean;
}

export class CSVSearch {
    private searchInput: HTMLInputElement;
    private options: Required<Pick<CSVSearchOptions, 'onSearch' | 'onClear' | 'debounceTime' | 'minSearchLength' | 'caseSensitive'>> & CSVSearchOptions;
    private state: SearchState;
    private searchOptions: SearchOptionState;
    private optionButtons?: Record<keyof SearchOptionState, HTMLButtonElement>;

    constructor(searchInput: HTMLInputElement, options: CSVSearchOptions = {}) {
        this.searchInput = searchInput;
        this.options = {
            onSearch: options.onSearch || (() => {}),
            onClear: options.onClear || (() => {}),
            debounceTime: options.debounceTime || 300,
            minSearchLength: options.minSearchLength || 1,
            caseSensitive: options.caseSensitive || false,
            ...options
        };

        this.state = {
            currentKeyword: '',
            isSearching: false,
            searchTimeout: null
        };

        // 搜索选项状态
        this.searchOptions = {
            caseSensitive: false,
            wholeWord: false,
            useRegex: false
        };

        this.init();
    }

    /**
     * 初始化搜索组件
     */
    init(): void {
        if (!this.searchInput) {
            throw new Error('搜索输入框元素不存在');
        }

        // 添加搜索样式类
        this.searchInput.classList.add('csv-search-input');

        // 创建搜索选项按钮
        this.createSearchOptions();

        // 绑定事件
        this.bindEvents();

        // 添加CSS样式
        this.addSearchStyles();

        console.log('CSV搜索组件初始化完成');
    }

    /**
     * 创建搜索选项按钮
     */
    createSearchOptions(): void {
        const searchContainer = this.searchInput.parentNode as HTMLElement | null;
        if (!searchContainer || !searchContainer.classList.contains('csv-search-container')) {
            console.warn('搜索容器不存在，无法创建搜索选项按钮');
            return;
        }

        // 创建搜索选项容器
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'csv-search-options';

        // 区分大小写按钮
        const caseSensitiveBtn = document.createElement('button');
        caseSensitiveBtn.className = 'csv-search-option-btn';
        caseSensitiveBtn.title = '区分大小写 (Alt+C)';
        caseSensitiveBtn.innerHTML = 'Aa';
        caseSensitiveBtn.dataset.option = 'caseSensitive';

        // 全字匹配按钮
        const wholeWordBtn = document.createElement('button');
        wholeWordBtn.className = 'csv-search-option-btn';
        wholeWordBtn.title = '全字匹配 (Alt+W)';
        wholeWordBtn.innerHTML = 'Ab';
        wholeWordBtn.dataset.option = 'wholeWord';

        // 正则表达式按钮
        const regexBtn = document.createElement('button');
        regexBtn.className = 'csv-search-option-btn';
        regexBtn.title = '使用正则表达式 (Alt+R)';
        regexBtn.innerHTML = '.*';
        regexBtn.dataset.option = 'useRegex';

        // 添加按钮到容器
        optionsContainer.appendChild(caseSensitiveBtn);
        optionsContainer.appendChild(wholeWordBtn);
        optionsContainer.appendChild(regexBtn);

        // 将选项容器添加到搜索容器
        searchContainer.appendChild(optionsContainer);

        // 保存按钮引用
        this.optionButtons = {
            caseSensitive: caseSensitiveBtn,
            wholeWord: wholeWordBtn,
            useRegex: regexBtn
        };

        console.log('搜索选项按钮创建完成');
    }

    /**
     * 绑定事件处理器
     */
    bindEvents(): void {
        // 输入事件 - 防抖搜索
        this.searchInput.addEventListener('input', (e: Event) => {
            this.handleInputChange((e.target as HTMLInputElement).value);
        });

        // 键盘事件
        this.searchInput.addEventListener('keydown', (e: KeyboardEvent) => {
            this.handleKeyDown(e);
        });

        // 焦点事件
        this.searchInput.addEventListener('focus', () => {
            this.handleFocus();
        });

        this.searchInput.addEventListener('blur', () => {
            this.handleBlur();
        });

        // 粘贴事件
        this.searchInput.addEventListener('paste', (e: ClipboardEvent) => {
            setTimeout(() => {
                this.handleInputChange((e.target as HTMLInputElement).value);
            }, 0);
        });

        // 搜索选项按钮事件
        if (this.optionButtons) {
            (Object.entries(this.optionButtons) as [keyof SearchOptionState, HTMLButtonElement][]).forEach(([option, button]) => {
                button.addEventListener('click', (e: MouseEvent) => {
                    e.preventDefault();
                    this.toggleSearchOption(option);
                });
            });
        }

        // 全局键盘快捷键
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.altKey && !e.ctrlKey && !e.shiftKey) {
                switch (e.key.toLowerCase()) {
                    case 'c':
                        e.preventDefault();
                        this.toggleSearchOption('caseSensitive');
                        break;
                    case 'w':
                        e.preventDefault();
                        this.toggleSearchOption('wholeWord');
                        break;
                    case 'r':
                        e.preventDefault();
                        this.toggleSearchOption('useRegex');
                        break;
                }
            }
        });
    }

    /**
     * 切换搜索选项
     */
    toggleSearchOption(option: keyof SearchOptionState): void {
        if (!Object.prototype.hasOwnProperty.call(this.searchOptions, option)) {
            console.warn('未知的搜索选项:', option);
            return;
        }

        // 切换选项状态
        this.searchOptions[option] = !this.searchOptions[option];

        // 更新按钮样式
        const button = this.optionButtons?.[option];
        if (button) {
            if (this.searchOptions[option]) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }

        // 如果有搜索关键词，重新执行搜索
        if (this.state.currentKeyword) {
            this.performSearchImmediate();
        }

        console.log(`搜索选项 ${option} 已${this.searchOptions[option] ? '启用' : '禁用'}`);
    }

    /**
     * 处理输入变化
     */
    handleInputChange(value: string): void {
        const keyword = value.trim();

        // 清除之前的搜索计时器
        if (this.state.searchTimeout) {
            clearTimeout(this.state.searchTimeout);
        }

        // 如果输入为空，立即清除搜索
        if (keyword === '') {
            this.clearSearch();
            return;
        }

        // 如果关键词长度不足最小要求，不执行搜索
        if (keyword.length < this.options.minSearchLength) {
            return;
        }

        // 防抖搜索
        this.state.searchTimeout = setTimeout(() => {
            this.performSearch(keyword);
        }, this.options.debounceTime);
    }

    /**
     * 处理键盘事件
     */
    handleKeyDown(e: KeyboardEvent): void {
        switch (e.key) {
            case 'Enter':
                e.preventDefault();
                this.performSearchImmediate();
                break;
            case 'Escape':
                e.preventDefault();
                this.clearSearch();
                this.searchInput.blur();
                break;
            case 'ArrowDown':
                // 可以在这里实现搜索建议导航
                break;
            case 'ArrowUp':
                // 可以在这里实现搜索建议导航
                break;
        }
    }

    /**
     * 处理焦点获得
     */
    handleFocus(): void {
        this.searchInput.classList.add('csv-search-focused');
    }

    /**
     * 处理焦点失去
     */
    handleBlur(): void {
        this.searchInput.classList.remove('csv-search-focused');
    }

    /**
     * 立即执行搜索
     */
    performSearchImmediate(): void {
        const keyword = this.searchInput.value.trim();

        // 清除防抖计时器
        if (this.state.searchTimeout) {
            clearTimeout(this.state.searchTimeout);
            this.state.searchTimeout = null;
        }

        if (keyword === '') {
            this.clearSearch();
        } else {
            this.performSearch(keyword);
        }
    }

    /**
     * 执行搜索
     */
    performSearch(keyword: string): void {
        console.log('执行搜索:', keyword);

        this.state.currentKeyword = keyword;
        this.state.isSearching = true;

        try {
            // 触发搜索回调，传递搜索选项
            this.options.onSearch(keyword, this.searchOptions);

            console.log('搜索完成:', keyword, this.searchOptions);
        } catch (error) {
            console.error('搜索失败:', error);
        } finally {
            this.state.isSearching = false;
        }
    }

    /**
     * 清除搜索
     */
    clearSearch(): void {
        console.log('清除搜索');

        // 清除输入框内容
        this.searchInput.value = '';

        // 清除搜索状态
        this.state.currentKeyword = '';
        this.state.isSearching = false;

        // 清除防抖计时器
        if (this.state.searchTimeout) {
            clearTimeout(this.state.searchTimeout);
            this.state.searchTimeout = null;
        }

        // 触发清除回调
        this.options.onClear();
    }

    /**
     * 添加搜索相关样式
     * 注意：样式已迁移到 src/css/inline-styles.css
     */
    addSearchStyles(): void {
        // 样式已迁移到独立的CSS文件中，这里不再需要添加内联样式
        // 确保CSS文件已加载
        this.ensureInlineStylesLoaded();
    }

    /**
     * 确保内联样式文件已加载
     */
    ensureInlineStylesLoaded(): void {
        if (document.getElementById('inline-styles')) {
            return;
        }

        const link = document.createElement('link');
        link.id = 'inline-styles';
        link.rel = 'stylesheet';
        link.href = 'src/css/inline-styles.css';
        document.head.appendChild(link);
    }

    /**
     * 设置搜索关键词
     */
    setKeyword(keyword: string): void {
        this.searchInput.value = keyword;
        this.handleInputChange(keyword);
    }

    /**
     * 获取当前搜索关键词
     */
    getKeyword(): string {
        return this.state.currentKeyword;
    }

    /**
     * 获取搜索状态
     */
    getSearchState(): SearchStateSnapshot {
        return {
            keyword: this.state.currentKeyword,
            isSearching: this.state.isSearching,
            hasValue: this.searchInput.value.trim() !== ''
        };
    }

    /**
     * 启用/禁用搜索
     */
    setEnabled(enabled: boolean): void {
        this.searchInput.disabled = !enabled;

        if (enabled) {
            this.searchInput.classList.remove('csv-search-disabled');
        } else {
            this.searchInput.classList.add('csv-search-disabled');
        }
    }

    /**
     * 聚焦搜索框
     */
    focus(): void {
        this.searchInput.focus();
    }

    /**
     * 清理组件
     */
    cleanup(): void {
        // 清除计时器
        if (this.state.searchTimeout) {
            clearTimeout(this.state.searchTimeout);
        }

        // 移除搜索选项按钮
        const optionsContainer = this.searchInput?.parentNode?.querySelector('.csv-search-options');
        if (optionsContainer && optionsContainer.parentNode) {
            optionsContainer.parentNode.removeChild(optionsContainer);
        }

        // 清除搜索状态
        this.clearSearch();

        console.log('CSV搜索组件已清理');
    }
}

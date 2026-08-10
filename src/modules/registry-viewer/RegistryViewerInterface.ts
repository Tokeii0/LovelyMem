import { invoke } from '@tauri-apps/api/core';
import './styles/registry-viewer-embedded.css';
import { mountPath } from '../core/mountDrive';
import IconParkHelper from '../utils/iconparkHelper';
import { MessageManager } from '../utils/message';
import { friendlyError } from '../utils/errorMessage';
import { skeletonRows } from '../utils/skeleton';

interface RegistryEntry {
    name: string;
    is_directory: boolean;
    last_modified?: string;
}

interface RegistryValue {
    name: string;
    value_type: string;
    data: string;
}

interface RegistryValueDetail {
    name: string;
    value_type: string;
    data_text: string;
    data_hex: string;
    data_size: number;
}

export class RegistryViewerInterface {
    private container: HTMLElement | null = null;
    private currentPath: string = '';
    private expandedKeys: Set<string> = new Set();

    // 数据源模式
    private registrySource: 'memprocfs' | 'vol3' = 'memprocfs';
    // Vol3解析后的内存树 (或者dump出的hive路径列表)
    private vol3DumpedFiles: string[] = [];
    private vol3HivesLoaded: boolean = false;
    private vol3Loading: boolean = false;

    // 缓存的 SVG 图标
    private icons = {
        refresh: IconParkHelper.getSvgString('refresh', { size: 16 }),
        folder: IconParkHelper.getSvgString('folder', { size: 14 }),
        folderOpen: IconParkHelper.getSvgString('folder-open', { size: 14 }),
        file: IconParkHelper.getSvgString('file-text', { size: 14 }),
        edit: IconParkHelper.getSvgString('edit', { size: 14 }),
        save: IconParkHelper.getSvgString('save', { size: 14 }),
        openFile: IconParkHelper.getSvgString('folder-open', { size: 16 }),
    };

    // 当前显示的值列表（用于 Vol3 模式值详情）
    private currentValues: RegistryValue[] = [];
    // 当前键的元数据
    private currentKeyMeta: { lastModified?: string; subkeyCount?: number; valueCount?: number } = {};
    
    constructor() {}

    public render(): string {
        // memprocfs 模式下默认显示注册表根（按挂载盘符）。此时主窗口已 initMountDrive。
        if (!this.currentPath) {
            this.currentPath = mountPath('registry');
        }
        return `
            <div class="registry-viewer-container" id="registry-viewer-root">
                <div class="registry-sidebar">
                    <div class="registry-sidebar-header">
                        <span>注册表结构</span>
                        <button class="icon-btn" id="refresh-registry-btn" title="刷新">${this.icons.refresh}</button>
                    </div>
                    <div class="registry-source-toggle" style="display:flex;gap:2px;padding:4px 8px;background:var(--bg-tertiary,#f1f5f9);border-radius:6px;margin:6px 8px">
                        <button class="registry-src-btn" data-src="memprocfs"
                            style="flex:1;padding:4px 8px;border:none;border-radius:4px;font-size:11px;cursor:pointer;transition:all .2s">MemProcFS</button>
                        <button class="registry-src-btn" data-src="vol3"
                            style="flex:1;padding:4px 8px;border:none;border-radius:4px;font-size:11px;cursor:pointer;transition:all .2s">Vol3</button>
                    </div>
                    <div class="registry-tree" id="registry-tree-content">
                        <div class="registry-loading">正在加载...</div>
                    </div>
                </div>
                <div class="registry-resizer" id="registry-resizer"></div>
                <div class="registry-content">
                    <div class="registry-path-bar">
                        <span style="margin-right: 8px;">地址:</span>
                        <input type="text" class="registry-path-input" id="registry-path-input" readonly value="${this.currentPath}">
                    </div>
                    <div class="registry-values-list" id="registry-values-content">
                        <!-- Values list will be injected here -->
                    </div>
                </div>
            </div>
        `;
    }

    public async initialize(container: HTMLElement): Promise<void> {
        this.container = container;

        this.bindEvents();

        if (this.registrySource === 'vol3') {
            if (this.vol3HivesLoaded) {
                await this.renderVol3Hives();
            } else {
                await this.loadVol3Registry();
            }
        } else if (this.registrySource === 'memprocfs') {
            await this.loadRoot();
        }
    }

    private bindEvents(): void {
        if (!this.container) return;

        // 数据源切换
        this.container.querySelectorAll('.registry-src-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const src = btn.getAttribute('data-src') as 'memprocfs' | 'vol3';
                if (src === this.registrySource) return;
                this.registrySource = src;
                this.expandedKeys.clear();
                this.updateToggleStyles();
                if (src === 'memprocfs') {
                    this.loadRoot();
                } else if (src === 'vol3') {
                    if (this.vol3HivesLoaded) {
                        this.renderVol3Hives();
                    } else {
                        this.loadVol3Registry();
                    }
                }
            });
        });
        // 初始化按钮样式
        this.updateToggleStyles();

        const refreshBtn = this.container.querySelector('#refresh-registry-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (this.registrySource === 'vol3') {
                    this.vol3HivesLoaded = false;
                    this.vol3DumpedFiles = [];
                    this.loadVol3Registry();
                } else {
                    this.loadRoot();
                }
            });
        }

        // Resizer logic
        const resizer = this.container.querySelector('#registry-resizer') as HTMLElement;
        const sidebar = this.container.querySelector('.registry-sidebar') as HTMLElement;
        
        if (resizer && sidebar) {
            let isResizing = false;
            let startX = 0;
            let startWidth = 0;

            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startWidth = sidebar.getBoundingClientRect().width;
                resizer.classList.add('resizing');
                document.body.style.cursor = 'col-resize';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                const width = startWidth + (e.clientX - startX);
                if (width > 200 && width < 600) {
                    sidebar.style.width = `${width}px`;
                }
            });

            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    resizer.classList.remove('resizing');
                    document.body.style.cursor = '';
                }
            });
        }
    }

    private updateToggleStyles(): void {
        if (!this.container) return;
        this.container.querySelectorAll('.registry-src-btn').forEach(btn => {
            const src = btn.getAttribute('data-src');
            const isActive = src === this.registrySource;
            (btn as HTMLElement).style.background = isActive ? 'var(--accent-color,#667eea)' : 'transparent';
            (btn as HTMLElement).style.color = isActive ? '#fff' : 'var(--text-secondary,#64748b)';
            (btn as HTMLElement).style.fontWeight = isActive ? '600' : '400';
        });
    }

    private async loadRoot(): Promise<void> {
        const treeContainer = this.container?.querySelector('#registry-tree-content');
        if (!treeContainer) return;

        treeContainer.innerHTML = '';

        // Start with {挂载盘符}:\registry
        const rootPath = mountPath('registry');
        const rootItem = this.createTreeItem('Registry', rootPath, true);
        treeContainer.appendChild(rootItem);
        
        // Auto expand root
        await this.toggleNode(rootItem, rootPath);
    }

    private createTreeItem(name: string, path: string, hasChildren: boolean): HTMLElement {
        const div = document.createElement('div');
        div.className = 'registry-tree-node';
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'registry-tree-item';
        itemDiv.dataset.path = path;
        
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.innerHTML = hasChildren ? IconParkHelper.getSvgString('right', { size: 10 }) : '';
        
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.innerHTML = this.icons.folder;
        
        const text = document.createElement('span');
        text.textContent = name;
        
        itemDiv.appendChild(toggleIcon);
        itemDiv.appendChild(icon);
        itemDiv.appendChild(text);
        
        div.appendChild(itemDiv);
        
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'registry-tree-children';
        div.appendChild(childrenDiv);

        // Events
        itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(itemDiv, path);
        });

        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNode(div, path);
        });
        
        // Double click to toggle
        itemDiv.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.toggleNode(div, path);
        });

        return div;
    }

    private async toggleNode(nodeDiv: HTMLElement, path: string): Promise<void> {
        const childrenDiv = nodeDiv.querySelector('.registry-tree-children') as HTMLElement;
        const toggleIcon = nodeDiv.querySelector('.toggle-icon') as HTMLElement;
        
        if (childrenDiv.classList.contains('expanded')) {
            childrenDiv.classList.remove('expanded');
            toggleIcon.classList.remove('expanded');
            this.expandedKeys.delete(path);
        } else {
            childrenDiv.classList.add('expanded');
            toggleIcon.classList.add('expanded');
            this.expandedKeys.add(path);
            
            if (childrenDiv.children.length === 0) {
                await this.loadChildren(childrenDiv, path);
            }
        }
    }

    private async loadChildren(container: HTMLElement, path: string): Promise<void> {
        container.innerHTML = skeletonRows(3);
        
        try {
            const entries: RegistryEntry[] = await invoke('read_registry_directory', { path });
            
            container.innerHTML = '';
            
            // Hidden directories to exclude at root
            const HIDDEN_DIRS = new Set(['by-hive', 'hive_files', 'hive_memory']);
            const pathParts = path.split(/\\|\//).filter(Boolean);
            const isRootRegistry = pathParts.length > 0 && pathParts[pathParts.length - 1].toLowerCase() === 'registry';
            
            // Filter for directories (keys)
            const dirs = entries
                .filter(e => e.is_directory)
                .filter(e => {
                    if (isRootRegistry) {
                        return !HIDDEN_DIRS.has(e.name.toLowerCase());
                    }
                    return true;
                })
                .sort((a, b) => a.name.localeCompare(b.name));
            
            if (dirs.length === 0) {
                container.innerHTML = '<div style="padding-left: 20px; color: #888;">无子项</div>';
                return;
            }

            for (const dir of dirs) {
                const childPath = `${path}\\${dir.name}`;
                const item = this.createTreeItem(dir.name, childPath, true);
                container.appendChild(item);
            }
        } catch (error) {
            console.error('Failed to load registry keys:', error);
            container.innerHTML = `<div style="padding-left: 20px; color: red;">加载失败: ${friendlyError(error).message}</div>`;
        }
    }

    private async selectNode(itemDiv: HTMLElement, path: string): Promise<void> {
        const HIDDEN_DIRS = new Set(['by-hive', 'hive_files', 'hive_memory']);
        const pathParts = path.split(/\\|\//).filter(Boolean);
        const lastPart = pathParts.length ? pathParts[pathParts.length - 1].toLowerCase() : '';
        if (HIDDEN_DIRS.has(lastPart)) {
            // Prevent selecting hidden directories
            return;
        }
        // Update UI selection
        const allItems = this.container?.querySelectorAll('.registry-tree-item');
        allItems?.forEach(el => el.classList.remove('selected'));
        itemDiv.classList.add('selected');
        
        this.currentPath = path;
        const pathInput = this.container?.querySelector('#registry-path-input') as HTMLInputElement;
        if (pathInput) pathInput.value = path;
        
        await this.loadValues(path);
    }

    private async loadValues(path: string): Promise<void> {
        const valuesContainer = this.container?.querySelector('#registry-values-content');
        if (!valuesContainer) return;
        
        valuesContainer.innerHTML = '<div class="registry-loading">正在读取键值...</div>';
        
        try {
            const values: RegistryValue[] = await invoke('read_registry_values', { path });
            this.currentKeyMeta = { valueCount: values.length };
            this.renderValuesTable(values);
        } catch (error) {
            console.error('Failed to load registry values:', error);
            valuesContainer.innerHTML = `<div class="registry-loading" style="color: red;">读取失败: ${error}</div>`;
        }
    }

    // ---- Vol3 注册表模式方法 ----

    private async renderVol3Hives(): Promise<void> {
        const treeContainer = this.container?.querySelector('#registry-tree-content');
        if (!treeContainer) return;
        treeContainer.innerHTML = '';
        if (this.vol3DumpedFiles.length === 0) {
            treeContainer.innerHTML = '<div class="registry-loading" style="color:var(--text-secondary)">未找到任何 Hive 文件</div>';
            return;
        }
        for (const filePath of this.vol3DumpedFiles) {
            const fileName = filePath.split(/[/\\]/).pop() || filePath;
            const item = await this.createHiveRootItem(fileName, filePath);
            treeContainer.appendChild(item);
        }
    }

    private async loadVol3Registry(): Promise<void> {
        if (this.vol3Loading) return;
        const treeContainer = this.container?.querySelector('#registry-tree-content');
        if (!treeContainer) return;

        const state = (window as any).modernUIRenderer?.getState?.();
        const imagePath = state?.currentImage?.path;
        if (!imagePath) {
            treeContainer.innerHTML = '<div class="registry-loading" style="color:var(--text-secondary)">请先加载内存镜像文件</div>';
            return;
        }

        const { loadAppSettings } = await import('../core/settingsHelper');
        const settings = await loadAppSettings();
        if (!settings.python3_path || !settings.volatility3_path) {
            treeContainer.innerHTML = '<div class="registry-loading" style="color:var(--text-secondary)">请先在设置中配置Python3和Volatility3路径</div>';
            return;
        }

        this.vol3Loading = true;
        treeContainer.innerHTML = '<div class="registry-loading">正在提取注册表 Hive 文件...<br><span style="font-size:11px;color:var(--text-secondary)">这可能需要几分钟时间，请耐心等待</span></div>';

        const outputDir = settings.output_path ? `${settings.output_path}/volatility3` : '';

        try {
            const dumpedFiles: string[] = await invoke('execute_vol3_dump_hives', {
                pythonPath: settings.python3_path,
                volatility3Path: settings.volatility3_path,
                imagePath,
                offline: false,
                outputDir
            });
            
            this.vol3DumpedFiles = dumpedFiles;
            this.vol3HivesLoaded = true;
            await this.renderVol3Hives();
        } catch (error) {
            console.error('Vol3 dump hives failed:', error);
            treeContainer.innerHTML = `<div class="registry-loading" style="color:red">提取 Hive 失败: ${error}</div>`;
        } finally {
            this.vol3Loading = false;
        }
    }

    private async createHiveRootItem(fileName: string, filePath: string): Promise<HTMLElement> {
        const div = document.createElement('div');
        div.className = 'registry-tree-node';

        const itemDiv = document.createElement('div');
        itemDiv.className = 'registry-tree-item';
        itemDiv.dataset.hivePath = filePath;
        // 初始根节点路径为空，代表根
        itemDiv.dataset.keyPath = "";

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.innerHTML = IconParkHelper.getSvgString('right', { size: 10 });

        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.innerHTML = this.icons.folder;

        const text = document.createElement('span');
        text.textContent = fileName;

        itemDiv.appendChild(toggleIcon);
        itemDiv.appendChild(icon);
        itemDiv.appendChild(text);

        div.appendChild(itemDiv);

        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'registry-tree-children';
        childrenDiv.style.display = 'none';
        div.appendChild(childrenDiv);

        let loaded = false;

        itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectHiveNode(itemDiv, filePath, "");
        });

        itemDiv.addEventListener('dblclick', async (e) => {
            e.stopPropagation();
            if (!loaded) {
                // 第一次展开时，通过 init_registry_hive 解析整个根键
                await this.loadHiveRootChildren(childrenDiv, filePath);
                loaded = true;
            }
            const isExpanded = childrenDiv.style.display !== 'none';
            childrenDiv.style.display = isExpanded ? 'none' : 'block';
            toggleIcon.innerHTML = isExpanded 
                ? IconParkHelper.getSvgString('right', { size: 10 })
                : IconParkHelper.getSvgString('down', { size: 10 });
        });

        toggleIcon.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!loaded) {
                await this.loadHiveRootChildren(childrenDiv, filePath);
                loaded = true;
            }
            const isExpanded = childrenDiv.style.display !== 'none';
            childrenDiv.style.display = isExpanded ? 'none' : 'block';
            toggleIcon.innerHTML = isExpanded 
                ? IconParkHelper.getSvgString('right', { size: 10 })
                : IconParkHelper.getSvgString('down', { size: 10 });
        });

        return div;
    }

    private async loadHiveRootChildren(container: HTMLElement, filePath: string): Promise<void> {
        container.innerHTML = skeletonRows(3);
        try {
            const rootKey: any = await invoke('init_registry_hive', { filePath });
            container.innerHTML = '';
            
            // rootKey contains the root of the hive. Often the root is something like "ROOT" or "$$PROTO.HIV".
            // Its immediate children are what we want to display.
            const sortedSubkeys = Object.values(rootKey.subkeys || {}).sort((a: any, b: any) => a.name.localeCompare(b.name));
            for (const subkey of sortedSubkeys) {
                const childEl = this.createHiveChildItem(filePath, (subkey as any).name, subkey);
                container.appendChild(childEl);
            }
            if (sortedSubkeys.length === 0) {
                container.innerHTML = '<div style="padding-left: 20px; color: var(--text-secondary); font-size: 12px;">(空)</div>';
            }
        } catch (error) {
            container.innerHTML = `<div style="padding-left: 20px; color: red; font-size: 12px;">加载失败</div>`;
            console.error("加载Hive根失败:", error);
        }
    }

    private createHiveChildItem(filePath: string, keyPath: string, keyData: any): HTMLElement {
        const div = document.createElement('div');
        div.className = 'registry-tree-node';

        const itemDiv = document.createElement('div');
        itemDiv.className = 'registry-tree-item';
        itemDiv.dataset.hivePath = filePath;
        itemDiv.dataset.keyPath = keyPath;

        // 由于懒加载的占位符没有真实的子键列表（Object.keys(subkeys).length === 0），
        // 或者此时还不知道它有没有子键，所以统一设为可展开。展开如果空会显示(空)
        const hasChildren = true;

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'toggle-icon';
        toggleIcon.innerHTML = hasChildren ? IconParkHelper.getSvgString('right', { size: 10 }) : '';

        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.innerHTML = this.icons.folder;

        const text = document.createElement('span');
        text.textContent = keyData.name;

        itemDiv.appendChild(toggleIcon);
        itemDiv.appendChild(icon);
        itemDiv.appendChild(text);

        div.appendChild(itemDiv);

        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'registry-tree-children';
        childrenDiv.style.display = 'none';
        div.appendChild(childrenDiv);

        let loaded = false;

        itemDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            // 选择此节点并显示值，不传入预加载的值，强制去后端拿真实的值
            this.selectHiveNode(itemDiv, filePath, keyPath);
        });

        if (hasChildren) {
            const toggleFn = async (e: Event) => {
                e.stopPropagation();
                if (!loaded) {
                    await this.loadHiveChildren(childrenDiv, filePath, keyPath);
                    loaded = true;
                }
                const isExpanded = childrenDiv.style.display !== 'none';
                childrenDiv.style.display = isExpanded ? 'none' : 'block';
                toggleIcon.innerHTML = isExpanded 
                    ? IconParkHelper.getSvgString('right', { size: 10 })
                    : IconParkHelper.getSvgString('down', { size: 10 });
            };
            itemDiv.addEventListener('dblclick', toggleFn);
            toggleIcon.addEventListener('click', toggleFn);
        }

        return div;
    }

    private async loadHiveChildren(container: HTMLElement, filePath: string, keyPath: string): Promise<void> {
        container.innerHTML = skeletonRows(3);
        try {
            const keyData: any = await invoke('load_registry_key', { filePath, keyPath });
            container.innerHTML = '';
            
            const sortedSubkeys = Object.values(keyData.subkeys || {}).sort((a: any, b: any) => a.name.localeCompare(b.name));
            for (const subkey of sortedSubkeys) {
                const childPath = keyPath ? `${keyPath}\\${(subkey as any).name}` : (subkey as any).name;
                const childEl = this.createHiveChildItem(filePath, childPath, subkey);
                container.appendChild(childEl);
            }
            if (sortedSubkeys.length === 0) {
                container.innerHTML = '<div style="padding-left: 20px; color: var(--text-secondary); font-size: 12px;">(空)</div>';
            }
        } catch (error) {
            container.innerHTML = `<div style="padding-left: 20px; color: red; font-size: 12px;">加载失败</div>`;
            console.error("加载Hive子键失败:", error);
        }
    }

    private async selectHiveNode(itemDiv: HTMLElement, filePath: string, keyPath: string, preloadedValues?: any): Promise<void> {
        // 更新选中状态
        this.container?.querySelectorAll('.registry-tree-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        itemDiv.classList.add('selected');

        // 更新路径输入框
        this.currentPath = `[Vol3] ${filePath.split(/[/\\]/).pop()}${keyPath ? ' \\ ' + keyPath : ''}`;
        const pathInput = this.container?.querySelector('#registry-path-input') as HTMLInputElement;
        if (pathInput) pathInput.value = this.currentPath;

        const valuesContainer = this.container?.querySelector('#registry-values-content');
        if (!valuesContainer) return;

        const parseKeyData = (keyData: any) => {
            const vals = Object.entries(keyData.values || {}).map(([name, v]: [string, any]) => ({
                name: name || '(Default)',
                value_type: v.value_type,
                data: v.data || ''
            }));
            this.currentKeyMeta = {
                lastModified: keyData.last_modified,
                subkeyCount: Object.keys(keyData.subkeys || {}).length,
                valueCount: vals.length
            };
            return vals;
        };

        if (preloadedValues) {
            const vals = parseKeyData({ values: preloadedValues, subkeys: {} });
            this.currentValues = vals;
            this.renderValuesTable(vals as RegistryValue[]);
        } else {
            valuesContainer.innerHTML = '<div class="registry-loading">正在读取键值...</div>';
            try {
                let keyData: any;
                if (!keyPath) {
                    keyData = await invoke('init_registry_hive', { filePath });
                } else {
                    keyData = await invoke('load_registry_key', { filePath, keyPath });
                }
                const vals = parseKeyData(keyData);
                this.currentValues = vals;
                this.renderValuesTable(vals as RegistryValue[]);
            } catch (error) {
                valuesContainer.innerHTML = `<div class="registry-loading" style="color: red;">读取失败: ${error}</div>`;
            }
        }
    }

    private getTypeColor(valueType: string): string {
        switch (valueType) {
            case 'REG_SZ': case 'REG_EXPAND_SZ': case 'REG_LINK': return '#3b82f6';
            case 'REG_DWORD': case 'REG_DWORD_BIG_ENDIAN': return '#10b981';
            case 'REG_QWORD': return '#06b6d4';
            case 'REG_BINARY': return '#f59e0b';
            case 'REG_MULTI_SZ': return '#8b5cf6';
            case 'REG_NONE': return '#6b7280';
            default: return '#ef4444';
        }
    }

    private renderValuesTable(values: RegistryValue[]): void {
        const valuesContainer = this.container?.querySelector('#registry-values-content');
        if (!valuesContainer) return;
        this.currentValues = values;

        valuesContainer.innerHTML = '';

        // 键元数据信息栏
        if (this.currentKeyMeta.lastModified || this.currentKeyMeta.subkeyCount !== undefined) {
            const metaBar = document.createElement('div');
            metaBar.className = 'registry-key-meta fade-in';
            const parts: string[] = [];
            if (this.currentKeyMeta.lastModified) {
                parts.push(`<span class="meta-item" title="最后修改时间">🕐 ${this.currentKeyMeta.lastModified}</span>`);
            }
            if (this.currentKeyMeta.subkeyCount !== undefined) {
                parts.push(`<span class="meta-item" title="子键数量">📁 ${this.currentKeyMeta.subkeyCount} 个子键</span>`);
            }
            if (this.currentKeyMeta.valueCount !== undefined) {
                parts.push(`<span class="meta-item" title="值数量">📝 ${this.currentKeyMeta.valueCount} 个值</span>`);
            }
            metaBar.innerHTML = parts.join('<span class="meta-sep">|</span>');
            valuesContainer.appendChild(metaBar);
        }

        if (values.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'registry-loading fade-in';
            emptyMsg.textContent = '此键下无值';
            valuesContainer.appendChild(emptyMsg);
            return;
        }

        const table = document.createElement('table');
        table.className = 'registry-values-table fade-in';
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width: 200px;">名称</th>
                    <th style="width: 140px;">类型</th>
                    <th>数据</th>
                </tr>
            </thead>
            <tbody>
            </tbody>
        `;

        const tbody = table.querySelector('tbody')!;

        // 超大键限制初始渲染行数，避免一次性渲染数千行导致界面卡顿（真实键几乎不会触及）
        const MAX_RENDER = 2000;
        const renderValues = values.length > MAX_RENDER ? values.slice(0, MAX_RENDER) : values;

        renderValues.forEach((val, index) => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.className = 'value-row';
            tr.style.animationDelay = `${Math.min(index * 20, 400)}ms`;

            let displayData = val.data;
            const isBinaryLike = val.value_type === 'REG_BINARY' || /^[0-9a-f]{2}(\s[0-9a-f]{2})+/i.test(displayData);
            if (displayData.length > 120) displayData = displayData.substring(0, 120) + '...';

            const typeColor = this.getTypeColor(val.value_type);
            const dataClass = isBinaryLike ? 'data-hex' : '';

            tr.innerHTML = `
                <td><span class="registry-value-icon">${this.icons.file}</span>${this.escapeHtml(val.name || '(默认)')}</td>
                <td><span class="registry-type-badge" style="background:${typeColor}15;color:${typeColor};border:1px solid ${typeColor}30">${val.value_type.replace('REG_', '')}</span></td>
                <td class="${dataClass}" title="${this.escapeHtml(val.data)}">${this.escapeHtml(displayData)}</td>
            `;

            // 双击显示详情
            tr.addEventListener('dblclick', () => {
                this.showValueDetail(val.name);
            });

            // 右键菜单
            tr.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, val);
            });

            tbody.appendChild(tr);
        });

        if (values.length > MAX_RENDER) {
            const noticeRow = document.createElement('tr');
            noticeRow.innerHTML = `<td colspan="3" class="registry-values-truncated" style="text-align:center;opacity:0.7;padding:10px;">仅显示前 ${MAX_RENDER} / ${values.length} 个值（已截断以保持界面流畅）</td>`;
            tbody.appendChild(noticeRow);
        }

        valuesContainer.appendChild(table);
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    private showContextMenu(e: MouseEvent, val: RegistryValue): void {
        // 移除旧的右键菜单
        document.querySelectorAll('.registry-context-menu').forEach(el => el.remove());

        const menu = document.createElement('div');
        menu.className = 'registry-context-menu';
        menu.innerHTML = `
            <div class="ctx-item" data-action="copy-name">复制值名称</div>
            <div class="ctx-item" data-action="copy-data">复制值数据</div>
            <div class="ctx-item" data-action="copy-path">复制键路径</div>
            <div class="ctx-sep"></div>
            <div class="ctx-item" data-action="detail">查看详情</div>
        `;
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        document.body.appendChild(menu);

        menu.addEventListener('click', (ev) => {
            const action = (ev.target as HTMLElement).dataset.action;
            if (action === 'copy-name') { navigator.clipboard.writeText(val.name); MessageManager.showSuccess('已复制'); }
            if (action === 'copy-data') { navigator.clipboard.writeText(val.data); MessageManager.showSuccess('已复制'); }
            if (action === 'copy-path') { navigator.clipboard.writeText(this.currentPath); MessageManager.showSuccess('已复制'); }
            if (action === 'detail') this.showValueDetail(val.name);
            menu.remove();
        });

        // 点击其他地方关闭
        const closeMenu = () => { menu.remove(); document.removeEventListener('click', closeMenu); };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    private async showValueDetail(valueName: string): Promise<void> {
        if (this.registrySource === 'vol3') {
            // Vol3 模式：从缓存的值列表构建详情
            const val = this.currentValues.find(v => v.name === valueName);
            if (val) {
                const dataStr = val.data || '';
                // 生成 hex dump
                const hexDump = this.generateHexPreview(dataStr);
                this.renderDetailModal({
                    name: val.name,
                    value_type: val.value_type,
                    data_text: dataStr,
                    data_hex: hexDump,
                    data_size: new TextEncoder().encode(dataStr).length
                });
            }
            return;
        }
        try {
            const detail: RegistryValueDetail = await invoke('read_registry_value_detail', {
                path: this.currentPath,
                valueName: valueName
            });

            this.renderDetailModal(detail);
        } catch (error) {
            console.error('Failed to load value detail:', error);
            MessageManager.showError(`加载详情失败: ${error}`);
        }
    }

    private generateHexPreview(data: string): string {
        // 如果数据已经是 hex 格式（如 "0a 1b 2c..."），直接返回
        if (/^[0-9a-f]{2}(\s[0-9a-f]{2})*$/i.test(data.trim())) {
            return data;
        }
        // 否则将文本转成 hex
        const bytes = new TextEncoder().encode(data);
        const lines: string[] = [];
        for (let i = 0; i < bytes.length && i < 256; i += 16) {
            const hex = Array.from(bytes.slice(i, i + 16))
                .map(b => b.toString(16).padStart(2, '0'))
                .join(' ');
            const ascii = Array.from(bytes.slice(i, i + 16))
                .map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.')
                .join('');
            lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(48)}  ${ascii}`);
        }
        return lines.join('\n');
    }

    private renderDetailModal(detail: RegistryValueDetail): void {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'registry-detail-modal';
        modal.innerHTML = `
            <div class="registry-detail-overlay"></div>
            <div class="registry-detail-content">
                <div class="registry-detail-header">
                    <h3>注册表值详情</h3>
                    <button class="close-btn" title="关闭">✕</button>
                </div>
                <div class="registry-detail-body">
                    <div class="detail-row">
                        <label>名称:</label>
                        <div class="detail-value">${detail.name || '(默认)'}</div>
                    </div>
                    <div class="detail-row">
                        <label>类型:</label>
                        <div class="detail-value">${detail.value_type}</div>
                    </div>
                    <div class="detail-row">
                        <label>大小:</label>
                        <div class="detail-value">${detail.data_size} 字节</div>
                    </div>
                    <div class="detail-row">
                        <label>文本数据:</label>
                        <textarea class="detail-textarea" readonly>${detail.data_text || '(无法解析为文本)'}</textarea>
                    </div>
                    <div class="detail-row">
                        <label>十六进制:</label>
                        <textarea class="detail-textarea hex-data" readonly>${detail.data_hex}</textarea>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 关闭按钮
        const closeBtn = modal.querySelector('.close-btn');
        const overlay = modal.querySelector('.registry-detail-overlay');
        
        const closeModal = () => {
            modal.remove();
        };
        
        closeBtn?.addEventListener('click', closeModal);
        overlay?.addEventListener('click', closeModal);
        
        // ESC 键关闭
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

}

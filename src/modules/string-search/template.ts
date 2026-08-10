/**
 * 字符串搜索模块 - HTML 模板
 */

import { STRING_SEARCH_STYLES } from './styles';
import { getPresetsByGroup } from './presets';

export function renderStringSearchTemplate(): string {
    // 生成预设下拉选项
    const presetGroups = getPresetsByGroup();
    let presetsHTML = '';
    
    presetGroups.forEach((presets, groupName) => {
        presetsHTML += `<div class="ss-preset-group">
            <div class="ss-preset-group-name">${groupName}</div>`;
        
        presets.forEach(preset => {
            presetsHTML += `
                <label class="ss-preset-item" data-regex="${preset.pattern.replace(/"/g, '&quot;')}" data-label="${preset.label.replace(/"/g, '&quot;')}">
                    <input type="checkbox" class="ss-preset-checkbox">
                    <span class="ss-preset-name">${preset.label}</span>
                    <span class="ss-preset-pattern">${preset.pattern}</span>
                </label>`;
        });
        
        presetsHTML += `</div>`;
    });
    

    return `
    <div class="ss-container" id="string-search-panel-root">
        <!-- 顶部工具栏区域 -->
        <header class="ss-header">
            <div class="ss-header-content">
                <!-- Row 1: 模式切换 + 路径输入 -->
                <div class="ss-row ss-row-1">
                    <!-- 模式切换器 -->
                    <div class="ss-mode-switcher">
                        <button class="ss-mode-tab active" data-mode="image">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h8"/></svg>
                            <span>内存镜像</span>
                        </button>
                        <button class="ss-mode-tab" data-mode="file">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            <span>单文件</span>
                        </button>
                        <button class="ss-mode-tab" data-mode="folder">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                            <span>文件夹</span>
                        </button>
                        <button class="ss-mode-tab" data-mode="process">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2m6-2v2M9 20v2m6-2v2M2 9h2m-2 6h2M20 9h2m-2 6h2"/></svg>
                            <span>进程</span>
                        </button>
                    </div>

                    <!-- 路径输入（单文件/文件夹模式） -->
                    <div class="ss-path-input" id="pathInputGroup" style="display:none">
                        <div class="ss-path-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        </div>
                        <input type="text" id="targetPathPanel" placeholder="选择要搜索的文件...">
                        <button id="browseBtnPanel" class="ss-browse-btn">浏览...</button>
                    </div>

                    <!-- 镜像状态提示（内存镜像模式） -->
                    <div class="ss-image-status" id="imageStatusGroup">
                        <div class="ss-image-info" id="imageInfoDisplay">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h8"/></svg>
                            <span id="imagePathLabel">未加载内存镜像</span>
                        </div>
                        <button id="switchToFileModeBtn" class="ss-switch-btn" style="display:none">选择单文件</button>
                    </div>

                    <!-- 进程选择器（进程模式） -->
                    <div class="ss-process-selector" id="processInputGroup" style="display:none">
                        <div class="ss-dropdown ss-process-dropdown">
                            <button class="ss-preset-btn" id="processSelectTrigger">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2m6-2v2M9 20v2m6-2v2M2 9h2m-2 6h2M20 9h2m-2 6h2"/></svg>
                                <span id="processSelectLabel">选择进程...</span>
                                <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                            </button>
                            <div class="ss-dropdown-menu ss-process-menu" id="processMenu" style="display:none">
                                <div class="ss-presets-search">
                                    <input type="text" id="processSearchInput" class="ss-presets-search-input" placeholder="搜索进程...">
                                </div>
                                <div class="ss-process-list" id="processListContainer">
                                    <div class="ss-process-loading">正在加载进程列表...</div>
                                </div>
                            </div>
                        </div>
                        <button id="refreshProcessBtn" class="ss-refresh-btn" title="刷新进程列表">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                        </button>
                    </div>

                    <!-- 工具按钮 -->
                    <button class="ss-icon-btn" id="openWindowBtn" title="在独立窗口中打开">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>
                </div>

                <!-- Row 2: 搜索输入框 + 内嵌选项 -->
                <div class="ss-row ss-row-2">
                    <div class="ss-search-input-wrapper">
                        <div class="ss-search-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        </div>
                        <div class="ss-selected-presets" id="selectedPresetsContainer"></div>
                        <input type="text" id="searchPatternPanel" class="ss-search-input" placeholder="搜索字符串 / 正则表达式...">
                        
                        <!-- 内嵌选项按钮 -->
                        <div class="ss-search-options">
                            <button id="clearPatternBtn" class="ss-clear-btn" style="display:none" title="清空">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>
                            </button>
                            <div class="ss-divider"></div>
                            
                            <!-- 编码下拉 -->
                            <div class="ss-dropdown" id="encodingDropdown">
                                <button class="ss-dropdown-trigger" id="encodingTrigger">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                    <span class="ss-encoding-label">2 编码</span>
                                    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                                </button>
                                <div class="ss-dropdown-menu" id="encodingMenu" style="display:none">
                                    <div class="ss-dropdown-header">
                                        <span>选择字符编码</span>
                                        <span class="ss-encoding-count">2 选定</span>
                                    </div>
                                    <label class="ss-dropdown-item">
                                        <input type="checkbox" class="encoding-checkbox" value="Ascii" checked>
                                        <span>ASCII / ANSI</span>
                                        <svg class="ss-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    </label>
                                    <label class="ss-dropdown-item">
                                        <input type="checkbox" class="encoding-checkbox" value="Utf8" checked>
                                        <span>UTF-8</span>
                                        <svg class="ss-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    </label>
                                    <label class="ss-dropdown-item">
                                        <input type="checkbox" class="encoding-checkbox" value="Utf16Le">
                                        <span>UTF-16LE (Unicode)</span>
                                        <svg class="ss-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    </label>
                                    <label class="ss-dropdown-item">
                                        <input type="checkbox" class="encoding-checkbox" value="Utf16Be">
                                        <span>UTF-16BE</span>
                                        <svg class="ss-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    </label>
                                    <label class="ss-dropdown-item">
                                        <input type="checkbox" class="encoding-checkbox" value="Gbk">
                                        <span>GBK (中文)</span>
                                        <svg class="ss-check" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    </label>
                                </div>
                            </div>
                            
                            <div class="ss-divider"></div>
                            
                            <button id="caseSensitivePanel" class="ss-toggle-btn" title="区分大小写 (Alt+C)">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                            </button>
                            <button id="useRegexPanel" class="ss-toggle-btn" title="正则表达式 (Alt+R)">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3v10"/><path d="m12.67 5.5 8.66 5"/><path d="m12.67 10.5 8.66-5"/><path d="M9 17a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-2z"/></svg>
                            </button>
                            <div class="ss-divider"></div>
                            <button id="yaraLoadRulesBtn" class="ss-toggle-btn ss-yara-toggle" title="YARA 规则扫描 (点击加载规则)">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            </button>
                        </div>
                    </div>
                    
                    <!-- 搜索按钮 -->
                    <button id="startSearchBtnPanel" class="ss-search-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        <span>搜索</span>
                    </button>
                    <button id="stopSearchBtnPanel" class="ss-stop-btn" style="display: none;">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
                        <span>停止</span>
                    </button>
                    <button id="secondaryScanBtn" class="ss-search-btn ss-secondary-scan-btn" title="二次扫描（基于当前结果筛选）" style="display:none">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
                        <span>二次扫描</span>
                    </button>

                </div>

                <!-- Row 3: 高级选项工具栏 -->
                <div class="ss-row ss-row-3">
                    <!-- 预设下拉 -->
                    <div class="ss-dropdown" id="presetsDropdown">
                        <button class="ss-preset-btn" id="presetsTrigger">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                            <span>正则表达式预设</span>
                            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="ss-dropdown-menu ss-presets-menu" id="presetsMenu" style="display:none">
                            <div class="ss-presets-search">
                                <input type="text" id="presetsSearchInput" class="ss-presets-search-input" placeholder="搜索预设...">
                            </div>
                            <div class="ss-presets-list" id="presetsListContainer">
                                ${presetsHTML}
                            </div>
                        </div>
                    </div>

                    <!-- 熵值筛选下拉框 -->
                    <div class="ss-entropy-dropdown">
                        <label class="ss-entropy-label">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                            </svg>
                            <span>熵值:</span>
                        </label>
                        <select id="entropyFilterSelect" class="ss-entropy-select">
                            <option value="none">不筛选</option>
                            <option value="zero">零熵/极低 (0 - 1.0)</option>
                            <option value="low">低熵 (1.0 - 3.0)</option>
                            <option value="hex">中熵-Hex区 (3.5 - 4.0)</option>
                            <option value="code">中高熵-代码区 (4.5 - 5.5)</option>
                            <option value="base64">高熵-Base64区 (5.8 - 6.0)</option>
                            <option value="very-high">极高熵 (6.0 - 7.5)</option>
                            <option value="crypto">加密/压缩 (&gt; 7.5)</option>
                        </select>
                        <div class="ss-entropy-help">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            <div class="ss-entropy-tooltip">
                                <div class="ss-tooltip-title">熵值范围说明 (Bits/Byte)</div>
                                <div class="ss-tooltip-item">
                                    <strong>零熵/极低 (0 - 1.0)</strong>
                                    <span>空白填充 (0x00)、全重复字符 (AAAA) - 无意义填充区，缓冲区初始状态</span>
                                </div>
                                <div class="ss-tooltip-item">
                                    <strong>低熵 (1.0 - 3.0)</strong>
                                    <span>简单日志、格式化文本、HTML 标签密集区 - 字符集小，重复率高</span>
                                </div>
                                <div class="ss-tooltip-item">
                                    <strong>中熵-Hex区 (3.5 - 4.0)</strong>
                                    <span>Hex 字符串 (MD5/SHA256/Keys)、英文自然语言 - Hex 字符串聚集在 4.0 附近</span>
                                </div>
                                <div class="ss-tooltip-item">
                                    <strong>中高熵-代码区 (4.5 - 5.5)</strong>
                                    <span>机器码、汇编指令 - x86/x64 指令集分布不如随机数均匀</span>
                                </div>
                                <div class="ss-tooltip-item">
                                    <strong>高熵-Base64区 (5.8 - 6.0)</strong>
                                    <span>Base64 编码数据、混淆后的脚本 - Base64 聚集在 6.0 附近</span>
                                </div>
                                <div class="ss-tooltip-item">
                                    <strong>极高熵 (6.0 - 7.5)</strong>
                                    <span>图片、音频片段、非标准编码 - 或者是较差的加密算法</span>
                                </div>
                                <div class="ss-tooltip-item">
                                    <strong>加密/压缩 (&gt; 7.5)</strong>
                                    <span>AES 密钥、压缩包 (ZIP/GZ)、加密 Payload - 寻找恶意软件和密钥的黄金区间</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 限制输入 -->
                    <div class="ss-limits">
                        <span class="ss-limits-label">最小长度:</span>
                        <input type="number" id="minLengthPanel" class="ss-limit-input" value="4" min="1" title="最小字符长度">
                    </div>
                    <div class="ss-limits">
                        <span class="ss-limits-label">最大结果:</span>
                        <input type="number" id="maxResultsPanel" class="ss-limit-input" value="10000" step="1000" title="最大结果数">
                    </div>

                    <!-- 邻近搜索 -->
                    <div class="ss-proximity-search">
                        <button id="proximityToggle" class="ss-toggle-btn ss-proximity-btn" title="邻近搜索 (关键词关联)">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="8" cy="12" r="3"/>
                                <circle cx="16" cy="12" r="3"/>
                                <path d="M11 12h2"/>
                            </svg>
                        </button>
                        <div class="ss-proximity-config" id="proximityConfig" style="display: none;">
                            <input type="text" id="proximityKeyword1" class="ss-proximity-input" placeholder="关键词1">
                            <span class="ss-proximity-and">AND</span>
                            <input type="text" id="proximityKeyword2" class="ss-proximity-input" placeholder="关键词2">
                            <span class="ss-proximity-distance">距离 ≤</span>
                            <input type="number" id="proximityDistance" class="ss-proximity-distance-input" value="64" min="1" max="1024">
                            <span class="ss-proximity-unit">字节</span>
                            <button id="proximitySearchBtn" class="ss-proximity-search-btn" title="执行邻近搜索">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                            </button>
                        </div>
                    </div>

                    <div class="ss-spacer"></div>

                    <!-- 统计信息 -->
                    <div class="ss-stats" id="resultsStatsPanel" style="display: none;">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                        <span id="resultCountPanel">0 命中</span>
                        <span class="ss-stats-sep">·</span>
                        <span id="searchDurationPanel"></span>
                    </div>

                </div>
            </div>

            <!-- 进度条 -->
            <div class="ss-progress" id="progressSectionPanel" style="display: none;">
                <div class="ss-progress-bar" id="progressBarPanel"></div>
                <span class="ss-progress-text" id="progressStatusPanel">正在搜索...</span>
            </div>
        </header>

        <!-- 主内容区：左右分栏 -->
        <div class="ss-main">
            <!-- 左侧结果列表 -->
            <div class="ss-list-pane">
                <!-- 工具栏：聚类/可视化/导出/标记过滤 -->
                <div class="ss-list-toolbar" id="listToolbar" style="display:none">
                    <div class="ss-toolbar-left">
                        <button class="ss-toolbar-icon-btn" id="clusterToggleBtn" title="聚类视图">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        </button>
                        <button class="ss-toolbar-icon-btn" id="vizToggleBtn" title="可视化图表">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
                        </button>
                        <div class="ss-toolbar-sep"></div>
                        <button class="ss-toolbar-icon-btn" id="exportBtnPanel" title="导出结果">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        <button class="ss-toolbar-icon-btn" id="copyAllBtnPanel" title="复制全部结果">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button class="ss-toolbar-icon-btn" id="extractIocBtnPanel" title="从当前结果提取 IOC">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        </button>
                        <button class="ss-toolbar-icon-btn" id="clearBtnPanel" title="清空结果">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                        <div class="ss-toolbar-sep"></div>
                        <button class="ss-toolbar-icon-btn" id="saveSessionBtn" title="保存搜索会话">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        </button>
                        <button class="ss-toolbar-icon-btn" id="loadSessionBtn" title="加载搜索会话">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        </button>
                    </div>
                    <div class="ss-toolbar-right">
                        <!-- 标记过滤芯片 -->
                        <div class="ss-tag-filter-chips" id="tagFilterChips"></div>
                        <select id="tagFilterSelect" class="ss-tag-filter-select" title="按标签筛选">
                            <option value="">全部标签</option>
                            <option value="__tagged">已标记</option>
                            <option value="__untagged">未标记</option>
                            <option value="__bookmarked">已收藏</option>
                        </select>
                    </div>
                </div>

                <!-- 可视化区域 -->
                <div class="ss-visualization-panel" id="vizPanel" style="display:none">
                    <div class="ss-viz-header">
                        <span>结果分布可视化</span>
                        <button class="ss-viz-close" id="vizCloseBtn" title="关闭">&times;</button>
                    </div>
                    <div class="ss-viz-content">
                        <div class="ss-viz-section">
                            <div class="ss-viz-label">偏移量分布</div>
                            <canvas id="vizOffsetCanvas" width="400" height="80"></canvas>
                        </div>
                        <div class="ss-viz-section">
                            <div class="ss-viz-label">熵值热力图</div>
                            <canvas id="vizEntropyCanvas" width="400" height="40"></canvas>
                        </div>
                        <div class="ss-viz-row">
                            <div class="ss-viz-section ss-viz-half">
                                <div class="ss-viz-label">编码分布</div>
                                <canvas id="vizEncodingCanvas" width="180" height="100"></canvas>
                            </div>
                            <div class="ss-viz-section ss-viz-half">
                                <div class="ss-viz-label">长度分布</div>
                                <canvas id="vizLengthCanvas" width="180" height="100"></canvas>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 聚类视图 -->
                <div class="ss-cluster-view" id="clusterPanel" style="display:none">
                    <div id="clusterContent"></div>
                </div>

                <!-- 可排序列头 -->
                <div class="ss-list-header ss-sortable-header" id="sortableHeader">
                    <div class="ss-col-offset ss-sortable" data-sort="offset" title="点击排序">
                        偏移量 <span class="ss-sort-icon"></span>
                    </div>
                    <div class="ss-col-content ss-sortable" data-sort="content" title="点击排序">
                        匹配值 <span class="ss-sort-icon"></span>
                    </div>
                    <div class="ss-col-meta">
                        <span class="ss-sortable" data-sort="encoding" title="点击排序">编码<span class="ss-sort-icon"></span></span>
                        <span class="ss-sortable" data-sort="byte_length" title="点击排序">大小<span class="ss-sort-icon"></span></span>
                        <span class="ss-sortable" data-sort="entropy" title="点击排序">熵值<span class="ss-sort-icon"></span></span>
                    </div>
                </div>

                <!-- 列过滤输入行 -->
                <div class="ss-filter-row" id="filterRow" style="display:none">
                    <input type="text" class="ss-filter-input ss-col-offset" id="filterOffset" placeholder="偏移量...">
                    <input type="text" class="ss-filter-input ss-col-content" id="filterContent" placeholder="内容过滤...">
                    <input type="text" class="ss-filter-input ss-col-meta" id="filterEncoding" placeholder="编码...">
                </div>

                <div class="ss-list-content">
                    <!-- 空状态 -->
                    <div id="emptyStatePanel" class="ss-empty">
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        <p>内存中未发现匹配</p>
                    </div>

                    <!-- 结果列表 -->
                    <ul id="resultsListPanel" class="ss-results-list" style="display:none"></ul>
                </div>
                
                <!-- 分页控件 -->
                <div class="ss-list-footer" id="paginationPanel" style="display: none;">
                    <button id="prevPageBtnPanel" class="ss-page-btn">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <span id="pageInfoPanel" class="ss-page-info">1 / 1</span>
                    <button id="nextPageBtnPanel" class="ss-page-btn">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
            </div>

            <!-- 右侧详情面板 -->
            <div class="ss-detail-pane">
                <div id="detailEmptyPanel" class="ss-detail-empty">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <p>选择条目查看详情</p>
                </div>
                
                <div id="detailContentPanel" class="ss-detail-content" style="display:none">
                    <div class="ss-detail-header">
                        <div class="ss-detail-info">
                            <span class="ss-detail-offset" id="detailOffset">0x00000000</span>
                            <span class="ss-detail-encoding" id="detailEncoding">ASCII</span>
                            <span class="ss-detail-length" id="detailLength">0 bytes</span>
                        </div>
                        <div class="ss-detail-actions">
                            <button class="ss-action-btn" id="copyStringBtn" title="复制字符串">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            </button>
                            <button class="ss-action-btn" id="toggleValueBtn" title="收缩/展开字符串内容">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="ss-collapse-icon"><polyline points="18 15 12 9 6 15"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="ss-detail-value" id="detailValue"></div>
                    <div class="ss-detail-context">
                        <!-- 上下文工具栏 -->
                        <div class="ss-context-toolbar">
                            <div class="ss-context-view-toggle">
                                <button id="hexViewBtn" class="ss-view-toggle-btn active" title="十六进制视图">HEX</button>
                                <button id="stringViewBtn" class="ss-view-toggle-btn" title="字符串视图">STRING</button>
                                <select id="contextEncodingSelect" class="ss-context-encoding" title="字符串编码">
                                    <option value="ascii">ASCII</option>
                                    <option value="utf-8">UTF-8</option>
                                    <option value="utf-16le">UTF-16LE</option>
                                    <option value="utf-16be">UTF-16BE</option>
                                    <option value="gbk">GBK</option>
                                </select>
                            </div>
                            <div class="ss-context-actions">
                                <button id="loadContextBeforeBtn" class="ss-load-context-btn" title="加载前1KB上下文">
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                                    <span>前 1KB</span>
                                </button>
                                <button id="loadContextAfterBtn" class="ss-load-context-btn" title="加载后1KB上下文">
                                    <span>后 1KB</span>
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                                </button>
                            </div>
                        </div>
                        <div class="ss-context-body" id="detailContext">
                            <div class="ss-context-loading" id="contextLoading" style="display:none">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                <span>加载中...</span>
                            </div>
                            <div id="hexContextContent"></div>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        <style>${STRING_SEARCH_STYLES}</style>
    </div>
    `;
}

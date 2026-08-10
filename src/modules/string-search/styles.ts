/**
 * 字符串搜索模块 - CSS 样式
 */

export const STRING_SEARCH_STYLES = `
/* ========== Container ========== */
.ss-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: #f8fafc;
    color: #1e293b;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    overflow: hidden;
}
[data-theme="dark"] .ss-container {
    background: #0f172a;
    color: #e2e8f0;
}

/* ========== Header ========== */
.ss-header {
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
    z-index: 20;
}
[data-theme="dark"] .ss-header {
    background: #1e293b;
    border-color: #334155;
}

.ss-header-content {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.ss-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

/* Mode Switcher */
.ss-mode-switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    flex-shrink: 0;
}
[data-theme="dark"] .ss-mode-switcher {
    background: rgba(51, 65, 85, 0.5);
}

.ss-mode-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #64748b;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    white-space: nowrap;
    position: relative;
}
.ss-mode-tab:hover {
    color: #475569;
    background: rgba(255,255,255,0.3);
    transform: translateY(-1px);
}
.ss-mode-tab.active {
    background: white;
    color: #4f46e5;
    box-shadow: 0 2px 8px rgba(79, 70, 229, 0.15);
    transform: translateY(-1px);
}
[data-theme="dark"] .ss-mode-tab:hover {
    color: #cbd5e1;
    background: rgba(255,255,255,0.05);
}
[data-theme="dark"] .ss-mode-tab.active {
    background: #334155;
    color: #818cf8;
}

/* Path Input */
.ss-path-input {
    flex: 1;
    display: flex;
    align-items: center;
    background: white;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    overflow: hidden;
    transition: all 0.2s;
}
.ss-path-input:hover {
    border-color: #a5b4fc;
}
.ss-path-input:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}
[data-theme="dark"] .ss-path-input {
    background: #1e293b;
    border-color: #475569;
}
.ss-path-icon {
    padding: 0 12px;
    color: #94a3b8;
    display: flex;
    align-items: center;
    background: #f8fafc;
    height: 36px;
    border-right: 1px solid #e2e8f0;
}
[data-theme="dark"] .ss-path-icon {
    background: #0f172a;
    border-color: #334155;
}
.ss-path-input input {
    flex: 1;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: #334155;
    font-size: 13px;
    outline: none;
}
[data-theme="dark"] .ss-path-input input {
    color: #e2e8f0;
}
.ss-path-input input::placeholder {
    color: #94a3b8;
}
.ss-browse-btn {
    padding: 8px 16px;
    background: #f8fafc;
    border: none;
    border-left: 1px solid #e2e8f0;
    color: #475569;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
}
.ss-browse-btn:hover {
    background: #e2e8f0;
}
[data-theme="dark"] .ss-browse-btn {
    background: #334155;
    border-color: #475569;
    color: #cbd5e1;
}

.ss-icon-btn {
    padding: 8px;
    background: transparent;
    border: none;
    color: #64748b;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
}
.ss-icon-btn:hover {
    background: #e2e8f0;
    color: #334155;
}
[data-theme="dark"] .ss-icon-btn:hover {
    background: #334155;
    color: #e2e8f0;
}

/* Search Input Wrapper */
.ss-search-input-wrapper {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    background: white;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    transition: all 0.2s;
}
.ss-search-input-wrapper:focus-within {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}
[data-theme="dark"] .ss-search-input-wrapper {
    background: #1e293b;
    border-color: #475569;
}
.ss-search-icon {
    padding-left: 12px;
    color: #94a3b8;
    display: flex;
}
.ss-search-input {
    flex: 1;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: #1e293b;
    font-size: 13px;
    font-family: 'Consolas', 'Monaco', monospace;
    outline: none;
}
[data-theme="dark"] .ss-search-input {
    color: #e2e8f0;
}
.ss-search-input::placeholder {
    color: #94a3b8;
    font-family: 'Segoe UI', system-ui, sans-serif;
}

/* Search Options */
.ss-search-options {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 8px;
}
.ss-divider {
    width: 1px;
    height: 16px;
    background: #e2e8f0;
    margin: 0 4px;
}
[data-theme="dark"] .ss-divider {
    background: #475569;
}
.ss-clear-btn {
    padding: 4px;
    background: transparent;
    border: none;
    color: #cbd5e1;
    cursor: pointer;
    display: flex;
    align-items: center;
}
.ss-clear-btn:hover {
    color: #94a3b8;
}

/* Toggle Button */
.ss-toggle-btn {
    padding: 4px;
    background: transparent;
    border: none;
    color: #94a3b8;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
}
.ss-toggle-btn:hover {
    background: #f1f5f9;
    color: #64748b;
}
.ss-toggle-btn.active {
    background: #e0e7ff;
    color: #4338ca;
}
[data-theme="dark"] .ss-toggle-btn:hover {
    background: #334155;
    color: #cbd5e1;
}
[data-theme="dark"] .ss-toggle-btn.active {
    background: #3730a3;
    color: #c7d2fe;
}

/* Dropdown */
.ss-dropdown {
    position: relative;
}
.ss-dropdown-trigger {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 12px;
    font-weight: 500;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}
.ss-dropdown-trigger:hover {
    background: #f1f5f9;
}
.ss-dropdown-trigger.active {
    background: #e0e7ff;
    color: #4338ca;
}
[data-theme="dark"] .ss-dropdown-trigger:hover {
    background: #334155;
}
.ss-encoding-label {
    max-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ss-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 200px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    z-index: 50;
    overflow: hidden;
    animation: ssDropdownIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: top right;
}
@keyframes ssDropdownIn {
    from { opacity: 0; transform: scale(0.95) translateY(-4px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
}
[data-theme="dark"] .ss-dropdown-menu {
    background: #1e293b;
    border-color: #475569;
}
.ss-dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
}
[data-theme="dark"] .ss-dropdown-header {
    background: #0f172a;
    border-color: #334155;
}
.ss-encoding-count {
    background: #e0e7ff;
    color: #4338ca;
    padding: 2px 6px;
    border-radius: 10px;
    font-size: 10px;
}
.ss-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 13px;
    color: #475569;
    cursor: pointer;
    transition: background 0.15s;
}
.ss-dropdown-item:hover {
    background: #f8fafc;
}
[data-theme="dark"] .ss-dropdown-item {
    color: #cbd5e1;
}
[data-theme="dark"] .ss-dropdown-item:hover {
    background: #334155;
}
.ss-dropdown-item input {
    display: none;
}
.ss-dropdown-item .ss-check {
    margin-left: auto;
    opacity: 0;
    color: #4f46e5;
}
.ss-dropdown-item:has(input:checked) .ss-check {
    opacity: 1;
}

/* Search & Stop Buttons */
.ss-search-btn, .ss-stop-btn, .ss-secondary-scan-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
}
.ss-search-btn {
    height: 36px;
    padding: 0 20px;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    color: white;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
}
.ss-search-btn:hover {
    background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
    transform: translateY(-1px);
}
.ss-search-btn:active {
    transform: translateY(0);
}
.ss-search-btn.ss-btn-loading {
    pointer-events: none;
    animation: ssBtnPulse 1.5s ease-in-out infinite;
}
@keyframes ssBtnPulse {
    0%, 100% { box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2); }
    50% { box-shadow: 0 4px 16px rgba(99, 102, 241, 0.5); }
}
.ss-secondary-scan-btn {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);
}
.ss-secondary-scan-btn:hover {
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);
}
.ss-stop-btn {
    background: #ef4444;
    color: white;
    animation: ssStopPulse 1.2s ease-in-out infinite;
}
.ss-stop-btn:hover {
    background: #dc2626;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    animation: none;
}
@keyframes ssStopPulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
}
/* ... */

/* Row 3: Advanced Toolbar */
.ss-row-3 {
    font-size: 12px;
    padding-bottom: 4px;
}
.ss-preset-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    color: #475569;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.ss-preset-btn:hover {
    border-color: #a5b4fc;
    color: #4f46e5;
}
[data-theme="dark"] .ss-preset-btn {
    background: #334155;
    border-color: #475569;
    color: #cbd5e1;
}

/* 选中的预设标签 */
.ss-selected-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding-left: 4px;
}
.ss-selected-presets:empty {
    display: none;
}
.ss-preset-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 2px 8px;
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
    color: white;
    font-size: 11px;
    border-radius: 12px;
    white-space: nowrap;
    max-width: 150px;
}
.ss-preset-tag-label {
    overflow: hidden;
    text-overflow: ellipsis;
}
.ss-preset-tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: rgba(255,255,255,0.2);
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    padding: 0;
    transition: background 0.15s;
}
.ss-preset-tag-remove:hover {
    background: rgba(255,255,255,0.4);
}
.ss-preset-tag-remove svg {
    width: 8px;
    height: 8px;
}
[data-theme="sakura"] .ss-preset-tag {
    background: linear-gradient(135deg, #f472b6 0%, #ec4899 100%);
}

/* 高熵值过滤 */
.ss-entropy-filter {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    color: #475569;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    user-select: none;
}
.ss-entropy-filter:hover {
    border-color: #fbbf24;
    color: #f59e0b;
}
.ss-entropy-filter:has(.ss-entropy-checkbox:checked) {
    background: #fef3c7;
    border-color: #fbbf24;
    color: #92400e;
}
[data-theme="dark"] .ss-entropy-filter {
    background: #334155;
    border-color: #475569;
    color: #cbd5e1;
}
[data-theme="dark"] .ss-entropy-filter:has(.ss-entropy-checkbox:checked) {
    background: #451a03;
    border-color: #f59e0b;
    color: #fcd34d;
}
[data-theme="sakura"] .ss-entropy-filter {
    background: #ffffff;
    border-color: #fbcfe8;
    color: #9d174d;
}
[data-theme="sakura"] .ss-entropy-filter:has(.ss-entropy-checkbox:checked) {
    background: #fef3c7;
    border-color: #fbbf24;
    color: #92400e;
}
.ss-entropy-checkbox {
    width: 14px;
    height: 14px;
    accent-color: #f59e0b;
    cursor: pointer;
}
.ss-entropy-icon {
    color: #f59e0b;
}

/* 预设多选 checkbox */
.ss-preset-checkbox {
    width: 14px;
    height: 14px;
    accent-color: #6366f1;
    cursor: pointer;
    flex-shrink: 0;
    margin: 0;
}
.ss-preset-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background 0.15s;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
}
.ss-preset-item:hover {
    background: #f1f5f9;
}
[data-theme="dark"] .ss-preset-item:hover {
    background: #334155;
}
[data-theme="sakura"] .ss-preset-item:hover {
    background: #fdf2f8;
}
.ss-preset-item:has(.ss-preset-checkbox:checked) {
    background: #e0e7ff;
}
[data-theme="dark"] .ss-preset-item:has(.ss-preset-checkbox:checked) {
    background: #312e81;
}
[data-theme="sakura"] .ss-preset-item:has(.ss-preset-checkbox:checked) {
    background: #fce7f3;
}
.ss-preset-name {
    flex: 1;
    font-size: 12px;
    color: #334155;
}
[data-theme="dark"] .ss-preset-name {
    color: #e2e8f0;
}
.ss-preset-pattern {
    font-size: 10px;
    color: #94a3b8;
    font-family: 'Consolas', monospace;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ss-preset-item:has(.ss-preset-checkbox:checked) .ss-preset-pattern {
    display: none;
}

/* 熵值标签 */
.ss-entropy-tag {
    background: #fef3c7;
    color: #92400e;
    border-color: #fbbf24;
}
[data-theme="dark"] .ss-entropy-tag {
    background: #451a03;
    color: #fcd34d;
    border-color: #f59e0b;
}
[data-theme="sakura"] .ss-entropy-tag {
    background: #fef3c7;
    color: #92400e;
    border-color: #fbbf24;
}

.ss-presets-menu {
    left: 0;
    right: auto;
    min-width: 280px;
    max-height: 450px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.ss-presets-search {
    padding: 8px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
    position: sticky;
    top: 0;
    z-index: 2;
}
[data-theme="dark"] .ss-presets-search {
    background: #1e293b;
    border-color: #334155;
}
.ss-presets-search-input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 12px;
    outline: none;
    transition: border-color 0.2s;
}
.ss-presets-search-input:focus {
    border-color: #6366f1;
}
[data-theme="dark"] .ss-presets-search-input {
    background: #0f172a;
    border-color: #475569;
    color: #e2e8f0;
}
.ss-presets-list {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    max-height: 400px;
}

/* 熵值筛选下拉框 */
.ss-entropy-dropdown {
    display: flex;
    align-items: center;
    gap: 6px;
}
.ss-entropy-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #64748b;
    white-space: nowrap;
}
.ss-entropy-label svg {
    color: #f59e0b;
}
[data-theme="dark"] .ss-entropy-label {
    color: #94a3b8;
}
.ss-entropy-select {
    padding: 4px 8px;
    font-size: 11px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #ffffff;
    color: #334155;
    cursor: pointer;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
}
.ss-entropy-select:hover {
    border-color: #cbd5e1;
}
.ss-entropy-select:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}
[data-theme="dark"] .ss-entropy-select {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
}
[data-theme="dark"] .ss-entropy-select:hover {
    border-color: #64748b;
}
[data-theme="dark"] .ss-entropy-select:focus {
    border-color: #818cf8;
    box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.15);
}

/* 邻近搜索 */
.ss-proximity-search {
    display: flex;
    align-items: center;
    gap: 8px;
}
.ss-proximity-btn {
    position: relative;
}
.ss-proximity-btn.active {
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #ffffff;
    border-color: transparent;
}
.ss-proximity-config {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    animation: slideIn 0.2s ease;
}
@keyframes slideIn {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
}
[data-theme="dark"] .ss-proximity-config {
    background: #1e293b;
    border-color: #334155;
}
.ss-proximity-input {
    width: 100px;
    padding: 4px 8px;
    font-size: 11px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #ffffff;
    color: #334155;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
}
.ss-proximity-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}
[data-theme="dark"] .ss-proximity-input {
    background: #0f172a;
    border-color: #475569;
    color: #e2e8f0;
}
[data-theme="dark"] .ss-proximity-input:focus {
    border-color: #818cf8;
}
.ss-proximity-and {
    font-size: 10px;
    font-weight: 600;
    color: #6366f1;
    padding: 2px 6px;
    background: rgba(99, 102, 241, 0.1);
    border-radius: 3px;
}
[data-theme="dark"] .ss-proximity-and {
    color: #818cf8;
    background: rgba(129, 140, 248, 0.15);
}
.ss-proximity-distance {
    font-size: 11px;
    color: #64748b;
    white-space: nowrap;
}
[data-theme="dark"] .ss-proximity-distance {
    color: #94a3b8;
}
.ss-proximity-distance-input {
    width: 60px;
    padding: 4px 6px;
    font-size: 11px;
    text-align: center;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #ffffff;
    color: #334155;
    outline: none;
}
.ss-proximity-distance-input:focus {
    border-color: #6366f1;
}
[data-theme="dark"] .ss-proximity-distance-input {
    background: #0f172a;
    border-color: #475569;
    color: #e2e8f0;
}
.ss-proximity-unit {
    font-size: 10px;
    color: #94a3b8;
}
.ss-proximity-search-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 4px;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    color: #ffffff;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
}
.ss-proximity-search-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}
.ss-proximity-search-btn:active {
    transform: scale(0.95);
}

/* 熵值帮助提示 */
.ss-entropy-help {
    position: relative;
    display: flex;
    align-items: center;
    cursor: help;
}
.ss-entropy-help svg {
    color: #94a3b8;
    transition: color 0.2s;
}
.ss-entropy-help:hover svg {
    color: #6366f1;
}
[data-theme="dark"] .ss-entropy-help svg {
    color: #64748b;
}
[data-theme="dark"] .ss-entropy-help:hover svg {
    color: #818cf8;
}
.ss-entropy-tooltip {
    position: absolute;
    left: 50%;
    top: calc(100% + 8px);
    transform: translateX(-50%);
    width: 320px;
    padding: 12px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s, visibility 0.2s;
    z-index: 1000;
    pointer-events: none;
}
.ss-entropy-help:hover .ss-entropy-tooltip {
    opacity: 1;
    visibility: visible;
}
[data-theme="dark"] .ss-entropy-tooltip {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}
.ss-tooltip-title {
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
}
[data-theme="dark"] .ss-tooltip-title {
    color: #e2e8f0;
    border-color: #334155;
}
.ss-tooltip-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
    font-size: 11px;
}
.ss-tooltip-item:not(:last-child) {
    border-bottom: 1px solid #f1f5f9;
}
[data-theme="dark"] .ss-tooltip-item:not(:last-child) {
    border-color: #334155;
}
.ss-tooltip-item strong {
    color: #6366f1;
    font-weight: 600;
}
[data-theme="dark"] .ss-tooltip-item strong {
    color: #818cf8;
}
.ss-tooltip-item span {
    color: #64748b;
    line-height: 1.4;
}
[data-theme="dark"] .ss-tooltip-item span {
    color: #94a3b8;
}
/* 提示框箭头 */
.ss-entropy-tooltip::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -6px;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid #ffffff;
}
[data-theme="dark"] .ss-entropy-tooltip::after {
    border-bottom-color: #1e293b;
}

/* 熵值标签颜色分级 */
.ss-entropy-tag[data-entropy-level="zero"] {
    background: linear-gradient(135deg, #cbd5e1 0%, #e2e8f0 100%);
    color: #475569;
}
.ss-entropy-tag[data-entropy-level="low"] {
    background: linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%);
    color: #ffffff;
}
.ss-entropy-tag[data-entropy-level="hex"] {
    background: linear-gradient(135deg, #34d399 0%, #6ee7b7 100%);
    color: #ffffff;
}
.ss-entropy-tag[data-entropy-level="code"] {
    background: linear-gradient(135deg, #fbbf24 0%, #fcd34d 100%);
    color: #1e293b;
}
.ss-entropy-tag[data-entropy-level="base64"] {
    background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
    color: #ffffff;
}
.ss-entropy-tag[data-entropy-level="very-high"] {
    background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
    color: #ffffff;
}
.ss-entropy-tag[data-entropy-level="crypto"] {
    background: linear-gradient(135deg, #a855f7 0%, #c084fc 100%);
    color: #ffffff;
}

/* 深色主题熵值标签 */
[data-theme="dark"] .ss-entropy-tag[data-entropy-level="zero"] {
    background: linear-gradient(135deg, #64748b 0%, #94a3b8 100%);
    color: #f1f5f9;
}
[data-theme="dark"] .ss-entropy-tag[data-entropy-level="low"] {
    background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);
}
[data-theme="dark"] .ss-entropy-tag[data-entropy-level="hex"] {
    background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
}
[data-theme="dark"] .ss-entropy-tag[data-entropy-level="code"] {
    background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
}
[data-theme="dark"] .ss-entropy-tag[data-entropy-level="base64"] {
    background: linear-gradient(135deg, #ea580c 0%, #f97316 100%);
}
[data-theme="dark"] .ss-entropy-tag[data-entropy-level="very-high"] {
    background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%);
}
[data-theme="dark"] .ss-entropy-tag[data-entropy-level="crypto"] {
    background: linear-gradient(135deg, #9333ea 0%, #a855f7 100%);
}

/* 镜像状态提示 */
.ss-image-status {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    height: 36px;
}
[data-theme="dark"] .ss-image-status {
    background: #1e293b;
    border-color: #334155;
}
.ss-image-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
}
.ss-image-info svg {
    flex-shrink: 0;
    color: #6366f1;
}
.ss-image-info.no-image svg {
    color: #f59e0b;
}
#imagePathLabel {
    font-size: 12px;
    color: #64748b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
[data-theme="dark"] #imagePathLabel {
    color: #94a3b8;
}
.ss-switch-btn {
    padding: 4px 10px;
    font-size: 11px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #ffffff;
    color: #6366f1;
    cursor: pointer;
    white-space: nowrap;
}
.ss-switch-btn:hover {
    background: #e0e7ff;
}
[data-theme="dark"] .ss-switch-btn {
    background: #334155;
    border-color: #475569;
    color: #818cf8;
}

/* 进程选择器 */
.ss-process-selector {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
}
.ss-process-dropdown {
    flex: 1;
}
.ss-process-dropdown .ss-preset-btn {
    width: 100%;
    justify-content: flex-start;
}
.ss-process-dropdown .ss-preset-btn span {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ss-process-menu {
    left: 0;
    right: 0;
    min-width: 280px;
    max-height: 400px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.ss-process-list {
    flex: 1;
    overflow-y: auto;
    max-height: 350px;
}
.ss-process-loading {
    padding: 16px;
    text-align: center;
    color: #64748b;
    font-size: 12px;
}
.ss-process-item {
    display: flex;
    flex-direction: column;
    padding: 8px 12px;
    cursor: pointer;
    border-bottom: 1px solid #f1f5f9;
    transition: background 0.15s;
}
.ss-process-item:hover {
    background: #f1f5f9;
}
.ss-process-item:last-child {
    border-bottom: none;
}
[data-theme="dark"] .ss-process-item {
    border-color: #334155;
}
[data-theme="dark"] .ss-process-item:hover {
    background: #334155;
}
.ss-process-name {
    font-size: 12px;
    font-weight: 500;
    color: #334155;
}
[data-theme="dark"] .ss-process-name {
    color: #e2e8f0;
}
.ss-process-path {
    font-size: 10px;
    color: #94a3b8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.ss-process-empty {
    padding: 16px;
    text-align: center;
    color: #f59e0b;
    font-size: 12px;
}
.ss-refresh-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #ffffff;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;
}
.ss-refresh-btn:hover {
    background: #f1f5f9;
    color: #6366f1;
}
[data-theme="dark"] .ss-refresh-btn {
    background: #1e293b;
    border-color: #334155;
    color: #94a3b8;
}
[data-theme="dark"] .ss-refresh-btn:hover {
    background: #334155;
    color: #818cf8;
}
.ss-preset-group {
    border-bottom: 1px solid #f1f5f9;
}
[data-theme="dark"] .ss-preset-group {
    border-color: #334155;
}
.ss-preset-group:last-child {
    border-bottom: none;
}
.ss-preset-group-name {
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: #6366f1;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: #f8fafc;
    position: sticky;
    top: 0;
    z-index: 1;
}
[data-theme="dark"] .ss-preset-group-name {
    color: #818cf8;
    background: #1e293b;
}
.ss-preset-item {
    display: block;
    width: 100%;
    padding: 8px 12px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
}
.ss-preset-item:hover {
    background: #e0e7ff;
}
[data-theme="dark"] .ss-preset-item:hover {
    background: #3730a3;
}
.ss-preset-name {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #334155;
}
[data-theme="dark"] .ss-preset-name {
    color: #e2e8f0;
}
.ss-preset-pattern {
    display: block;
    font-size: 10px;
    font-family: 'Consolas', monospace;
    color: #94a3b8;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Limits */
.ss-limits {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    flex-shrink: 0;
}
[data-theme="dark"] .ss-limits {
    background: #334155;
    border-color: #475569;
}
.ss-limits-label {
    color: #94a3b8;
    font-size: 12px;
}
.ss-limit-input {
    width: 60px;
    padding: 2px 4px;
    border: none;
    border-bottom: 1px solid #e2e8f0;
    background: transparent;
    color: #334155;
    font-size: 11px;
    text-align: center;
    outline: none;
}
.ss-limit-input:focus {
    border-color: #6366f1;
}
[data-theme="dark"] .ss-limit-input {
    color: #e2e8f0;
    border-color: #475569;
}
.ss-limits-sep {
    color: #cbd5e1;
}

.ss-spacer {
    flex: 1;
}

/* Stats */
.ss-stats {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #64748b;
    font-size: 12px;
}
.ss-stats-sep {
    color: #cbd5e1;
}

/* Action Buttons */
.ss-actions {
    display: flex;
    gap: 4px;
}
.ss-action-btn {
    padding: 6px;
    background: transparent;
    border: none;
    color: #94a3b8;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
}
.ss-action-btn:hover {
    background: #e0e7ff;
    color: #4f46e5;
}
.ss-action-danger:hover {
    background: #fee2e2;
    color: #dc2626;
}
[data-theme="dark"] .ss-action-btn:hover {
    background: #334155;
    color: #818cf8;
}

/* Progress */
.ss-progress {
    position: relative;
    height: 3px;
    background: #e2e8f0;
    overflow: hidden;
}
[data-theme="dark"] .ss-progress {
    background: #334155;
}
.ss-progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #a78bfa, #8b5cf6, #6366f1);
    background-size: 300% 100%;
    width: 0;
    transition: width 0.3s ease;
    animation: ssProgressShimmer 2s linear infinite;
    position: relative;
}
.ss-progress-bar::after {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 80px;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
    animation: ssProgressGlow 1.5s ease-in-out infinite;
}
@keyframes ssProgressShimmer {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
}
@keyframes ssProgressGlow {
    0%, 100% { opacity: 0; transform: translateX(-80px); }
    50% { opacity: 1; transform: translateX(0); }
}
.ss-progress-text {
    position: absolute;
    right: 12px;
    top: 6px;
    font-size: 11px;
    color: #64748b;
    animation: ssFadeIn 0.3s ease;
}

/* ========== Main Content ========== */
.ss-main {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
}

/* Left List Pane */
.ss-list-pane {
    width: 340px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: #f8fafc;
    border-right: 1px solid #e2e8f0;
}
[data-theme="dark"] .ss-list-pane {
    background: #1e293b;
    border-color: #334155;
}
.ss-list-header {
    display: flex;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid #e2e8f0;
    background: #f1f5f9;
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    font-family: 'Consolas', monospace;
}
[data-theme="dark"] .ss-list-header {
    background: #0f172a;
    border-color: #334155;
}
.ss-list-content {
    flex: 1;
    overflow-y: auto;
}
.ss-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #94a3b8;
    text-align: center;
    padding: 20px;
    animation: ssFadeIn 0.4s ease;
}
.ss-empty svg {
    opacity: 0.3;
    margin-bottom: 12px;
    animation: ssEmptyFloat 3s ease-in-out infinite;
}
@keyframes ssEmptyFloat {
    0%, 100% { transform: translateY(0); opacity: 0.25; }
    50% { transform: translateY(-8px); opacity: 0.45; }
}
.ss-empty p {
    font-size: 12px;
    animation: ssFadeIn 0.6s ease;
}
.ss-results-list {
    list-style: none;
    margin: 0;
    padding: 0;
}
.ss-result-item {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
    border-left: 3px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
    animation: ssResultSlideIn 0.3s ease both;
}
@keyframes ssResultSlideIn {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
}
.ss-result-item:hover {
    background: rgba(99, 102, 241, 0.05);
    border-left-color: #cbd5e1;
}
.ss-result-item.selected {
    background: white;
    border-left-color: #4f46e5;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    animation: ssResultSelect 0.2s ease;
}
@keyframes ssResultSelect {
    0% { background: rgba(99, 102, 241, 0.15); }
    100% { background: white; }
}
[data-theme="dark"] .ss-result-item {
    border-bottom-color: #334155;
}
[data-theme="dark"] .ss-result-item:hover {
    background: rgba(99, 102, 241, 0.1);
}
[data-theme="dark"] .ss-result-item.selected {
    background: #334155;
}
.ss-result-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
}
.ss-result-offset {
    font-size: 11px;
    font-weight: 600;
    font-family: 'Consolas', monospace;
    color: #4f46e5;
}
[data-theme="dark"] .ss-result-offset {
    color: #818cf8;
}
.ss-result-tags {
    display: flex;
    gap: 4px;
}
.ss-result-tag {
    padding: 1px 6px;
    font-size: 9px;
    border-radius: 3px;
    background: #f1f5f9;
    color: #64748b;
    border: 1px solid #e2e8f0;
}
[data-theme="dark"] .ss-result-tag {
    background: #0f172a;
    border-color: #475569;
}
/* 不同编码的配色 */
.ss-result-tag[data-encoding="Ascii"] {
    background: #dbeafe;
    color: #1e40af;
    border-color: #93c5fd;
}
.ss-result-tag[data-encoding="Utf8"] {
    background: #dcfce7;
    color: #166534;
    border-color: #86efac;
}
.ss-result-tag[data-encoding="Utf16Le"] {
    background: #fef3c7;
    color: #92400e;
    border-color: #fcd34d;
}
.ss-result-tag[data-encoding="Utf16Be"] {
    background: #fce7f3;
    color: #9d174d;
    border-color: #f9a8d4;
}
[data-theme="dark"] .ss-result-tag[data-encoding="Ascii"] {
    background: #1e3a5f;
    color: #93c5fd;
    border-color: #3b82f6;
}
[data-theme="dark"] .ss-result-tag[data-encoding="Utf8"] {
    background: #14532d;
    color: #86efac;
    border-color: #22c55e;
}
[data-theme="dark"] .ss-result-tag[data-encoding="Utf16Le"] {
    background: #451a03;
    color: #fcd34d;
    border-color: #f59e0b;
}
[data-theme="dark"] .ss-result-tag[data-encoding="Utf16Be"] {
    background: #500724;
    color: #f9a8d4;
    border-color: #ec4899;
}
/* 粉色主题适配 */
[data-theme="sakura"] .ss-result-tag[data-encoding="Ascii"] {
    background: #fce7f3;
    color: #9d174d;
    border-color: #f9a8d4;
}
[data-theme="sakura"] .ss-result-tag[data-encoding="Utf8"] {
    background: #fdf2f8;
    color: #be185d;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-result-tag[data-encoding="Utf16Le"] {
    background: #fff1f2;
    color: #be123c;
    border-color: #fecdd3;
}
[data-theme="sakura"] .ss-result-tag[data-encoding="Utf16Be"] {
    background: #fdf4ff;
    color: #a21caf;
    border-color: #f5d0fe;
}
.ss-result-value {
    font-size: 12px;
    font-family: 'Consolas', monospace;
    color: #334155;
    line-height: 1.5;
    word-break: break-all;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
[data-theme="dark"] .ss-result-value {
    color: #e2e8f0;
}
.ss-highlight {
    background: #4f46e5;
    color: white;
    padding: 0 2px;
    border-radius: 2px;
}

/* List Footer / Pagination */
.ss-list-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 12px;
    border-top: 1px solid #e2e8f0;
    background: #f8fafc;
}
[data-theme="dark"] .ss-list-footer {
    background: #1e293b;
    border-color: #334155;
}
.ss-page-btn {
    padding: 4px 8px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    color: #475569;
    cursor: pointer;
    display: flex;
    align-items: center;
}
.ss-page-btn:hover {
    border-color: #a5b4fc;
    background: #f8fafc;
}
[data-theme="dark"] .ss-page-btn {
    background: #334155;
    border-color: #475569;
    color: #cbd5e1;
}
.ss-page-info {
    font-size: 12px;
    color: #64748b;
    font-variant-numeric: tabular-nums;
}

/* Right Detail Pane */
.ss-detail-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: white;
    min-width: 0;
}
[data-theme="dark"] .ss-detail-pane {
    background: #0f172a;
}
.ss-detail-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #cbd5e1;
    background: #f8fafc;
    animation: ssFadeIn 0.5s ease;
}
.ss-detail-empty svg {
    animation: ssEmptyFloat 4s ease-in-out infinite;
}
[data-theme="dark"] .ss-detail-empty {
    background: #0f172a;
}
.ss-detail-empty svg {
    opacity: 0.1;
    margin-bottom: 12px;
}
.ss-detail-empty p {
    font-size: 12px;
}
.ss-detail-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    animation: ssDetailSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes ssDetailSlideIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes ssFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
.ss-detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
    background: white;
}
[data-theme="dark"] .ss-detail-header {
    background: #1e293b;
    border-color: #334155;
}
.ss-detail-info {
    display: flex;
    align-items: center;
    gap: 8px;
}
.ss-detail-offset {
    padding: 4px 8px;
    background: #e0e7ff;
    color: #4338ca;
    font-size: 11px;
    font-weight: 600;
    font-family: 'Consolas', monospace;
    border-radius: 4px;
    border: 1px solid #c7d2fe;
}
[data-theme="dark"] .ss-detail-offset {
    background: #3730a3;
    color: #c7d2fe;
    border-color: #4f46e5;
}
.ss-detail-encoding {
    padding: 2px 6px;
    font-size: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    color: #64748b;
}
[data-theme="dark"] .ss-detail-encoding {
    border-color: #475569;
    color: #94a3b8;
}
.ss-detail-length {
    font-size: 12px;
    color: #94a3b8;
    font-family: 'Consolas', monospace;
}
.ss-detail-value {
    padding: 16px;
    font-size: 13px;
    font-family: 'Consolas', monospace;
    color: #1e293b;
    line-height: 1.6;
    word-break: break-all;
    border-bottom: 1px solid #f1f5f9;
}
[data-theme="dark"] .ss-detail-value {
    color: #e2e8f0;
    border-color: #334155;
}

/* 收缩状态 */
.ss-detail-value.collapsed {
    max-height: 60px;
    overflow: hidden;
    position: relative;
}
.ss-detail-value.collapsed::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 30px;
    background: linear-gradient(transparent, #ffffff);
    pointer-events: none;
}
[data-theme="dark"] .ss-detail-value.collapsed::after {
    background: linear-gradient(transparent, #1e293b);
}
.ss-collapse-icon {
    transition: transform 0.2s ease;
}
.ss-collapse-icon.rotated {
    transform: rotate(180deg);
}

.ss-detail-context {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #f8fafc;
}
[data-theme="dark"] .ss-detail-context {
    background: #0f172a;
}

/* Context Toolbar */
.ss-context-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    background: #f1f5f9;
    border-bottom: 1px solid #e2e8f0;
}
[data-theme="dark"] .ss-context-toolbar {
    background: #1e293b;
    border-color: #334155;
}

/* 视图切换按钮 */
.ss-context-view-toggle {
    display: flex;
    background: #e2e8f0;
    border-radius: 4px;
    padding: 2px;
}
[data-theme="dark"] .ss-context-view-toggle {
    background: #334155;
}
.ss-view-toggle-btn {
    padding: 4px 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border: none;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    border-radius: 3px;
    transition: all 0.2s;
}
.ss-view-toggle-btn:hover {
    color: #334155;
}
.ss-view-toggle-btn.active {
    background: #ffffff;
    color: #6366f1;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
[data-theme="dark"] .ss-view-toggle-btn {
    color: #94a3b8;
}
[data-theme="dark"] .ss-view-toggle-btn:hover {
    color: #e2e8f0;
}
[data-theme="dark"] .ss-view-toggle-btn.active {
    background: #475569;
    color: #818cf8;
}

/* 编码选择下拉框 */
.ss-context-encoding {
    margin-left: 8px;
    padding: 4px 6px;
    font-size: 10px;
    font-weight: 500;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
    outline: none;
    transition: all 0.2s;
}
.ss-context-encoding:hover {
    border-color: #cbd5e1;
}
.ss-context-encoding:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}
[data-theme="dark"] .ss-context-encoding {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
}
[data-theme="dark"] .ss-context-encoding:hover {
    border-color: #64748b;
}
[data-theme="dark"] .ss-context-encoding:focus {
    border-color: #818cf8;
}

/* 字符串视图样式 */
.ss-string-view {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    line-height: 1.6;
}
.ss-string-row {
    display: flex;
    gap: 16px;
    padding: 2px 0;
}
.ss-string-row:hover {
    background: rgba(99, 102, 241, 0.05);
}
.ss-string-offset {
    color: #64748b;
    font-size: 11px;
    min-width: 80px;
    flex-shrink: 0;
}
.ss-string-content {
    color: #334155;
    word-break: break-all;
    white-space: pre-wrap;
}
[data-theme="dark"] .ss-string-offset {
    color: #94a3b8;
}
[data-theme="dark"] .ss-string-content {
    color: #e2e8f0;
}
[data-theme="dark"] .ss-string-row:hover {
    background: rgba(129, 140, 248, 0.08);
}

.ss-context-actions {
    display: flex;
    gap: 6px;
}
.ss-load-context-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    color: #475569;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
}
.ss-load-context-btn:hover {
    border-color: #a5b4fc;
    color: #4f46e5;
    background: #f8fafc;
}
.ss-load-context-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
[data-theme="dark"] .ss-load-context-btn {
    background: #334155;
    border-color: #475569;
    color: #cbd5e1;
}
[data-theme="dark"] .ss-load-context-btn:hover:not(:disabled) {
    border-color: #818cf8;
    color: #818cf8;
}

.ss-context-header {
    display: flex;
    padding: 8px 16px;
    border-bottom: 1px solid #e2e8f0;
    background: #f1f5f9;
    font-size: 10px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
}
[data-theme="dark"] .ss-context-header {
    background: #1e293b;
    border-color: #334155;
}
.ss-context-body {
    flex: 1;
    overflow: auto;
    padding: 12px 16px;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.8;
}
.ss-hex-row {
    display: flex;
    gap: 16px;
    padding: 2px 0;
    border-radius: 4px;
    transition: background 0.15s;
}
.ss-hex-row:hover {
    background: rgba(99, 102, 241, 0.05);
}
.ss-hex-row.ss-hex-highlight {
    background: rgba(79, 70, 229, 0.1);
}
[data-theme="dark"] .ss-hex-row.ss-hex-highlight {
    background: rgba(129, 140, 248, 0.15);
}
.ss-hex-addr {
    color: #64748b;
    width: 90px;
    flex-shrink: 0;
}
.ss-hex-bytes {
    color: #475569;
    letter-spacing: 1px;
    text-transform: uppercase;
    flex-shrink: 0;
    width: 380px;
}
[data-theme="dark"] .ss-hex-bytes {
    color: #94a3b8;
}
.ss-hex-ascii {
    color: #1e293b;
    white-space: pre;
}
[data-theme="dark"] .ss-hex-ascii {
    color: #e2e8f0;
}
.ss-hex-match {
    background: #4f46e5;
    color: white;
    padding: 0 1px;
    border-radius: 2px;
}

/* Loading state */
.ss-context-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #94a3b8;
    font-size: 12px;
}
.ss-context-loading svg {
    animation: spin 1s linear infinite;
    margin-right: 8px;
}
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

/* 右键菜单 */
.ss-context-menu {
    position: fixed;
    z-index: 9999;
    min-width: 160px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.15);
    padding: 4px 0;
    animation: ssContextMenuIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    transform-origin: top left;
}
@keyframes ssContextMenuIn {
    from { opacity: 0; transform: scale(0.92); }
    to { opacity: 1; transform: scale(1); }
}
[data-theme="dark"] .ss-context-menu {
    background: #1e293b;
    border-color: #475569;
}
[data-theme="sakura"] .ss-context-menu {
    background: #fff1f2;
    border-color: #fecdd3;
}
.ss-context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #475569;
    cursor: pointer;
    transition: background 0.15s;
}
.ss-context-menu-item:hover {
    background: #f1f5f9;
}
[data-theme="dark"] .ss-context-menu-item {
    color: #e2e8f0;
}
[data-theme="dark"] .ss-context-menu-item:hover {
    background: #334155;
}
[data-theme="sakura"] .ss-context-menu-item {
    color: #9d174d;
}
[data-theme="sakura"] .ss-context-menu-item:hover {
    background: #fce7f3;
}
.ss-context-menu-divider {
    height: 1px;
    background: #e2e8f0;
    margin: 4px 0;
}
[data-theme="dark"] .ss-context-menu-divider {
    background: #475569;
}
[data-theme="sakura"] .ss-context-menu-divider {
    background: #fbcfe8;
}

/* ========== 粉色主题整体适配 ========== */
[data-theme="sakura"] .ss-panel {
    background: linear-gradient(135deg, #fff1f2 0%, #fdf2f8 100%);
}
[data-theme="sakura"] .ss-header {
    background: rgba(255,241,242,0.95);
    border-color: #fecdd3;
}
/* 模式切换 */
[data-theme="sakura"] .ss-mode-switcher {
    background: rgba(252, 231, 243, 0.5);
}
[data-theme="sakura"] .ss-mode-tab {
    color: #9d174d;
}
[data-theme="sakura"] .ss-mode-tab:hover {
    color: #be185d;
    background: rgba(252, 231, 243, 0.5);
}
[data-theme="sakura"] .ss-mode-tab.active {
    background: #ffffff;
    color: #ec4899;
    box-shadow: 0 2px 8px rgba(236, 72, 153, 0.15);
}
/* 路径输入 */
[data-theme="sakura"] .ss-path-input {
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-path-icon {
    background: #fdf2f8;
    border-color: #fbcfe8;
    color: #ec4899;
}
[data-theme="sakura"] .ss-path-input input {
    color: #831843;
}
[data-theme="sakura"] .ss-browse-btn {
    background: #fdf2f8;
    border-color: #fbcfe8;
    color: #9d174d;
}
[data-theme="sakura"] .ss-browse-btn:hover {
    background: #fce7f3;
}
/* 图标按钮 */
[data-theme="sakura"] .ss-icon-btn {
    color: #f472b6;
}
[data-theme="sakura"] .ss-icon-btn:hover {
    background: #fce7f3;
    color: #ec4899;
}
/* 搜索输入 */
[data-theme="sakura"] .ss-search-input-wrapper {
    background: #ffffff;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-search-input-wrapper:focus-within {
    border-color: #f472b6;
    box-shadow: 0 0 0 2px rgba(244, 114, 182, 0.15);
}
[data-theme="sakura"] .ss-search-input {
    color: #831843;
}
[data-theme="sakura"] .ss-search-icon {
    color: #f9a8d4;
}
/* 分隔线 */
[data-theme="sakura"] .ss-divider {
    background: #fbcfe8;
}
/* 切换按钮 */
[data-theme="sakura"] .ss-toggle-btn {
    color: #f9a8d4;
}
[data-theme="sakura"] .ss-toggle-btn:hover {
    background: #fce7f3;
    color: #ec4899;
}
[data-theme="sakura"] .ss-toggle-btn.active {
    background: #fce7f3;
    color: #be185d;
}
/* 编码下拉触发器 */
[data-theme="sakura"] .ss-dropdown-trigger {
    color: #9d174d;
}
[data-theme="sakura"] .ss-dropdown-trigger:hover {
    background: #fce7f3;
}
[data-theme="sakura"] .ss-dropdown-trigger.active {
    background: #fce7f3;
    color: #be185d;
}
/* 搜索按钮 */
[data-theme="sakura"] .ss-search-btn {
    background: linear-gradient(135deg, #f472b6 0%, #ec4899 100%);
    box-shadow: 0 2px 4px rgba(236, 72, 153, 0.2);
}
[data-theme="sakura"] .ss-search-btn:hover {
    background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
}
[data-theme="sakura"] .ss-stop-btn {
    background: #f43f5e;
}
[data-theme="sakura"] .ss-stop-btn:hover {
    background: #e11d48;
}
[data-theme="sakura"] .ss-secondary-scan-btn {
    background: linear-gradient(135deg, #a855f7 0%, #9333ea 100%);
    box-shadow: 0 2px 4px rgba(168, 85, 247, 0.2);
}
[data-theme="sakura"] .ss-secondary-scan-btn:hover {
    background: linear-gradient(135deg, #9333ea 0%, #7e22ce 100%);
}
/* 预设按钮 */
[data-theme="sakura"] .ss-preset-btn {
    background: #ffffff;
    border-color: #fbcfe8;
    color: #9d174d;
}
[data-theme="sakura"] .ss-preset-btn:hover {
    border-color: #f472b6;
}
/* 限制输入 */
[data-theme="sakura"] .ss-limits {
    background: #ffffff;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-limits input {
    color: #831843;
}
/* 进度条 */
[data-theme="sakura"] .ss-progress {
    background: #fce7f3;
}
[data-theme="sakura"] .ss-progress-bar {
    background: linear-gradient(90deg, #f472b6, #f9a8d4, #ec4899, #f472b6);
    background-size: 300% 100%;
}
[data-theme="sakura"] .ss-progress-text {
    color: #9d174d;
}
/* 左侧列表面板 */
[data-theme="sakura"] .ss-list-pane {
    background: #fdf2f8;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-list-header {
    background: #fce7f3;
    border-color: #fbcfe8;
    color: #9d174d;
}
/* 空状态 */
[data-theme="sakura"] .ss-empty {
    color: #f9a8d4;
}
[data-theme="sakura"] .ss-empty svg {
    color: #fbcfe8;
}
/* 结果项 */
[data-theme="sakura"] .ss-result-item {
    border-bottom-color: #fce7f3;
}
[data-theme="sakura"] .ss-result-item:hover {
    background: rgba(244, 114, 182, 0.08);
    border-left-color: #fbcfe8;
}
[data-theme="sakura"] .ss-result-item.selected {
    background: #ffffff;
    border-left-color: #ec4899;
    box-shadow: 0 1px 3px rgba(236, 72, 153, 0.1);
}
[data-theme="sakura"] .ss-result-item.active {
    background: #fce7f3;
    border-left-color: #f472b6;
}
[data-theme="sakura"] .ss-result-offset {
    color: #be185d;
}
[data-theme="sakura"] .ss-result-value {
    color: #831843;
}
[data-theme="sakura"] .ss-highlight {
    background: #ec4899;
    color: white;
}
/* 分页 */
[data-theme="sakura"] .ss-list-footer {
    background: #fdf2f8;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-page-btn {
    background: #ffffff;
    border-color: #fbcfe8;
    color: #9d174d;
}
[data-theme="sakura"] .ss-page-btn:hover {
    border-color: #f472b6;
    background: #fce7f3;
}
[data-theme="sakura"] .ss-page-info {
    color: #9d174d;
}
/* 下拉菜单 */
[data-theme="sakura"] .ss-dropdown-menu {
    background: #ffffff;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-dropdown-header {
    background: #fdf2f8;
    border-color: #fce7f3;
    color: #9d174d;
}
[data-theme="sakura"] .ss-dropdown-item {
    color: #831843;
}
[data-theme="sakura"] .ss-dropdown-item:hover {
    background: #fdf2f8;
}
/* 右侧详情面板 */
[data-theme="sakura"] .ss-detail-pane {
    background: #ffffff;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-detail-empty {
    background: #fdf2f8;
    color: #f9a8d4;
}
[data-theme="sakura"] .ss-detail-empty svg {
    color: #fbcfe8;
}
[data-theme="sakura"] .ss-detail-empty p {
    color: #f9a8d4;
}
[data-theme="sakura"] .ss-detail-header {
    background: #ffffff;
    border-color: #fce7f3;
}
[data-theme="sakura"] .ss-detail-offset {
    background: #fce7f3;
    color: #be185d;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-detail-encoding {
    border-color: #fbcfe8;
    color: #9d174d;
}
[data-theme="sakura"] .ss-detail-length {
    color: #f9a8d4;
}
/* 操作按钮 */
[data-theme="sakura"] .ss-action-btn {
    color: #f9a8d4;
}
[data-theme="sakura"] .ss-action-btn:hover {
    background: #fce7f3;
    color: #ec4899;
}
[data-theme="sakura"] .ss-action-danger:hover {
    background: #ffe4e6;
    color: #f43f5e;
}
/* 上下文视图 */
[data-theme="sakura"] .ss-context-toolbar {
    background: #fdf2f8;
    border-color: #fce7f3;
}
[data-theme="sakura"] .ss-context-header {
    background: #fdf2f8;
    border-color: #fce7f3;
}
[data-theme="sakura"] .ss-view-toggle-btn {
    color: #9d174d;
    border-color: #fbcfe8;
}
[data-theme="sakura"] .ss-view-toggle-btn.active {
    background: #ec4899;
    color: white;
    border-color: #ec4899;
}
[data-theme="sakura"] .ss-view-toggle-btn:hover:not(.active) {
    background: #fce7f3;
}
[data-theme="sakura"] .ss-context-encoding {
    background: #ffffff;
    border-color: #fbcfe8;
    color: #9d174d;
}
[data-theme="sakura"] .ss-hex-row {
    color: #831843;
}
[data-theme="sakura"] .ss-hex-addr {
    color: #be185d;
}
[data-theme="sakura"] .ss-hex-row.ss-hex-highlight {
    background: rgba(244, 114, 182, 0.15);
}
[data-theme="sakura"] .ss-hex-match {
    background: #ec4899;
}
/* Toast 通知 sakura 适配 */
[data-theme="sakura"] .ss-toast.ss-toast-success {
    background: rgba(236, 72, 153, 0.92);
}
[data-theme="sakura"] .ss-toast.ss-toast-info {
    background: rgba(244, 114, 182, 0.92);
}

/* ========== Phys2Virt Modal ========== */
.ss-phys2virt-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

.ss-phys2virt-modal {
    background: white;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    width: 90%;
    max-width: 520px;
    max-height: 80vh;
    overflow: hidden;
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from { 
        opacity: 0;
        transform: translateY(20px);
    }
    to { 
        opacity: 1;
        transform: translateY(0);
    }
}

[data-theme="dark"] .ss-phys2virt-modal {
    background: #1e293b;
    border: 1px solid #334155;
}

.ss-phys2virt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e2e8f0;
    background: #ffffff;
}

[data-theme="dark"] .ss-phys2virt-header {
    background: #1e293b;
    border-color: #334155;
}

.ss-phys2virt-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #1e293b;
}

[data-theme="dark"] .ss-phys2virt-header h3 {
    color: #f1f5f9;
}

.ss-phys2virt-close {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: #64748b;
    font-size: 24px;
    cursor: pointer;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}

.ss-phys2virt-close:hover {
    background: #f1f5f9;
    color: #1e293b;
}

[data-theme="dark"] .ss-phys2virt-close:hover {
    background: #334155;
    color: #f1f5f9;
}

.ss-phys2virt-body {
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
}

.ss-phys2virt-icon {
    display: flex;
    align-items: center;
    justify-content: center;
}

.ss-phys2virt-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e2e8f0;
    border-top-color: #4f46e5;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

[data-theme="dark"] .ss-phys2virt-spinner {
    border-color: #334155;
    border-top-color: #818cf8;
}

.ss-phys2virt-offset {
    font-size: 14px;
    color: #64748b;
}

.ss-phys2virt-offset code {
    background: #f1f5f9;
    padding: 4px 8px;
    border-radius: 6px;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 13px;
    color: #4f46e5;
    margin-left: 8px;
}

[data-theme="dark"] .ss-phys2virt-offset {
    color: #94a3b8;
}

[data-theme="dark"] .ss-phys2virt-offset code {
    background: #334155;
    color: #818cf8;
}

.ss-phys2virt-content {
    width: 100%;
    text-align: center;
}

.ss-phys2virt-content p {
    margin: 0;
    color: #475569;
    font-size: 14px;
}

[data-theme="dark"] .ss-phys2virt-content p {
    color: #94a3b8;
}

.ss-phys2virt-content pre {
    margin: 0;
    padding: 16px;
    background: #f1f5f9;
    border-radius: 8px;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 12px;
    color: #1e293b;
    text-align: left;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
}

[data-theme="dark"] .ss-phys2virt-content pre {
    background: #0f172a;
    color: #e2e8f0;
}

.ss-phys2virt-footer {
    padding: 16px 20px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: center;
    gap: 12px;
}

[data-theme="dark"] .ss-phys2virt-footer {
    border-color: #334155;
}

.ss-phys2virt-btn {
    padding: 10px 24px;
    border: none;
    border-radius: 8px;
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.ss-phys2virt-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
}

.ss-phys2virt-modal.error .ss-phys2virt-header {
    background: #ffffff;
    border-bottom-color: #fca5a5;
}

[data-theme="dark"] .ss-phys2virt-modal.error .ss-phys2virt-header {
    background: #1e293b;
    border-bottom-color: #ef4444;
}

.ss-phys2virt-modal.success .ss-phys2virt-header {
    background: #ffffff;
    border-bottom-color: #86efac;
}

[data-theme="dark"] .ss-phys2virt-modal.success .ss-phys2virt-header {
    background: #1e293b;
    border-bottom-color: #22c55e;
}

/* Sakura theme for modal */
[data-theme="sakura"] .ss-phys2virt-modal {
    background: #ffffff;
    border: 1px solid #fbcfe8;
}

[data-theme="sakura"] .ss-phys2virt-header {
    background: #ffffff;
    border-color: #fce7f3;
}

[data-theme="sakura"] .ss-phys2virt-spinner {
    border-color: #fce7f3;
    border-top-color: #ec4899;
}

[data-theme="sakura"] .ss-phys2virt-offset code {
    background: #fdf2f8;
    color: #be185d;
}

[data-theme="sakura"] .ss-phys2virt-content pre {
    background: #fdf2f8;
    color: #831843;
}

[data-theme="sakura"] .ss-phys2virt-btn {
    background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
}

[data-theme="sakura"] .ss-phys2virt-btn:hover {
    box-shadow: 0 4px 12px rgba(236, 72, 153, 0.3);
}

/* Phys2Virt Result Table */
.ss-phys2virt-table-wrapper {
    width: 100%;
    max-height: 400px;
    overflow-y: auto;
    margin-top: 8px;
}

.ss-phys2virt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.ss-phys2virt-table thead {
    position: sticky;
    top: 0;
    background: #f8fafc;
    z-index: 1;
}

[data-theme="dark"] .ss-phys2virt-table thead {
    background: #1e293b;
}

.ss-phys2virt-table th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 600;
    color: #475569;
    border-bottom: 2px solid #e2e8f0;
}

[data-theme="dark"] .ss-phys2virt-table th {
    color: #cbd5e1;
    border-color: #334155;
}

.ss-phys2virt-table td {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
}

[data-theme="dark"] .ss-phys2virt-table td {
    border-color: #1e293b;
}

.ss-phys2virt-table tbody tr:hover {
    background: #f8fafc;
}

[data-theme="dark"] .ss-phys2virt-table tbody tr:hover {
    background: #0f172a;
}

.ss-phys2virt-table code {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 12px;
    color: #4f46e5;
}

[data-theme="dark"] .ss-phys2virt-table code {
    background: #334155;
    color: #818cf8;
}

.ss-phys2virt-table strong {
    color: #1e293b;
    font-weight: 600;
}

[data-theme="dark"] .ss-phys2virt-table strong {
    color: #f1f5f9;
}

/* Sakura theme for table */
[data-theme="sakura"] .ss-phys2virt-table thead {
    background: #fdf2f8;
}

[data-theme="sakura"] .ss-phys2virt-table th {
    color: #831843;
    border-color: #fce7f3;
}

[data-theme="sakura"] .ss-phys2virt-table td {
    border-color: #fce7f3;
}

[data-theme="sakura"] .ss-phys2virt-table tbody tr:hover {
    background: #fdf2f8;
}

[data-theme="sakura"] .ss-phys2virt-table code {
    background: #fce7f3;
    color: #be185d;
}

[data-theme="sakura"] .ss-phys2virt-table strong {
    color: #831843;
}

/* ========== Toast Notification ========== */
.ss-toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    padding: 10px 20px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    z-index: 10001;
    pointer-events: none;
    opacity: 0;
    animation: ssToastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards,
               ssToastOut 0.3s ease 2.2s forwards;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.15);
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 400px;
}
.ss-toast.ss-toast-error {
    background: rgba(239, 68, 68, 0.92);
    color: white;
    border: 1px solid rgba(239, 68, 68, 0.3);
}
.ss-toast.ss-toast-success {
    background: rgba(34, 197, 94, 0.92);
    color: white;
    border: 1px solid rgba(34, 197, 94, 0.3);
}
.ss-toast.ss-toast-info {
    background: rgba(99, 102, 241, 0.92);
    color: white;
    border: 1px solid rgba(99, 102, 241, 0.3);
}
.ss-toast.ss-toast-warning {
    background: rgba(245, 158, 11, 0.92);
    color: white;
    border: 1px solid rgba(245, 158, 11, 0.3);
}
@keyframes ssToastIn {
    from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
    to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
}
@keyframes ssToastOut {
    from { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    to { opacity: 0; transform: translateX(-50%) translateY(-10px) scale(0.95); }
}
.ss-toast svg {
    flex-shrink: 0;
}

/* ========== Copy Feedback ========== */
.ss-copy-feedback {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(34, 197, 94, 0.9);
    color: white;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    pointer-events: none;
    animation: ssCopyPop 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    white-space: nowrap;
}
@keyframes ssCopyPop {
    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    30% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
    60% { opacity: 1; transform: translate(-50%, -60%) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -80%) scale(0.95); }
}

/* ========== Search Speed Indicator ========== */
.ss-search-speed {
    font-size: 10px;
    color: #94a3b8;
    font-family: 'Consolas', monospace;
    padding: 2px 6px;
    background: rgba(99, 102, 241, 0.08);
    border-radius: 3px;
    animation: ssFadeIn 0.3s ease;
}
[data-theme="dark"] .ss-search-speed {
    background: rgba(129, 140, 248, 0.1);
    color: #818cf8;
}

/* ========== Keyboard Shortcut Hints ========== */
.ss-kbd-hint {
    font-size: 9px;
    color: rgba(255,255,255,0.6);
    margin-left: 4px;
    font-family: system-ui;
}

/* ========== List Toolbar ========== */
.ss-list-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    gap: 6px;
    flex-shrink: 0;
}
[data-theme="dark"] .ss-list-toolbar {
    background: #1e293b;
    border-color: #334155;
}
.ss-toolbar-left, .ss-toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
}
.ss-toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px 7px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: transparent;
    color: #64748b;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
}
.ss-toolbar-btn:hover { background: #e2e8f0; color: #334155; }
.ss-toolbar-btn.active { background: #6366f1; color: white; border-color: #6366f1; }
[data-theme="dark"] .ss-toolbar-btn { border-color: #475569; color: #94a3b8; }
[data-theme="dark"] .ss-toolbar-btn:hover { background: #334155; color: #e2e8f0; }
[data-theme="dark"] .ss-toolbar-btn.active { background: #6366f1; color: white; }
.ss-toolbar-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;
    position: relative;
}
.ss-toolbar-icon-btn:hover { background: #e2e8f0; color: #334155; }
.ss-toolbar-icon-btn.active { background: #6366f1; color: white; border-color: #6366f1; }
[data-theme="dark"] .ss-toolbar-icon-btn { color: #94a3b8; }
[data-theme="dark"] .ss-toolbar-icon-btn:hover { background: #334155; color: #e2e8f0; }
[data-theme="dark"] .ss-toolbar-icon-btn.active { background: #6366f1; color: white; }
.ss-toolbar-sep { width: 1px; height: 16px; background: #e2e8f0; margin: 0 2px; }
[data-theme="dark"] .ss-toolbar-sep { background: #475569; }

/* Tag filter */
.ss-tag-filter-select {
    padding: 2px 6px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: transparent;
    color: #64748b;
    font-size: 11px;
    cursor: pointer;
}
[data-theme="dark"] .ss-tag-filter-select {
    border-color: #475569;
    background: #1e293b;
    color: #94a3b8;
}
.ss-tag-filter-chips {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
}

/* ========== Sortable Header ========== */
.ss-sortable-header {
    display: flex !important;
    justify-content: unset !important;
    gap: 0;
}
.ss-sortable-header .ss-col-offset { width: 90px; flex-shrink: 0; }
.ss-sortable-header .ss-col-content { flex: 1; min-width: 0; }
.ss-sortable-header .ss-col-meta { width: 180px; flex-shrink: 0; display: flex; gap: 6px; }
.ss-sortable {
    cursor: pointer;
    user-select: none;
    transition: color 0.15s;
    display: inline-flex;
    align-items: center;
    gap: 2px;
}
.ss-sortable:hover { color: #6366f1; }
.ss-sort-icon::after { content: ''; }
.ss-sortable.asc .ss-sort-icon::after { content: ' \\25B2'; font-size: 8px; }
.ss-sortable.desc .ss-sort-icon::after { content: ' \\25BC'; font-size: 8px; }

/* ========== Column Filters ========== */
.ss-filter-row {
    display: flex;
    padding: 3px 8px;
    gap: 4px;
    border-bottom: 1px solid #e2e8f0;
    background: #fafbfc;
    flex-shrink: 0;
}
[data-theme="dark"] .ss-filter-row {
    background: #0f172a;
    border-color: #334155;
}
.ss-filter-input {
    padding: 2px 6px;
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    font-size: 10px;
    background: white;
    color: #334155;
    outline: none;
}
.ss-filter-input:focus { border-color: #6366f1; }
.ss-filter-row .ss-col-offset { width: 86px; flex-shrink: 0; }
.ss-filter-row .ss-col-content { flex: 1; min-width: 0; }
.ss-filter-row .ss-col-meta { width: 176px; flex-shrink: 0; }
[data-theme="dark"] .ss-filter-input {
    background: #1e293b;
    border-color: #475569;
    color: #e2e8f0;
}

/* ========== Tag System ========== */
.ss-result-item.multi-selected {
    background: rgba(99, 102, 241, 0.08);
}
[data-theme="dark"] .ss-result-item.multi-selected {
    background: rgba(99, 102, 241, 0.15);
}
.ss-result-tag-label {
    display: inline-block;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 500;
    line-height: 16px;
    white-space: nowrap;
}
.ss-result-tag-label[data-tag="可疑"] { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
.ss-result-tag-label[data-tag="IOC"] { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; }
.ss-result-tag-label[data-tag="良性"] { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
.ss-result-tag-label[data-tag="证据"] { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
.ss-result-tag-label[data-tag="关键线索"] { background: #faf5ff; color: #7c3aed; border: 1px solid #ddd6fe; }
[data-theme="dark"] .ss-result-tag-label[data-tag="可疑"] { background: #450a0a; color: #fca5a5; border-color: #7f1d1d; }
[data-theme="dark"] .ss-result-tag-label[data-tag="IOC"] { background: #451a03; color: #fcd34d; border-color: #78350f; }
[data-theme="dark"] .ss-result-tag-label[data-tag="良性"] { background: #022c22; color: #6ee7b7; border-color: #064e3b; }
[data-theme="dark"] .ss-result-tag-label[data-tag="证据"] { background: #172554; color: #93c5fd; border-color: #1e3a5f; }
[data-theme="dark"] .ss-result-tag-label[data-tag="关键线索"] { background: #2e1065; color: #c4b5fd; border-color: #4c1d95; }
.ss-bookmark-indicator {
    display: inline-flex;
    color: #f59e0b;
    margin-right: 3px;
    font-size: 12px;
}

/* ========== Visualization Panel ========== */
.ss-visualization-panel {
    border-bottom: 1px solid #e2e8f0;
    background: #fafbfc;
    flex-shrink: 0;
    overflow: hidden;
}
[data-theme="dark"] .ss-visualization-panel {
    background: #0f172a;
    border-color: #334155;
}
.ss-viz-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    color: #64748b;
    border-bottom: 1px solid #e2e8f0;
}
[data-theme="dark"] .ss-viz-header { border-color: #334155; }
.ss-viz-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;
    font-size: 16px;
    padding: 0 4px;
}
.ss-viz-close:hover { color: #ef4444; }
.ss-viz-content { padding: 8px 10px; }
.ss-viz-section { margin-bottom: 8px; }
.ss-viz-label { font-size: 10px; color: #94a3b8; margin-bottom: 3px; font-weight: 500; }
.ss-viz-row { display: flex; gap: 10px; }
.ss-viz-half { flex: 1; }
canvas { display: block; width: 100% !important; height: auto; border-radius: 4px; }

/* ========== Cluster View ========== */
.ss-cluster-view {
    flex: 1;
    overflow-y: auto;
    padding: 0;
}
.ss-cluster-group {
    border-bottom: 1px solid #e2e8f0;
}
[data-theme="dark"] .ss-cluster-group { border-color: #334155; }
.ss-cluster-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    color: #334155;
    background: #f8fafc;
    transition: background 0.15s;
}
.ss-cluster-header:hover { background: #f1f5f9; }
[data-theme="dark"] .ss-cluster-header { background: #1e293b; color: #e2e8f0; }
[data-theme="dark"] .ss-cluster-header:hover { background: #334155; }
.ss-cluster-arrow {
    transition: transform 0.2s;
    font-size: 10px;
    color: #94a3b8;
}
.ss-cluster-arrow.expanded { transform: rotate(90deg); }
.ss-cluster-count {
    background: #e2e8f0;
    color: #64748b;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 600;
    margin-left: auto;
}
[data-theme="dark"] .ss-cluster-count { background: #334155; color: #94a3b8; }
.ss-cluster-items {
    padding: 0;
    list-style: none;
    margin: 0;
}
.ss-cluster-items .ss-result-item {
    padding-left: 24px;
}

/* ========== Context menu tag submenu ========== */
.ss-context-submenu {
    position: relative;
}
.ss-context-submenu-content {
    position: absolute;
    left: 100%;
    top: -4px;
    min-width: 100px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 4px;
    z-index: 10002;
    display: none;
}
.ss-context-submenu:hover .ss-context-submenu-content { display: block; }
[data-theme="dark"] .ss-context-submenu-content {
    background: #1e293b;
    border-color: #475569;
}

/* ========== YARA toggle in search options ========== */
.ss-yara-toggle.active {
    background: #7c3aed !important;
    color: white !important;
    border-color: #7c3aed !important;
}
[data-theme="dark"] .ss-yara-toggle.active {
    background: #7c3aed !important;
    color: white !important;
}

/* Disabled state for search input in YARA mode */
.ss-search-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #f1f5f9;
}
[data-theme="dark"] .ss-search-input:disabled {
    background: #0f172a;
}
.ss-toggle-btn.disabled {
    opacity: 0.3;
    pointer-events: none;
}

/* YARA result tag in list */
.ss-result-tag[data-encoding="YARA"] {
    background: rgba(124, 58, 237, 0.1);
    color: #7c3aed;
    border: 1px solid rgba(124, 58, 237, 0.3);
}
[data-theme="dark"] .ss-result-tag[data-encoding="YARA"] {
    background: rgba(124, 58, 237, 0.2);
    color: #a78bfa;
    border-color: rgba(124, 58, 237, 0.4);
}
.ss-yara-stats {
    padding: 6px 12px;
    background: rgba(124, 58, 237, 0.06);
    border-bottom: 1px solid #e2e8f0;
    font-size: 11px;
    color: #7c3aed;
    font-weight: 500;
    flex-shrink: 0;
}
[data-theme="dark"] .ss-yara-stats {
    background: rgba(124, 58, 237, 0.12);
    border-color: #334155;
    color: #a78bfa;
}
.ss-yara-progress {
    padding: 6px 12px;
    flex-shrink: 0;
}
.ss-yara-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: #94a3b8;
    text-align: center;
    padding: 40px;
    gap: 8px;
}
.ss-yara-empty svg { opacity: 0.3; }
.ss-yara-match-list {
    flex: 1;
    overflow-y: auto;
    padding: 0;
}
.ss-yara-rule {
    border-bottom: 1px solid #e2e8f0;
}
[data-theme="dark"] .ss-yara-rule { border-color: #334155; }
.ss-yara-rule-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    cursor: pointer;
    transition: background 0.15s;
    font-size: 13px;
    font-weight: 500;
    color: #1e293b;
}
.ss-yara-rule-header:hover { background: rgba(124, 58, 237, 0.05); }
[data-theme="dark"] .ss-yara-rule-header { color: #e2e8f0; }
[data-theme="dark"] .ss-yara-rule-header:hover { background: rgba(124, 58, 237, 0.1); }
.ss-yara-rule-name {
    font-family: 'Consolas', monospace;
    color: #7c3aed;
}
[data-theme="dark"] .ss-yara-rule-name { color: #a78bfa; }
.ss-yara-rule-tag {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    background: #ede9fe;
    color: #7c3aed;
}
[data-theme="dark"] .ss-yara-rule-tag { background: #2e1065; color: #c4b5fd; }
.ss-yara-rule-count {
    margin-left: auto;
    font-size: 11px;
    color: #94a3b8;
}
.ss-yara-rule-body {
    padding: 0 14px 12px 14px;
}
.ss-yara-meta-table {
    width: 100%;
    font-size: 11px;
    border-collapse: collapse;
    margin-bottom: 8px;
}
.ss-yara-meta-table td {
    padding: 2px 8px;
    border-bottom: 1px solid #f1f5f9;
    color: #64748b;
}
[data-theme="dark"] .ss-yara-meta-table td { border-color: #1e293b; color: #94a3b8; }
.ss-yara-meta-table td:first-child { font-weight: 500; color: #334155; width: 100px; }
[data-theme="dark"] .ss-yara-meta-table td:first-child { color: #cbd5e1; }
.ss-yara-string-item {
    display: flex;
    gap: 8px;
    padding: 4px 8px;
    font-size: 11px;
    font-family: 'Consolas', monospace;
    border-radius: 4px;
    transition: background 0.15s;
    cursor: pointer;
}
.ss-yara-string-item:hover { background: rgba(99, 102, 241, 0.06); }
.ss-yara-string-offset { color: #6366f1; min-width: 80px; }
.ss-yara-string-id { color: #94a3b8; min-width: 60px; }
.ss-yara-string-hex { color: #334155; word-break: break-all; }
[data-theme="dark"] .ss-yara-string-hex { color: #e2e8f0; }
`;

/**
 * Super Timeline - 统一取证时间线
 *
 * 布局: 事件列表为主 + 右侧面板(异常/详情) + 顶部迷你时间条(辅助)
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { translate } from '../../i18n';

declare const d3: any;

// ─── 类型定义 ───────────────────────────────────────────────

interface SuperTimelineEvent {
    timestamp_ms: number;
    timestamp_str: string;
    source: string;
    action: string;
    severity: number;
    summary: string;
    detail: string;
    pid: number | null;
    path: string | null;
}

interface TimelineAnomaly {
    anomaly_type: string;
    severity: number;
    start_ms: number;
    end_ms: number;
    start_str: string;
    end_str: string;
    description: string;
    event_count: number;
}

interface SuperTimelineMeta {
    total_count: number;
    time_range: [string, string];
    source_counts: Record<string, number>;
    anomalies: TimelineAnomaly[];
}

interface DensityBucket {
    start_ms: number;
    end_ms: number;
    count: number;
    by_source: Record<string, number>;
}

interface TimelineQuery {
    start_time?: string;
    end_time?: string;
    sources?: string[];
    min_severity?: number;
    keyword?: string;
    page?: number;
    page_size?: number;
}

interface TimelineQueryResult {
    events: SuperTimelineEvent[];
    total_filtered: number;
    total_pages: number;
}

interface DailyCount {
    date: string;
    total: number;
    by_source: Record<string, number>;
    by_hour: number[];
}

interface AnomalySummary {
    total_anomalies: number;
    by_type: Record<string, number>;
    max_severity: number;
    high_severity_count: number;
}

interface TimelineStatistics {
    total_count: number;
    source_counts: Record<string, number>;
    severity_counts: Record<number, number>;
    action_counts: Record<string, number>;
    hourly_distribution: number[];
    daily_distribution: DailyCount[];
    top_paths: [string, number][];
    top_pids: [number, number][];
    anomaly_summary: AnomalySummary;
}

// ─── 常量 ───────────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
    Ntfs: '#f59e0b',
    Evtx: '#3b82f6',
    Registry: '#8b5cf6',
    Process: '#10b981',
};

const SOURCE_ORDER = ['Ntfs', 'Evtx', 'Registry', 'Process'];
const SEVERITY_LABELS = ['Info', 'Low', 'Medium', 'High', 'Critical'];
const PAGE_SIZE = 500;

// ─── 应用状态 ───────────────────────────────────────────────

let meta: SuperTimelineMeta | null = null;
let densityBuckets: DensityBucket[] = [];
let currentEvents: SuperTimelineEvent[] = [];
let currentPage = 0;
let totalFiltered = 0;

let viewStartMs = 0;
let viewEndMs = 0;
let fullStartMs = 0;
let fullEndMs = 0;

// D3 overview 相关
let xScaleOverview: any;
let brushBehavior: any;
let overviewSvg: any;
let isUpdatingBrush = false; // 防止 brush 循环

let queryDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let d3Loaded = false;
let dashboardVisible = false;
let heatmapVisible = false;
let cachedStats: TimelineStatistics | null = null;
let totalPages = 0;
let selectedEvent: SuperTimelineEvent | null = null;

// ─── D3 加载 ────────────────────────────────────────────────

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load: ${src}`));
        document.head.appendChild(script);
    });
}

async function ensureD3(): Promise<void> {
    if (typeof d3 !== 'undefined') { d3Loaded = true; return; }
    const sources = ['/assets/js/d3.v7.min.js', './assets/js/d3.v7.min.js', 'https://d3js.org/d3.v7.min.js'];
    for (const src of sources) {
        try {
            await loadScript(src);
            if (typeof d3 !== 'undefined') { d3Loaded = true; return; }
        } catch { /* try next */ }
    }
}

// ─── 初始化 ─────────────────────────────────────────────────

async function init() {
    setupWindowControls();
    setupFilterListeners();
    await ensureD3();
    await buildTimeline();
}

function setupWindowControls() {
    const win = getCurrentWindow();
    document.getElementById('minimizeBtn')?.addEventListener('click', () => win.minimize());
    document.getElementById('maximizeBtn')?.addEventListener('click', () => win.toggleMaximize());
    document.getElementById('closeBtn')?.addEventListener('click', () => win.close());
}

function setupFilterListeners() {
    ['filterNtfs', 'filterEvtx', 'filterRegistry', 'filterProcess'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', () => debouncedQuery());
    });
    document.getElementById('filterSeverity')?.addEventListener('change', () => debouncedQuery());
    document.getElementById('filterKeyword')?.addEventListener('input', () => debouncedQuery());
    document.getElementById('btnRefresh')?.addEventListener('click', () => buildTimeline());

    document.getElementById('btnPrevPage')?.addEventListener('click', () => {
        if (currentPage > 0) { currentPage--; queryEvents(); }
    });
    document.getElementById('btnNextPage')?.addEventListener('click', () => {
        if (currentPage < totalPages - 1) { currentPage++; queryEvents(); }
    });

    // 仪表板切换
    document.getElementById('btnToggleDashboard')?.addEventListener('click', () => toggleDashboard());

    // 导出
    document.getElementById('btnExport')?.addEventListener('click', () => exportTimeline());

    // 热力图切换
    document.getElementById('btnToggleHeatmap')?.addEventListener('click', () => toggleHeatmap());

    // 时间跳转
    document.getElementById('btnJumpTo')?.addEventListener('click', () => jumpToDate());
    document.getElementById('btnJumpEarliest')?.addEventListener('click', () => {
        viewStartMs = fullStartMs;
        viewEndMs = fullStartMs + 86400000; // +1天
        if (d3Loaded) updateBrushFromView();
        currentPage = 0; queryEvents();
    });
    document.getElementById('btnJumpLatest')?.addEventListener('click', () => {
        viewStartMs = fullEndMs - 86400000; // -1天
        viewEndMs = fullEndMs;
        if (d3Loaded) updateBrushFromView();
        currentPage = 0; queryEvents();
    });

    // 复制详情
    document.getElementById('btnCopyDetail')?.addEventListener('click', () => {
        if (selectedEvent) {
            navigator.clipboard.writeText(selectedEvent.detail).catch(() => {});
        }
    });

    listen<string>('super-timeline-progress', (event) => {
        const el = document.getElementById('loadingText');
        if (el) el.textContent = event.payload;
    });
}

// ─── 数据操作 ───────────────────────────────────────────────

async function buildTimeline() {
    showLoading(true);
    try {
        meta = await invoke<SuperTimelineMeta>('build_super_timeline');
        updateStats();
        renderAnomalyList();

        if (meta.total_count === 0) {
            showLoading(false);
            return;
        }

        // 获取密度数据（用于迷你时间条）
        densityBuckets = await invoke<DensityBucket[]>('get_timeline_density', { bucketCount: 300 });
        if (densityBuckets.length > 0) {
            fullStartMs = densityBuckets[0].start_ms;
            fullEndMs = densityBuckets[densityBuckets.length - 1].end_ms;
        }
        viewStartMs = fullStartMs;
        viewEndMs = fullEndMs;

        if (d3Loaded) initOverviewBar();

        currentPage = 0;
        await queryEvents();
    } catch (e) {
        console.error('构建时间线失败:', e);
    } finally {
        showLoading(false);
    }
}

function debouncedQuery() {
    if (queryDebounceTimer) clearTimeout(queryDebounceTimer);
    queryDebounceTimer = setTimeout(() => { currentPage = 0; queryEvents(); }, 200);
}

async function queryEvents() {
    try {
        const result = await invoke<TimelineQueryResult>('query_super_timeline', { query: buildQuery() });
        currentEvents = result.events;
        totalFiltered = result.total_filtered;
        totalPages = result.total_pages;
        renderEventList();
    } catch (e) {
        console.error('查询失败:', e);
    }
}

function buildQuery(): TimelineQuery {
    const sources: string[] = [];
    if ((document.getElementById('filterNtfs') as HTMLInputElement)?.checked) sources.push('Ntfs');
    if ((document.getElementById('filterEvtx') as HTMLInputElement)?.checked) sources.push('Evtx');
    if ((document.getElementById('filterRegistry') as HTMLInputElement)?.checked) sources.push('Registry');
    if ((document.getElementById('filterProcess') as HTMLInputElement)?.checked) sources.push('Process');

    const severity = parseInt((document.getElementById('filterSeverity') as HTMLSelectElement)?.value || '0');
    const keyword = (document.getElementById('filterKeyword') as HTMLInputElement)?.value?.trim() || undefined;

    return {
        start_time: viewStartMs > fullStartMs ? new Date(viewStartMs).toISOString() : undefined,
        end_time: viewEndMs < fullEndMs ? new Date(viewEndMs).toISOString() : undefined,
        sources: sources.length < 4 ? sources : undefined,
        min_severity: severity > 0 ? severity : undefined,
        keyword: keyword || undefined,
        page: currentPage,
        page_size: PAGE_SIZE,
    };
}

// ─── 统计信息 ───────────────────────────────────────────────

function updateStats() {
    if (!meta) return;
    const el = document.getElementById('stStats');
    if (!el) return;

    const items = [`<span class="st-stat-item">总计: <span class="st-stat-value">${meta.total_count.toLocaleString()}</span></span>`];
    for (const src of SOURCE_ORDER) {
        const count = meta.source_counts[src] || 0;
        if (count > 0) {
            items.push(`<span class="st-stat-item"><span class="st-source-dot" style="background:${SOURCE_COLORS[src]}"></span>${src}: <span class="st-stat-value">${count.toLocaleString()}</span></span>`);
        }
    }
    if (meta.anomalies.length > 0) {
        items.push(`<span class="st-stat-item" style="color:var(--error-color)">异常: <span class="st-stat-value">${meta.anomalies.length}</span></span>`);
    }
    el.innerHTML = items.join('');
}

// ─── 异常列表 ───────────────────────────────────────────────

function renderAnomalyList() {
    const el = document.getElementById('anomalyList');
    const summaryEl = document.getElementById('anomalySummary');
    if (!el || !meta) return;

    // 异常汇总
    if (summaryEl) {
        if (meta.anomalies.length > 0) {
            const typeCounts: Record<string, number> = {};
            for (const a of meta.anomalies) {
                typeCounts[a.anomaly_type] = (typeCounts[a.anomaly_type] || 0) + 1;
            }
            const parts: string[] = [];
            if (typeCounts['burst']) parts.push(`${typeCounts['burst']} 突发`);
            if (typeCounts['suspicious_sequence']) parts.push(`${typeCounts['suspicious_sequence']} 可疑`);
            if (typeCounts['time_gap']) parts.push(`${typeCounts['time_gap']} 间隙`);
            summaryEl.textContent = parts.join(' · ');
        } else {
            summaryEl.textContent = '';
        }
    }

    if (meta.anomalies.length === 0) {
        el.innerHTML = '<div class="st-empty-hint">未检测到异常</div>';
        return;
    }

    el.innerHTML = meta.anomalies.map((a, i) => `
        <div class="st-anomaly-item st-anomaly-severity-${a.severity}" data-index="${i}">
            <div class="st-anomaly-type">
                <span class="st-anomaly-badge ${a.anomaly_type}">${anomalyTypeLabel(a.anomaly_type)}</span>
                <span class="st-event-severity st-severity-${a.severity}">${SEVERITY_LABELS[a.severity] || 'Unknown'}</span>
                ${a.event_count > 0 ? `<span class="st-anomaly-count">${a.event_count} 事件</span>` : ''}
            </div>
            <div class="st-anomaly-desc">${escapeHtml(a.description)}</div>
            <div class="st-anomaly-time">${a.start_str} ~ ${a.end_str}</div>
        </div>
    `).join('');

    // 点击/双击异常 → 设置时间范围筛选 → 刷新事件列表
    el.querySelectorAll('.st-anomaly-item').forEach(item => {
        const jumpToAnomaly = (anomaly: TimelineAnomaly, tight: boolean) => {
            // tight=true: 精确到异常窗口; tight=false: 加边距
            const padding = tight ? 0 : ((anomaly.end_ms - anomaly.start_ms) * 0.1 || 5000);
            viewStartMs = anomaly.start_ms - padding;
            viewEndMs = anomaly.end_ms + padding;

            if (d3Loaded) updateBrushFromView();

            currentPage = 0;
            queryEvents().then(() => {
                // 自动选中第一个事件并显示详情
                if (currentEvents.length > 0) {
                    selectEvent(currentEvents[0]);
                    const firstRow = document.querySelector('.st-event-row');
                    if (firstRow) firstRow.classList.add('selected');
                }
            });

            el.querySelectorAll('.st-anomaly-item').forEach(a => a.classList.remove('selected'));
            item.classList.add('selected');
        };

        item.addEventListener('click', () => {
            const idx = parseInt(item.getAttribute('data-index') || '0');
            const anomaly = meta!.anomalies[idx];
            if (anomaly) jumpToAnomaly(anomaly, false);
        });

        item.addEventListener('dblclick', () => {
            const idx = parseInt(item.getAttribute('data-index') || '0');
            const anomaly = meta!.anomalies[idx];
            if (anomaly) jumpToAnomaly(anomaly, true);
        });
    });
}

function anomalyTypeLabel(type: string): string {
    switch (type) {
        case 'burst': return '突发';
        case 'suspicious_sequence': return '可疑序列';
        case 'time_gap': return '时间间隙';
        default: return type;
    }
}

// ─── 事件列表 (主视图) ─────────────────────────────────────

function renderEventList() {
    const body = document.getElementById('eventListBody');
    const countEl = document.getElementById('eventListCount');
    const pageEl = document.getElementById('pageInfo');
    if (!body) return;

    if (countEl) countEl.textContent = `${totalFiltered.toLocaleString()} 条 (第 ${currentPage + 1}/${Math.max(totalPages, 1)} 页)`;
    if (pageEl) pageEl.textContent = `第 ${currentPage + 1} / ${Math.max(totalPages, 1)} 页`;

    if (currentEvents.length === 0) {
        body.innerHTML = '<div class="st-empty-hint">无匹配事件</div>';
        return;
    }

    body.innerHTML = currentEvents.map((e, i) => {
        // 从 summary 中去掉 [NTFS]/[EVTX]/[REG]/[PROC] 前缀（已有 tag 显示）
        const cleanSummary = e.summary.replace(/^\[(NTFS|EVTX|REG|PROC)\]\s*/, '');
        const sourceLabel = e.source === 'Registry' ? 'REG' : e.source === 'Process' ? 'PROC' : e.source.toUpperCase();
        const act = e.action;
        const actionClass = act === 'Create' ? 'action-create' : act === 'Modify' ? 'action-modify' : act === 'Delete' ? 'action-delete' : act === 'Read' ? 'action-read' : act === 'Exit' ? 'action-exit' : act === 'Error' ? 'action-error' : act === 'Warning' ? 'action-warning' : act === 'Critical' ? 'action-critical' : '';

        return `<div class="st-event-row" data-index="${i}">
            <span class="st-source-tag" style="background:${SOURCE_COLORS[e.source] || '#666'}">${sourceLabel}</span>
            <span class="st-action-tag ${actionClass}">${escapeHtml(e.action)}</span>
            <span class="st-event-time">${escapeHtml(e.timestamp_str)}</span>
            <span class="st-event-summary">${escapeHtml(cleanSummary)}</span>
            ${e.severity > 0 ? `<span class="st-event-severity st-severity-${e.severity}">${SEVERITY_LABELS[e.severity]}</span>` : ''}
            ${e.pid ? `<span class="st-event-pid">PID:${e.pid}</span>` : ''}
        </div>`;
    }).join('');

    body.querySelectorAll('.st-event-row').forEach(row => {
        row.addEventListener('click', () => {
            const idx = parseInt(row.getAttribute('data-index') || '0');
            selectEvent(currentEvents[idx]);
            body.querySelectorAll('.st-event-row').forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
        });
    });
}

function selectEvent(event: SuperTimelineEvent) {
    selectedEvent = event;
    const section = document.getElementById('stDetailSection');
    const content = document.getElementById('detailContent');
    if (!section || !content) return;
    section.style.display = 'flex';

    // 结构化详情
    const lines = event.detail.split('\n');
    const sourceIconMap: Record<string, string> = {
        Ntfs: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
        Evtx: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
        Registry: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>',
        Process: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>',
    };
    const sourceIcon = sourceIconMap[event.source] || sourceIconMap['Process'];
    const severityClass = `st-severity-${event.severity}`;

    let html = `<div class="st-detail-header-info">
        <span class="st-source-tag" style="background:${SOURCE_COLORS[event.source] || '#666'}">${event.source}</span>
        <span class="st-action-tag">${escapeHtml(event.action)}</span>
        ${event.severity > 0 ? `<span class="st-event-severity ${severityClass}">${SEVERITY_LABELS[event.severity]}</span>` : ''}
        ${event.pid ? `<span class="st-event-pid">PID:${event.pid}</span>` : ''}
    </div>
    <div class="st-detail-time">${sourceIcon} ${escapeHtml(event.timestamp_str)}</div>
    <div class="st-detail-fields">`;

    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx < 20) {
            const key = line.slice(0, colonIdx).trim();
            const value = line.slice(colonIdx + 1).trim();
            html += `<div class="st-detail-field">
                <span class="st-detail-key">${escapeHtml(key)}</span>
                <span class="st-detail-val">${escapeHtml(value)}</span>
            </div>`;
        } else if (line.trim()) {
            html += `<div class="st-detail-text">${escapeHtml(line)}</div>`;
        }
    }

    html += '</div>';
    content.innerHTML = html;
}

// ─── 迷你时间条 (辅助，带 brush 选区) ─────────────────────

function initOverviewBar() {
    const container = document.getElementById('stOverview');
    if (!container || densityBuckets.length === 0) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const margin = { left: 50, right: 16, top: 4, bottom: 16 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    d3.select('#svgOverview').selectAll('*').remove();

    overviewSvg = d3.select('#svgOverview')
        .attr('width', width)
        .attr('height', height);

    const g = overviewSvg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    xScaleOverview = d3.scaleTime()
        .domain([new Date(fullStartMs), new Date(fullEndMs)])
        .range([0, innerW]);

    const maxCount = d3.max(densityBuckets, (d: DensityBucket) => d.count) || 1;
    const yScale = d3.scaleLinear().domain([0, maxCount]).range([innerH, 0]);
    const bucketWidth = Math.max(1, innerW / densityBuckets.length);

    // 堆叠密度条
    for (const src of [...SOURCE_ORDER].reverse()) {
        g.selectAll('.st-density-' + src)
            .data(densityBuckets)
            .join('rect')
            .attr('class', 'st-density-bar')
            .attr('x', (d: DensityBucket) => xScaleOverview(new Date(d.start_ms)))
            .attr('width', bucketWidth)
            .attr('y', (d: DensityBucket) => yScale(d.by_source[src] || 0))
            .attr('height', (d: DensityBucket) => innerH - yScale(d.by_source[src] || 0))
            .attr('fill', SOURCE_COLORS[src] || '#666')
            .attr('opacity', 0.7);
    }

    // 异常标记
    if (meta && meta.anomalies.length > 0) {
        g.selectAll('.st-anomaly-marker')
            .data(meta.anomalies)
            .join('rect')
            .attr('class', 'st-anomaly-marker')
            .attr('x', (d: TimelineAnomaly) => xScaleOverview(new Date(d.start_ms)))
            .attr('width', (d: TimelineAnomaly) => Math.max(2, xScaleOverview(new Date(d.end_ms)) - xScaleOverview(new Date(d.start_ms))))
            .attr('y', 0)
            .attr('height', innerH)
            .attr('fill', 'rgba(239,68,68,0.2)')
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 0.5);
    }

    // 简化 X 轴
    g.append('g')
        .attr('class', 'st-axis')
        .attr('transform', 'translate(0,' + innerH + ')')
        .call(d3.axisBottom(xScaleOverview).ticks(6).tickFormat(d3.timeFormat('%m-%d %H:%M')));

    // Brush（选区控制时间范围）
    brushBehavior = d3.brushX()
        .extent([[0, 0], [innerW, innerH]])
        .on('brush end', (event: any) => {
            if (isUpdatingBrush) return; // 防止 updateBrushFromView 触发循环
            if (event.type === 'end') {
                // 只在松开鼠标时查询
                if (!event.selection) {
                    viewStartMs = fullStartMs;
                    viewEndMs = fullEndMs;
                } else {
                    const [x0, x1] = event.selection;
                    viewStartMs = xScaleOverview.invert(x0).getTime();
                    viewEndMs = xScaleOverview.invert(x1).getTime();
                }
                currentPage = 0;
                queryEvents();
            }
        });

    g.append('g')
        .attr('class', 'st-brush')
        .call(brushBehavior);

    // 标签
    overviewSvg.append('text')
        .attr('x', 6).attr('y', margin.top + innerH / 2 + 3)
        .attr('class', 'st-lane-label')
        .attr('font-size', '9px')
        .text('时间范围');
}

/** 从 viewStartMs/viewEndMs 更新 brush 选区（不触发事件） */
function updateBrushFromView() {
    if (!overviewSvg || !xScaleOverview || !brushBehavior) return;
    isUpdatingBrush = true;
    try {
        const brushGroup = overviewSvg.select('.st-brush');
        if (viewStartMs <= fullStartMs && viewEndMs >= fullEndMs) {
            brushGroup.call(brushBehavior.move, null);
        } else {
            const x0 = xScaleOverview(new Date(viewStartMs));
            const x1 = xScaleOverview(new Date(viewEndMs));
            brushGroup.call(brushBehavior.move, [x0, x1]);
        }
    } finally {
        isUpdatingBrush = false;
    }
}

// ─── 工具函数 ───────────────────────────────────────────────

function showLoading(show: boolean) {
    const el = document.getElementById('stLoading');
    if (el) el.style.display = show ? 'flex' : 'none';
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── 仪表板 ───────────────────────────────────────────────

function toggleDashboard() {
    dashboardVisible = !dashboardVisible;
    const el = document.getElementById('stDashboard');
    if (!el) return;

    if (dashboardVisible) {
        el.style.display = 'block';
        renderDashboard();
    } else {
        el.style.display = 'none';
    }
}

async function renderDashboard() {
    const cardsEl = document.getElementById('stDashCards');
    const chartsEl = document.getElementById('stDashCharts');
    if (!cardsEl || !chartsEl || !meta) return;

    // 获取统计数据
    try {
        cachedStats = await invoke<TimelineStatistics>('get_timeline_statistics');
    } catch (e) {
        console.error('获取统计失败:', e);
        return;
    }

    const stats = cachedStats;

    // 计算时间跨度
    const spanMs = fullEndMs - fullStartMs;
    const spanHours = Math.floor(spanMs / 3600000);
    const days = Math.floor(spanHours / 24);
    const hours = spanHours % 24;
    const timeSpan = days > 0 ? `${days}天 ${hours}小时` : `${spanHours}小时`;

    // 事件速率
    const rate = spanHours > 0 ? (stats.total_count / spanHours).toFixed(1) : '0';

    // 指标卡片
    const svgChart = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>';
    const svgClock = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    const svgAlert = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';
    const svgBolt = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>';

    cardsEl.innerHTML = `
        <div class="st-dash-card">
            <div class="st-dash-card-icon">${svgChart}</div>
            <div class="st-dash-card-body">
                <div class="st-dash-card-value">${stats.total_count.toLocaleString()}</div>
                <div class="st-dash-card-label">总事件数</div>
                <div class="st-dash-card-sparkline">
                    ${SOURCE_ORDER.map(s => {
                        const c = stats.source_counts[s] || 0;
                        const pct = stats.total_count > 0 ? (c / stats.total_count * 100).toFixed(0) : '0';
                        return `<span class="st-spark-seg" style="width:${pct}%; background:${SOURCE_COLORS[s]};" title="${s}: ${c.toLocaleString()}"></span>`;
                    }).join('')}
                </div>
            </div>
        </div>
        <div class="st-dash-card">
            <div class="st-dash-card-icon">${svgClock}</div>
            <div class="st-dash-card-body">
                <div class="st-dash-card-value">${timeSpan}</div>
                <div class="st-dash-card-label">时间跨度</div>
            </div>
        </div>
        <div class="st-dash-card ${stats.anomaly_summary.high_severity_count > 0 ? 'st-dash-card-alert' : ''}">
            <div class="st-dash-card-icon">${svgAlert}</div>
            <div class="st-dash-card-body">
                <div class="st-dash-card-value">${stats.anomaly_summary.total_anomalies}</div>
                <div class="st-dash-card-label">异常检测</div>
                ${stats.anomaly_summary.high_severity_count > 0 ? `<div class="st-dash-card-sub">${stats.anomaly_summary.high_severity_count} 高危</div>` : ''}
            </div>
        </div>
        <div class="st-dash-card">
            <div class="st-dash-card-icon">${svgBolt}</div>
            <div class="st-dash-card-body">
                <div class="st-dash-card-value">${rate}</div>
                <div class="st-dash-card-label">事件/小时</div>
            </div>
        </div>
    `;

    // D3 图表
    if (!d3Loaded) {
        chartsEl.innerHTML = '<div class="st-empty-hint">D3 未加载，无法渲染图表</div>';
        return;
    }

    chartsEl.innerHTML = `
        <div class="st-dash-chart-box">
            <div class="st-dash-chart-title">来源分布</div>
            <svg id="svgSourceDonut" width="200" height="160"></svg>
        </div>
        <div class="st-dash-chart-box">
            <div class="st-dash-chart-title">严重度分布</div>
            <svg id="svgSeverityBar" width="300" height="160"></svg>
        </div>
        <div class="st-dash-chart-box st-dash-chart-hourly">
            <div class="st-dash-chart-title">24小时活动</div>
            <svg id="svgHourlyBar" width="380" height="160"></svg>
        </div>
    `;

    renderSourceDonut(stats);
    renderSeverityBar(stats);
    renderHourlyBar(stats);
}

function renderSourceDonut(stats: TimelineStatistics) {
    const svg = d3.select('#svgSourceDonut');
    const width = 200, height = 160;
    const radius = Math.min(width, height) / 2 - 10;
    const g = svg.append('g').attr('transform', `translate(${width / 2 - 30},${height / 2})`);

    const data = SOURCE_ORDER.map(s => ({ source: s, count: stats.source_counts[s] || 0 })).filter(d => d.count > 0);
    const pie = d3.pie().value((d: any) => d.count).sort(null);
    const arc = d3.arc().innerRadius(radius * 0.55).outerRadius(radius);

    g.selectAll('path')
        .data(pie(data))
        .join('path')
        .attr('d', arc)
        .attr('fill', (d: any) => SOURCE_COLORS[d.data.source] || '#666')
        .attr('opacity', 0.85)
        .attr('stroke', 'var(--bg-primary)')
        .attr('stroke-width', 2);

    // 图例
    const legend = svg.append('g').attr('transform', `translate(${width - 55}, 20)`);
    data.forEach((d, i) => {
        const row = legend.append('g').attr('transform', `translate(0, ${i * 18})`);
        row.append('rect').attr('width', 10).attr('height', 10).attr('rx', 2).attr('fill', SOURCE_COLORS[d.source]);
        row.append('text').attr('x', 14).attr('y', 9).attr('font-size', '10px').attr('fill', 'var(--text-secondary)').text(`${d.source}`);
    });
}

function renderSeverityBar(stats: TimelineStatistics) {
    const svg = d3.select('#svgSeverityBar');
    const margin = { top: 10, right: 50, bottom: 20, left: 60 };
    const width = 300 - margin.left - margin.right;
    const height = 160 - margin.top - margin.bottom;
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const sevData = SEVERITY_LABELS.map((label, i) => ({
        label, count: stats.severity_counts[i] || 0, severity: i
    })).filter(d => d.count > 0);

    const SEVERITY_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#ef4444', '#dc2626'];

    const y = d3.scaleBand().domain(sevData.map(d => d.label)).range([0, height]).padding(0.3);
    const x = d3.scaleLinear().domain([0, d3.max(sevData, (d: any) => d.count) || 1]).range([0, width]);

    g.selectAll('rect')
        .data(sevData)
        .join('rect')
        .attr('y', (d: any) => y(d.label)!)
        .attr('height', y.bandwidth())
        .attr('width', (d: any) => x(d.count))
        .attr('rx', 3)
        .attr('fill', (d: any) => SEVERITY_COLORS[d.severity]);

    g.selectAll('.count-label')
        .data(sevData)
        .join('text')
        .attr('x', (d: any) => x(d.count) + 4)
        .attr('y', (d: any) => y(d.label)! + y.bandwidth() / 2 + 4)
        .attr('font-size', '10px')
        .attr('fill', 'var(--text-secondary)')
        .text((d: any) => d.count.toLocaleString());

    g.append('g').call(d3.axisLeft(y).tickSize(0)).selectAll('text').attr('font-size', '10px').attr('fill', 'var(--text-secondary)');
    g.select('.domain').remove();
}

function renderHourlyBar(stats: TimelineStatistics) {
    const svg = d3.select('#svgHourlyBar');
    const margin = { top: 10, right: 10, bottom: 24, left: 30 };
    const width = 380 - margin.left - margin.right;
    const height = 160 - margin.top - margin.bottom;
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const data = stats.hourly_distribution.map((count, hour) => ({ hour, count }));
    const x = d3.scaleBand().domain(data.map(d => d.hour.toString())).range([0, width]).padding(0.2);
    const maxCount = d3.max(data, (d: any) => d.count) || 1;
    const y = d3.scaleLinear().domain([0, maxCount]).range([height, 0]);

    g.selectAll('rect')
        .data(data)
        .join('rect')
        .attr('x', (d: any) => x(d.hour.toString())!)
        .attr('y', (d: any) => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', (d: any) => height - y(d.count))
        .attr('rx', 2)
        .attr('fill', 'var(--primary-color)')
        .attr('opacity', 0.7);

    g.append('g').attr('transform', `translate(0,${height})`).call(
        d3.axisBottom(x).tickValues(data.filter(d => d.hour % 3 === 0).map(d => d.hour.toString()))
    ).selectAll('text').attr('font-size', '9px').attr('fill', 'var(--text-secondary)');
    g.selectAll('.domain, .tick line').attr('stroke', 'var(--border-color)');

    g.append('g').call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0s')))
        .selectAll('text').attr('font-size', '9px').attr('fill', 'var(--text-secondary)');
}

// ─── 热力图 ──────────────────────────────────────────────

function toggleHeatmap() {
    heatmapVisible = !heatmapVisible;
    const heatEl = document.getElementById('stHeatmap');
    const overviewSvgEl = document.getElementById('svgOverview');

    if (heatmapVisible) {
        if (heatEl) heatEl.style.display = 'block';
        if (overviewSvgEl) overviewSvgEl.style.display = 'none';
        renderHeatmap();
    } else {
        if (heatEl) heatEl.style.display = 'none';
        if (overviewSvgEl) overviewSvgEl.style.display = 'block';
    }
}

async function renderHeatmap() {
    if (!d3Loaded || !cachedStats) {
        try {
            cachedStats = await invoke<TimelineStatistics>('get_timeline_statistics');
        } catch { return; }
    }

    const container = document.getElementById('stHeatmap');
    if (!container || !cachedStats || cachedStats.daily_distribution.length === 0) return;

    const data = cachedStats.daily_distribution;
    const svgEl = d3.select('#svgHeatmap');
    svgEl.selectAll('*').remove();

    const rect = container.getBoundingClientRect();
    const margin = { top: 20, right: 10, bottom: 20, left: 45 };
    const width = rect.width - margin.left - margin.right;
    const cellHeight = 6;
    const height = 24 * cellHeight;

    svgEl.attr('width', rect.width).attr('height', height + margin.top + margin.bottom);
    const g = svgEl.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const dates = data.map(d => d.date);
    const cellWidth = Math.max(2, width / dates.length);

    // 颜色比例
    let maxVal = 0;
    for (const d of data) {
        for (const v of d.by_hour) {
            if (v > maxVal) maxVal = v;
        }
    }
    const colorScale = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, maxVal || 1]);

    // 绘制单元格
    data.forEach((day, di) => {
        day.by_hour.forEach((count, hour) => {
            if (count === 0) return;
            g.append('rect')
                .attr('x', di * cellWidth)
                .attr('y', hour * cellHeight)
                .attr('width', cellWidth - 0.5)
                .attr('height', cellHeight - 0.5)
                .attr('rx', 1)
                .attr('fill', colorScale(count))
                .append('title')
                .text(`${day.date} ${hour}:00 - ${count} 事件`);
        });
    });

    // Y 轴 (小时)
    const yScale = d3.scaleLinear().domain([0, 23]).range([0, height - cellHeight]);
    g.append('g').call(
        d3.axisLeft(yScale).ticks(6).tickFormat((d: any) => `${d}:00`)
    ).selectAll('text').attr('font-size', '8px').attr('fill', 'var(--text-secondary)');
    g.select('.domain').remove();

    // X 轴 (日期)
    if (dates.length > 0) {
        const xLabels = dates.length <= 10 ? dates : dates.filter((_, i) => i % Math.ceil(dates.length / 8) === 0);
        xLabels.forEach(date => {
            const idx = dates.indexOf(date);
            g.append('text')
                .attr('x', idx * cellWidth + cellWidth / 2)
                .attr('y', height + 14)
                .attr('text-anchor', 'middle')
                .attr('font-size', '8px')
                .attr('fill', 'var(--text-secondary)')
                .text(date.slice(5)); // MM-DD
        });
    }
}

// ─── 时间跳转 ──────────────────────────────────────────

function jumpToDate() {
    const input = document.getElementById('jumpToDate') as HTMLInputElement;
    if (!input || !input.value) return;

    const date = new Date(input.value);
    viewStartMs = date.getTime();
    viewEndMs = viewStartMs + 86400000; // +1天

    if (d3Loaded) updateBrushFromView();
    currentPage = 0;
    queryEvents();
}

// ─── 导出 ────────────────────────────────────────────────

async function exportTimeline() {
    if (currentEvents.length === 0) return;

    try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const filePath = await save({
            title: translate('导出时间线事件'),
            filters: [{ name: translate('CSV 文件'), extensions: ['csv'] }],
            defaultPath: 'super_timeline.csv',
        });
        if (!filePath) return;

        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        const csvEscape = (s: string) => {
            if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        };
        const headers = ['Timestamp', 'Source', 'Action', 'Severity', 'Summary', 'PID', 'Path'];
        const rows = currentEvents.map(e => [
            csvEscape(e.timestamp_str),
            e.source,
            csvEscape(e.action),
            SEVERITY_LABELS[e.severity] || 'Info',
            csvEscape(e.summary),
            (e.pid || '').toString(),
            csvEscape(e.path || ''),
        ].join(','));
        await writeTextFile(filePath, [headers.join(','), ...rows].join('\n'));
    } catch (e) {
        console.error('导出失败:', e);
    }
}

// ─── 窗口 resize ──────────────────────────────────────────

let resizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (densityBuckets.length > 0 && d3Loaded) initOverviewBar();
        if (heatmapVisible && d3Loaded) renderHeatmap();
    }, 200);
});

// ─── 启动 ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);

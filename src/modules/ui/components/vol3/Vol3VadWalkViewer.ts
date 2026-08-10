/**
 * Vol3 VAD 遍历视图 (vadwalk)
 * 按进程分组手风琴，显示 VAD 树节点的 Parent/Left/Right/Start/End/Tag
 */

import { loadVol3Csv, esc } from './vol3CsvUtils';

interface Vol3VadNode {
  pid: number; process: string; offset: string;
  parent: string; left: string; right: string;
  start: string; end: string; tag: string;
}

interface Vol3VadWalkGroup {
  pid: number; process: string; nodes: Vol3VadNode[];
}

export class Vol3VadWalkViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3VadWalkGroup[] = [];
  private total = 0;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private expandedPids: Set<number> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);

      const nodes: Vol3VadNode[] = rows.slice(1).map(r => ({
        pid: parseInt(r[idx('PID')] || '0', 10), process: r[idx('Process')] || '',
        offset: r[idx('Offset')] || '', parent: r[idx('Parent')] || '',
        left: r[idx('Left')] || '', right: r[idx('Right')] || '',
        start: r[idx('Start')] || '', end: r[idx('End')] || '',
        tag: (r[idx('Tag')] || '').trim(),
      }));

      this.total = nodes.length;
      const map = new Map<number, Vol3VadWalkGroup>();
      nodes.forEach(n => {
        if (!map.has(n.pid)) map.set(n.pid, { pid: n.pid, process: n.process, nodes: [] });
        map.get(n.pid)!.nodes.push(n);
      });
      this.groups = Array.from(map.values()).sort((a, b) => a.pid - b.pid);
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析VAD遍历...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.groups.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }

    const filtered = this.getFiltered();

    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.total.toLocaleString()}</span> VAD节点</span>
        </div>
        <div class="mod-toolbar">
          <input type="text" class="mod-search" id="v3vadw-search" placeholder="搜索地址、进程..." value="${esc(this.searchKeyword)}">
        </div>
        <div class="mod-list" id="v3vadw-list">
          ${filtered.length === 0 ? '<div class="mod-empty">没有匹配</div>' : filtered.map(g => this.renderGroup(g)).join('')}
        </div>
      </div>`;
  }

  private renderGroup(g: Vol3VadWalkGroup): string {
    const isExpanded = this.expandedPids.has(g.pid);
    const kw = this.searchKeyword.toLowerCase();
    let nodes = g.nodes;
    if (kw) nodes = nodes.filter(n => n.start.includes(kw) || n.end.includes(kw) || n.offset.includes(kw));

    return `
      <div class="mod-process ${isExpanded ? 'expanded' : ''}" data-pid="${g.pid}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid">PID ${g.pid}</span>
          <span class="mod-pname">${esc(g.process)}</span>
          <span class="mod-pcount">${nodes.length} 节点</span>
        </div>
        ${isExpanded ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="width:130px">Offset</th><th style="width:130px">Parent</th><th style="width:130px">Left</th><th style="width:130px">Right</th><th style="width:110px">Start</th><th style="width:110px">End</th><th style="width:40px">Tag</th></tr></thead>
          <tbody>${nodes.map(n => `<tr class="mod-row">
            <td class="mod-cell-addr">${esc(n.offset)}</td>
            <td class="mod-cell-addr">${esc(n.parent)}</td>
            <td class="mod-cell-addr">${esc(n.left)}</td>
            <td class="mod-cell-addr">${esc(n.right)}</td>
            <td class="mod-cell-addr" style="color:#2563eb">${esc(n.start)}</td>
            <td class="mod-cell-addr" style="color:#2563eb">${esc(n.end)}</td>
            <td style="font-size:10px;color:#94a3b8">${esc(n.tag)}</td>
          </tr>`).join('')}</tbody></table>
          ${nodes.length === 0 ? '<div class="mod-empty" style="padding:16px">没有匹配</div>' : ''}
        </div>` : ''}
      </div>`;
  }

  private getFiltered(): Vol3VadWalkGroup[] {
    const kw = this.searchKeyword.toLowerCase();
    if (!kw) return this.groups;
    return this.groups.filter(g => {
      if (g.process.toLowerCase().includes(kw) || g.pid.toString().includes(kw)) return true;
      return g.nodes.some(n => n.start.includes(kw) || n.end.includes(kw) || n.offset.includes(kw));
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3vadw-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3vadw-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3vadw-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header'); if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement; if (!p) return;
      const pid = parseInt(p.getAttribute('data-pid') || '0', 10);
      if (this.expandedPids.has(pid)) this.expandedPids.delete(pid); else this.expandedPids.add(pid);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.total = 0; this.expandedPids.clear(); this.searchKeyword = ''; this.error = null; }
}

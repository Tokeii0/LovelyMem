/**
 * Vol3 会话信息视图 (sessions)
 * 按 Session ID 分组，显示用户和关联进程
 */
import { loadVol3Csv, esc, highlight } from './vol3CsvUtils';

interface Vol3Session { sessionId: string; sessionType: string; pid: number; process: string; userName: string; createTime: string; }
interface Vol3SessionGroup { sessionId: string; users: Set<string>; processes: Vol3Session[]; }

export class Vol3SessionsViewer {
  private container: HTMLElement | null = null;
  private groups: Vol3SessionGroup[] = [];
  private total = 0;
  private isLoading = false;
  private error: string | null = null;
  private searchKeyword = '';
  private expandedSessions: Set<string> = new Set();

  init(containerId: string) { this.container = document.getElementById(containerId); }

  async load(fileName: string) {
    if (!this.container) return;
    this.isLoading = true; this.error = null; this.render();
    try {
      const rows = await loadVol3Csv(fileName);
      if (rows.length < 2) { this.isLoading = false; this.render(); this.bindEvents(); return; }
      const h = rows[0]; const idx = (n: string) => h.indexOf(n);
      const sessions: Vol3Session[] = rows.slice(1).map(r => ({
        sessionId: r[idx('Session ID')] || 'N/A', sessionType: r[idx('Session Type')] || '',
        pid: parseInt(r[idx('Process ID')] || '0', 10), process: r[idx('Process')] || '',
        userName: r[idx('User Name')] || '', createTime: r[idx('Create Time')] || '',
      }));
      this.total = sessions.length;
      const map = new Map<string, Vol3SessionGroup>();
      sessions.forEach(s => {
        if (!map.has(s.sessionId)) map.set(s.sessionId, { sessionId: s.sessionId, users: new Set(), processes: [] });
        const g = map.get(s.sessionId)!; g.processes.push(s);
        if (s.userName && s.userName !== '-') g.users.add(s.userName);
      });
      this.groups = Array.from(map.values()).sort((a, b) => {
        if (a.sessionId === 'N/A') return -1; if (b.sessionId === 'N/A') return 1;
        return parseInt(a.sessionId) - parseInt(b.sessionId);
      });
    } catch (e) { this.error = String(e); }
    this.isLoading = false; this.render(); this.bindEvents();
  }

  private render() {
    if (!this.container) return;
    if (this.isLoading) { this.container.innerHTML = `<div class="mod-loading"><div class="mod-spinner"></div><div>正在解析会话信息...</div></div>`; return; }
    if (this.error) { this.container.innerHTML = `<div class="svc-error">${esc(this.error)}</div>`; return; }
    if (!this.groups.length) { this.container.innerHTML = `<div class="svc-empty">暂无数据</div>`; return; }
    const allUsers = [...new Set(this.groups.flatMap(g => [...g.users]))].filter(Boolean);
    const filtered = this.getFiltered();
    this.container.innerHTML = `
      <div class="mod-wrapper">
        <div style="padding:10px 16px;background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.12);border-radius:8px;margin-bottom:10px">
          <div style="font-size:12px;color:#64748b">👤 发现 <strong style="color:#2563eb">${this.groups.length}</strong> 个会话，${allUsers.length > 0 ? `涉及用户：${allUsers.map(u => `<strong style="color:#2563eb">${esc(u)}</strong>`).join('、')}` : '无用户名信息'}。每个会话下显示其关联的进程。</div>
        </div>
        <div class="mod-stats-bar">
          <span class="mod-stat"><span class="mod-stat-v">${this.groups.length}</span> 会话</span>
          <span class="mod-stat"><span class="mod-stat-v">${this.total}</span> 进程</span>
          <span class="mod-stat"><span class="mod-stat-v">${allUsers.length}</span> 用户</span>
        </div>
        <div class="mod-toolbar"><input type="text" class="mod-search" id="v3sess-search" placeholder="搜索进程、用户..." value="${esc(this.searchKeyword)}"></div>
        <div class="mod-list" id="v3sess-list">${filtered.map(g => this.renderGroup(g)).join('') || '<div class="mod-empty">没有匹配</div>'}</div>
      </div>`;
  }

  private renderGroup(g: Vol3SessionGroup): string {
    const isExp = this.expandedSessions.has(g.sessionId);
    const kw = this.searchKeyword.toLowerCase();
    let procs = g.processes;
    if (kw) procs = procs.filter(p => p.process.toLowerCase().includes(kw) || p.userName.toLowerCase().includes(kw));
    const users = [...g.users].filter(Boolean);
    return `
      <div class="mod-process ${isExp ? 'expanded' : ''}" data-sid="${esc(g.sessionId)}">
        <div class="mod-process-header">
          <span class="mod-arrow">${isExp ? '&#9660;' : '&#9654;'}</span>
          <span class="mod-pid" style="font-weight:700">Session ${g.sessionId}</span>
          ${users.length > 0 ? `<span style="color:#2563eb;font-size:11px;font-weight:500">👤 ${users.join(', ')}</span>` : ''}
          <span class="mod-pcount">${procs.length} 进程</span>
        </div>
        ${isExp ? `<div class="mod-detail"><table class="mod-table">
          <thead><tr><th style="width:60px">PID</th><th style="width:140px">进程</th><th style="width:100px">用户</th><th style="width:60px">类型</th><th>创建时间</th></tr></thead>
          <tbody>${procs.map(p => `<tr class="mod-row">
            <td class="mod-cell-addr">${p.pid}</td>
            <td class="mod-cell-name">${highlight(p.process, this.searchKeyword)}</td>
            <td style="color:#2563eb;font-size:11px">${esc(p.userName && p.userName !== '-' ? p.userName : '-')}</td>
            <td style="font-size:10px;color:#94a3b8">${esc(p.sessionType && p.sessionType !== '-' ? p.sessionType : '-')}</td>
            <td style="font-size:10px;color:#94a3b8">${esc(p.createTime)}</td>
          </tr>`).join('')}</tbody></table></div>` : ''}
      </div>`;
  }

  private getFiltered() {
    const kw = this.searchKeyword.toLowerCase();
    if (!kw) return this.groups;
    return this.groups.filter(g => {
      if ([...g.users].some(u => u.toLowerCase().includes(kw))) return true;
      return g.processes.some(p => p.process.toLowerCase().includes(kw) || p.userName.toLowerCase().includes(kw));
    });
  }

  private bindEvents() {
    if (!this.container) return;
    const input = this.container.querySelector('#v3sess-search') as HTMLInputElement;
    if (input) { let t: number | null = null; input.addEventListener('input', () => { if (t) clearTimeout(t); t = window.setTimeout(() => { this.searchKeyword = input.value; this.render(); this.bindEvents(); const n = this.container?.querySelector('#v3sess-search') as HTMLInputElement; if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); }); }
    this.container.querySelector('#v3sess-list')?.addEventListener('click', e => {
      const h = (e.target as HTMLElement).closest('.mod-process-header'); if (!h) return;
      const p = h.closest('.mod-process') as HTMLElement; if (!p) return;
      const sid = p.getAttribute('data-sid') || '';
      if (this.expandedSessions.has(sid)) this.expandedSessions.delete(sid); else this.expandedSessions.add(sid);
      this.render(); this.bindEvents();
    });
  }

  cleanup() { this.groups = []; this.total = 0; this.expandedSessions.clear(); this.searchKeyword = ''; this.error = null; }
}

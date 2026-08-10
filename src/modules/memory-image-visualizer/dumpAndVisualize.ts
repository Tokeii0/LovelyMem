// 入口 A 共享逻辑：右键进程 PID → dump 该进程内存 → 打开可视化窗口。
//
// 该模块在「主窗口」上下文被进程列表/CSV 表格调用，因此进度模态采用自包含的
// 内联样式（复用主窗口已有的主题 CSS 变量），不依赖可视化页面的独立 CSS。

import { listen } from '@tauri-apps/api/event';
import { dumpProcessMemory, openVisualizerWindow, cancelMemmapDump } from './api';

interface Vol3ProgressEvent {
  plugin: string;
  message: string;
  stage: string;
}

interface ProgressModal {
  root: HTMLElement;
  setMessage(text: string): void;
  setError(text: string): void;
  onCancel(handler: () => void): void;
  close(): void;
}

function createProgressModal(pid: number, processName?: string): ProgressModal {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(0,0,0,0.45)', 'backdrop-filter:blur(2px)',
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'min-width:380px', 'max-width:520px', 'padding:22px 24px',
    'background:var(--bg-secondary,#fff)', 'color:var(--text-primary,#2d3748)',
    'border:1px solid var(--border-color,rgba(0,0,0,0.1))', 'border-radius:14px',
    'box-shadow:0 18px 50px rgba(0,0,0,0.28)', 'font-size:13px',
  ].join(';');

  const title = document.createElement('div');
  title.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:15px;font-weight:700;margin-bottom:6px;';
  title.innerHTML =
    '<span style="display:inline-flex">'
    + '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--primary-color,#4299e1)" stroke-width="2">'
    + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>'
    + '<span>导出进程内存</span>';

  const sub = document.createElement('div');
  sub.style.cssText = 'color:var(--text-secondary,#718096);margin-bottom:14px;';
  sub.textContent = `PID ${pid}${processName ? ` · ${processName}` : ''} — 正在用 Volatility3 dump，进程较大时可能需要数十秒到数分钟…`;

  const spinnerWrap = document.createElement('div');
  spinnerWrap.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;';
  const spinner = document.createElement('div');
  spinner.style.cssText = [
    'width:22px', 'height:22px', 'flex-shrink:0', 'border-radius:50%',
    'border:3px solid var(--border-color,rgba(0,0,0,0.1))',
    'border-top-color:var(--primary-color,#4299e1)', 'animation:mivspin 0.8s linear infinite',
  ].join(';');
  const msg = document.createElement('div');
  msg.style.cssText = 'flex:1;min-width:0;font-family:Consolas,monospace;font-size:12px;color:var(--text-secondary,#718096);word-break:break-all;max-height:60px;overflow:hidden;';
  msg.textContent = '启动中…';
  spinnerWrap.append(spinner, msg);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = [
    'padding:7px 16px', 'border-radius:8px', 'cursor:pointer', 'font-size:13px',
    'border:1px solid var(--border-color,rgba(0,0,0,0.1))',
    'background:var(--bg-tertiary,#f4f6f8)', 'color:var(--text-primary,#2d3748)',
  ].join(';');
  btnRow.append(cancelBtn);

  // 注入一次性 keyframes
  if (!document.getElementById('miv-dump-style')) {
    const st = document.createElement('style');
    st.id = 'miv-dump-style';
    st.textContent = '@keyframes mivspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }

  card.append(title, sub, spinnerWrap, btnRow);
  overlay.append(card);

  return {
    root: overlay,
    setMessage(text: string) {
      if (text) msg.textContent = text;
    },
    setError(text: string) {
      spinner.style.display = 'none';
      msg.style.color = 'var(--error-color,#f56565)';
      msg.style.maxHeight = '160px';
      msg.style.overflowY = 'auto';
      msg.textContent = text;
      cancelBtn.textContent = '关闭';
      sub.textContent = `PID ${pid} 内存导出失败`;
    },
    onCancel(handler: () => void) {
      cancelBtn.addEventListener('click', handler);
    },
    close() {
      overlay.remove();
    },
  };
}

/**
 * dump 指定进程内存并打开可视化窗口，全程显示进度模态、可取消。
 * @param pid 进程 PID
 * @param processName 进程名（仅用于提示展示）
 */
export async function dumpAndVisualize(pid: number, processName?: string): Promise<void> {
  if (!Number.isFinite(pid) || pid < 0) {
    console.error('[内存图像可视化] 非法 PID:', pid);
    return;
  }

  const modal = createProgressModal(pid, processName);
  document.body.appendChild(modal.root);

  let unlisten: (() => void) | null = null;
  let cancelled = false;
  let finished = false;

  modal.onCancel(async () => {
    if (finished) {
      modal.close();
      return;
    }
    cancelled = true;
    await cancelMemmapDump();
    modal.close();
  });

  try {
    unlisten = await listen<Vol3ProgressEvent>('vol3-progress', (e) => {
      if (e.payload?.plugin === 'memmap') modal.setMessage(e.payload.message || '');
    });

    const dumpPath = await dumpProcessMemory(pid);
    finished = true;
    if (cancelled) return;

    await openVisualizerWindow(dumpPath);
    modal.close();
  } catch (err) {
    finished = true;
    if (!cancelled) {
      modal.setError(err instanceof Error ? err.message : String(err));
    }
  } finally {
    if (unlisten) unlisten();
  }
}

/**
 * 在进程视图中弹出右键菜单：「可视化进程内存」。
 * 供 Vol3PsListViewer / Vol3PsTreeViewer / CSV 表格等复用。
 */
export function showProcessContextMenu(e: MouseEvent, pid: number, name?: string): void {
  e.preventDefault();
  document.querySelectorAll('.miv-proc-ctxmenu').forEach((m) => m.remove());

  const menu = document.createElement('div');
  menu.className = 'miv-proc-ctxmenu';
  menu.style.cssText = [
    'position:fixed', `left:${e.clientX}px`, `top:${e.clientY}px`, 'z-index:99998',
    'min-width:184px', 'padding:6px', 'border-radius:10px',
    'background:var(--bg-secondary,#fff)', 'color:var(--text-primary,#2d3748)',
    'border:1px solid var(--border-color,rgba(0,0,0,0.1))',
    'box-shadow:0 12px 36px rgba(0,0,0,0.22)', 'font-size:13px', 'user-select:none',
  ].join(';');

  const item = document.createElement('div');
  item.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:7px;cursor:pointer;';
  item.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--primary-color,#4299e1)" stroke-width="2">'
    + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>'
    + `<span>可视化进程内存${name ? ` · ${escapeText(name)}` : ''}</span>`;
  item.addEventListener('mouseenter', () => { item.style.background = 'var(--bg-tertiary,#f4f6f8)'; });
  item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
  item.addEventListener('click', () => {
    menu.remove();
    void dumpAndVisualize(pid, name);
  });
  menu.appendChild(item);
  document.body.appendChild(menu);

  // 点击别处 / 滚动 / Esc 关闭
  const close = (ev?: Event) => {
    if (ev && ev.type === 'mousedown' && menu.contains(ev.target as Node)) return;
    menu.remove();
    document.removeEventListener('mousedown', close, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', close);
  };
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
  setTimeout(() => {
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
  }, 0);
}

function escapeText(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

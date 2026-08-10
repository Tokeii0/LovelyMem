import { Terminal } from '@xterm/xterm';

export interface Suggestion {
    label: string;
    value: string;
    description?: string;
    type: 'command' | 'profile' | 'flag' | 'history' | 'tool';
    icon?: string;
    score?: number;
    group?: string;  // 分组标签（用于 profile 分类显示）
}

// ─── SVG 图标库（16×16 单色描边风格）───────────────────────────
const SVG_ATTR = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"';
const ICONS: Record<string, string> = {
    folder:      `<svg ${SVG_ATTR}><path d="M2 4h4l1.5 1.5H14v8H2z"/></svg>`,
    folderOpen:  `<svg ${SVG_ATTR}><path d="M2 4h4l1.5 1.5H13v2H5.5L2 13V4z"/><path d="M2 7.5h11l-2.5 6H2z"/></svg>`,
    file:        `<svg ${SVG_ATTR}><path d="M4 1.5h5l3.5 3.5v9.5H4z"/><path d="M9 1.5v3.5h3.5"/></svg>`,
    fileText:    `<svg ${SVG_ATTR}><path d="M4 1.5h5l3.5 3.5v9.5H4z"/><path d="M9 1.5v3.5h3.5"/><line x1="6" y1="8" x2="11" y2="8"/><line x1="6" y1="10.5" x2="9" y2="10.5"/></svg>`,
    pin:         `<svg ${SVG_ATTR}><path d="M8 1.5a4 4 0 0 0-4 4c0 3.5 4 8 4 8s4-4.5 4-8a4 4 0 0 0-4-4z"/><circle cx="8" cy="5.5" r="1.2" fill="currentColor" stroke="none"/></svg>`,
    chat:        `<svg ${SVG_ATTR}><path d="M2 2.5h12v8.5H6.5L3 14V11H2z"/></svg>`,
    trash:       `<svg ${SVG_ATTR}><path d="M3 4.5h10l-.8 9.5H3.8z"/><path d="M1.5 4.5h13"/><path d="M6 2.5h4v2H6z"/></svg>`,
    clipboard:   `<svg ${SVG_ATTR}><rect x="3.5" y="2" width="9" height="12" rx="1"/><path d="M6 1h4v2.5H6z"/><line x1="6" y1="6.5" x2="10" y2="6.5"/><line x1="6" y1="9" x2="10" y2="9"/><line x1="6" y1="11.5" x2="8" y2="11.5"/></svg>`,
    arrowRight:  `<svg ${SVG_ATTR}><path d="M3 13L13 3"/><path d="M6 3h7v7"/></svg>`,
    search:      `<svg ${SVG_ATTR}><circle cx="6.5" cy="6.5" r="4"/><path d="M9.5 9.5l4.5 4.5"/></svg>`,
    package:     `<svg ${SVG_ATTR}><path d="M2 4.5l6-3 6 3v7l-6 3-6-3z"/><path d="M2 4.5l6 3 6-3"/><path d="M8 7.5v7"/></svg>`,
    text:        `<svg ${SVG_ATTR}><path d="M3 3h10"/><path d="M8 3v11"/><path d="M5.5 14h5"/></svg>`,
    number:      `<svg ${SVG_ATTR}><path d="M5 1.5l-1 13"/><path d="M11 1.5l-1 13"/><path d="M1.5 5.5h13"/><path d="M1.5 10.5h13"/></svg>`,
    lock:        `<svg ${SVG_ATTR}><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`,
    globe:       `<svg ${SVG_ATTR}><circle cx="8" cy="8" r="6"/><path d="M2 8h12"/><ellipse cx="8" cy="8" rx="3" ry="6"/></svg>`,
    download:    `<svg ${SVG_ATTR}><path d="M8 2v8.5"/><path d="M4.5 8L8 11.5 11.5 8"/><path d="M2.5 13h11"/></svg>`,
    python:      `<svg ${SVG_ATTR}><path d="M6 2h5v3a2 2 0 0 1-2 2H6a2 2 0 0 0-2 2v3h5"/><path d="M10 14H5v-3a2 2 0 0 1 2-2h3a2 2 0 0 0 2-2V4h-5"/><circle cx="7" cy="3.5" r=".6" fill="currentColor" stroke="none"/><circle cx="9" cy="12.5" r=".6" fill="currentColor" stroke="none"/></svg>`,
    tag:         `<svg ${SVG_ATTR}><path d="M1.5 2h6.2l6.8 6.5-5.5 5.5-6.8-6.5V2z"/><circle cx="5" cy="5.5" r="1" fill="currentColor" stroke="none"/></svg>`,
    hashSign:    `<svg ${SVG_ATTR}><path d="M5 1.5l-1 13"/><path d="M11 1.5l-1 13"/><path d="M1.5 5.5h13"/><path d="M1.5 10.5h13"/></svg>`,
    broom:       `<svg ${SVG_ATTR}><path d="M10.5 2L5 7.5"/><path d="M3.5 7L1.5 14h7L6.5 7z"/></svg>`,
    key:         `<svg ${SVG_ATTR}><circle cx="5.5" cy="5.5" r="3"/><path d="M8 8l5.5 5.5"/><path d="M11 11l2 .8"/><path d="M12.5 12.5l.5-1.5"/></svg>`,
    cabinet:     `<svg ${SVG_ATTR}><rect x="2.5" y="1.5" width="11" height="13" rx="1"/><line x1="2.5" y1="8" x2="13.5" y2="8"/><line x1="7" y1="4.5" x2="9" y2="4.5"/><line x1="7" y1="11" x2="9" y2="11"/></svg>`,
    info:        `<svg ${SVG_ATTR}><circle cx="8" cy="8" r="6"/><path d="M8 7.5v4"/><circle cx="8" cy="5" r=".6" fill="currentColor" stroke="none"/></svg>`,
    bug:         `<svg ${SVG_ATTR}><ellipse cx="8" cy="9.5" rx="3.5" ry="4"/><path d="M6.5 5.5a1.5 1.5 0 0 1 3 0"/><path d="M2 7.5l2.5 1"/><path d="M14 7.5l-2.5 1"/><path d="M2.5 12l2.5-.8"/><path d="M13.5 12l-2.5-.8"/></svg>`,
    save:        `<svg ${SVG_ATTR}><path d="M2 2h9l3 3v9H2z"/><path d="M5 2v4h5V2"/><rect x="5" y="9.5" width="6" height="3.5" rx=".5"/></svg>`,
    puzzle:      `<svg ${SVG_ATTR}><path d="M3 2.5h3.5v1.5a1.5 1.5 0 0 0 3 0V2.5H13v3.5h-1.5a1.5 1.5 0 0 0 0 3H13V13H9.5v-1.5a1.5 1.5 0 0 0-3 0V13H3V9.5h1.5a1.5 1.5 0 0 0 0-3H3z"/></svg>`,
    plug:        `<svg ${SVG_ATTR}><path d="M6 1.5v3.5"/><path d="M10 1.5v3.5"/><path d="M4 5h8v3.5a4 4 0 0 1-8 0z"/><path d="M8 12.5v2"/></svg>`,
    user:        `<svg ${SVG_ATTR}><circle cx="8" cy="5" r="2.5"/><path d="M3.5 14.5c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5"/></svg>`,
    brain:       `<svg ${SVG_ATTR}><path d="M8 14V8.5"/><path d="M5 3a3 3 0 0 0-2.5 5c-.3 1.5.5 3.5 2.5 4h6c2-.5 2.8-2.5 2.5-4A3 3 0 0 0 11 3"/><path d="M5.5 6c.8-1 2-1 2.5 0"/><path d="M8 6c.5-1 1.7-1 2.5 0"/></svg>`,
    tree:        `<svg ${SVG_ATTR}><path d="M8 2v12"/><path d="M8 5L4 8"/><path d="M8 5l4 3"/><path d="M8 8.5l-3 2.5"/><path d="M8 8.5l3 2.5"/></svg>`,
    library:     `<svg ${SVG_ATTR}><path d="M2.5 2.5v11"/><path d="M5.5 2.5v11"/><path d="M8.5 2.5v11"/><path d="M11 2.5l1.5 11"/><path d="M1.5 2.5h8"/><path d="M1.5 13.5h8"/></svg>`,
    terminal:    `<svg ${SVG_ATTR}><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4.5 6l2.5 2-2.5 2"/><line x1="9" y1="10" x2="12" y2="10"/></svg>`,
    scroll:      `<svg ${SVG_ATTR}><path d="M12.5 2.5H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7.5"/><path d="M12.5 2.5a2 2 0 0 1 0 4H3"/><path d="M12.5 13.5a2 2 0 0 0 0-4"/></svg>`,
    gear:        `<svg ${SVG_ATTR}><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2m0 9v2M1.5 8h2m9 0h2M3.4 3.4l1.4 1.4m6.4 6.4l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.8l-1.4 1.4"/></svg>`,
    edit:        `<svg ${SVG_ATTR}><path d="M11 2l3 3-8.5 8.5H2.5V10.5z"/><path d="M9.5 3.5l3 3"/></svg>`,
    shellIcon:   `<svg ${SVG_ATTR}><path d="M4 13c0-3 3.5-4 5-7s0-4.5 0-4.5"/><path d="M12 13c0-3-3.5-4-5-7s0-4.5 0-4.5"/></svg>`,
    disc:        `<svg ${SVG_ATTR}><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/></svg>`,
    timer:       `<svg ${SVG_ATTR}><circle cx="8" cy="8.5" r="5.5"/><path d="M8 5.5v3l2 1.5"/><path d="M6.5 1.5h3"/></svg>`,
    cdDisc:      `<svg ${SVG_ATTR}><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="1"/><circle cx="8" cy="8" r="3.5" stroke-dasharray="1.5 2"/></svg>`,
    link:        `<svg ${SVG_ATTR}><path d="M6.5 9.5a3 3 0 0 0 4-.2l2-2a3 3 0 0 0-4.2-4.2l-1 1"/><path d="M9.5 6.5a3 3 0 0 0-4 .2l-2 2a3 3 0 0 0 4.2 4.2l1-1"/></svg>`,
    idCard:      `<svg ${SVG_ATTR}><rect x="1.5" y="3" width="13" height="10" rx="1.5"/><circle cx="6" cy="7.2" r="1.5"/><path d="M3.5 12c0-1.4 1.1-2.3 2.5-2.3s2.5.9 2.5 2.3"/><line x1="10.5" y1="6.5" x2="13" y2="6.5"/><line x1="10.5" y1="9" x2="13" y2="9"/></svg>`,
    camera:      `<svg ${SVG_ATTR}><path d="M1.5 5h2.5l1.5-2h5l1.5 2H14.5v8.5H1.5z"/><circle cx="8" cy="9" r="2.5"/></svg>`,
    desktop:     `<svg ${SVG_ATTR}><rect x="1.5" y="2" width="13" height="9" rx="1.2"/><path d="M5.5 14h5"/><path d="M8 11v3"/></svg>`,
    atom:        `<svg ${SVG_ATTR}><ellipse cx="8" cy="8" rx="6" ry="2.2"/><ellipse cx="8" cy="8" rx="6" ry="2.2" transform="rotate(60 8 8)"/><ellipse cx="8" cy="8" rx="6" ry="2.2" transform="rotate(120 8 8)"/><circle cx="8" cy="8" r=".8" fill="currentColor" stroke="none"/></svg>`,
    chart:       `<svg ${SVG_ATTR}><path d="M2 14V2"/><path d="M2 14h12"/><path d="M5 10v4"/><path d="M8 6.5v7.5"/><path d="M11 3.5v10.5"/></svg>`,
    bell:        `<svg ${SVG_ATTR}><path d="M8 1.5a4 4 0 0 0-4 4v3l-1.5 2.5h11L12 8.5v-3a4 4 0 0 0-4-4z"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0"/></svg>`,
    car:         `<svg ${SVG_ATTR}><path d="M2.5 8.5l1.5-4h8l1.5 4"/><rect x="1.5" y="8.5" width="13" height="4" rx="1"/><circle cx="4.5" cy="12.5" r="1"/><circle cx="11.5" cy="12.5" r="1"/></svg>`,
    shield:      `<svg ${SVG_ATTR}><path d="M8 1.5L2 4v4c0 3.8 2.5 6 6 7.5 3.5-1.5 6-3.7 6-7.5V4z"/></svg>`,
    thread:      `<svg ${SVG_ATTR}><path d="M4 2c0 3 8 3 8 6s-8 3-8 6"/></svg>`,
    mapIcon:     `<svg ${SVG_ATTR}><path d="M1.5 3.5l4.5-2v11l-4.5 2z"/><path d="M6 1.5l4.5 2v11l-4.5-2z"/><path d="M10.5 3.5l4-2v11l-4 2z"/></svg>`,
    crash:       `<svg ${SVG_ATTR}><path d="M8 2l1.5 3.5h4L10 8.5l1.2 4.5L8 10.5 4.8 13l1.2-4.5L2.5 5.5h4z"/></svg>`,
    clip:        `<svg ${SVG_ATTR}><path d="M10 4.5L5 9.5a2 2 0 0 0 2.8 2.8l6-6a3 3 0 0 0-4.3-4.3l-6 6a2 2 0 0 0 2.8 2.8"/></svg>`,
    pool:        `<svg ${SVG_ATTR}><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="1.5" y1="8" x2="14.5" y2="8"/><line x1="5.5" y1="2.5" x2="5.5" y2="13.5"/><line x1="10.5" y1="2.5" x2="10.5" y2="13.5"/></svg>`,
    refresh:     `<svg ${SVG_ATTR}><path d="M2.5 8a5.5 5.5 0 0 1 9.5-3.8"/><path d="M13.5 8a5.5 5.5 0 0 1-9.5 3.8"/><path d="M12 1.5v3h-3"/><path d="M4 14.5v-3h3"/></svg>`,
    warning:     `<svg ${SVG_ATTR}><path d="M8 2L1.5 13.5h13z"/><path d="M8 6.5v3.5"/><circle cx="8" cy="11.5" r=".5" fill="currentColor" stroke="none"/></svg>`,
    keyboard:    `<svg ${SVG_ATTR}><rect x="1" y="4" width="14" height="8.5" rx="1.5"/><line x1="4" y1="6.5" x2="5" y2="6.5"/><line x1="7.5" y1="6.5" x2="8.5" y2="6.5"/><line x1="11" y1="6.5" x2="12" y2="6.5"/><line x1="5" y1="9.5" x2="11" y2="9.5"/></svg>`,
    lockSecure:  `<svg ${SVG_ATTR}><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/><circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none"/></svg>`,
    microscope:  `<svg ${SVG_ATTR}><circle cx="8" cy="4.5" r="2.5"/><path d="M8 7v3.5"/><path d="M5 10.5h6"/><path d="M4.5 14h7"/><path d="M8 12.5v1.5"/><path d="M6 12.5a5 5 0 0 0 5-5"/></svg>`,
    megaphone:   `<svg ${SVG_ATTR}><path d="M12 3L4.5 6.5v3L12 13V3z"/><path d="M4.5 6.5H2.5v3h2"/><path d="M12 5.5h1.5v5H12"/></svg>`,
    quiet:       `<svg ${SVG_ATTR}><path d="M2.5 6h2.5l4-3.5v11l-4-3.5h-2.5z"/><path d="M12 5.5L9.5 8l2.5 2.5"/></svg>`,
    star:        `<svg ${SVG_ATTR}><path d="M8 2l1.8 4h4.2l-3.2 2.8 1.2 4.7L8 11l-4 2.5 1.2-4.7L2 6h4.2z"/></svg>`,
    clock:       `<svg ${SVG_ATTR}><circle cx="8" cy="8" r="6"/><path d="M8 4.5v3.5l2.2 1.5"/></svg>`,
    windowsIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" stroke="none"><path d="M1.5 4.8l5-.7v4.7h-5zm5.8-.8L14 2.8v5.8H7.3zM14 9.4v5.8l-6.7-1v-4.8zM6.5 14l-5-.7V9.4h5z"/></svg>`,
    linuxIcon:   `<svg ${SVG_ATTR}><ellipse cx="8" cy="9.5" rx="3.8" ry="4.5"/><circle cx="6.5" cy="7.5" r=".6" fill="currentColor" stroke="none"/><circle cx="9.5" cy="7.5" r=".6" fill="currentColor" stroke="none"/><path d="M6.3 10.5c.6.6 3 .6 3.5 0"/><path d="M4.2 13c-1.8.8-2.5 1-2.5 1.8h12.6c0-.8-.7-1-2.5-1.8"/></svg>`,
    appleIcon:   `<svg ${SVG_ATTR}><path d="M10.5 3.5c-1.5-1-4.2-.3-4.8 1.5-2 .5-3 2.5-2.5 5s1.8 4.5 3.2 5c.7.2 1.2 0 1.6 0s.9.2 1.6 0c1.4-.5 2.8-2.5 3.2-5s-.8-4.5-2.3-5.5z"/><path d="M9.5 1.5c-1.5.5-2 1.8-1.5 2.8"/></svg>`,
    rocket:      `<svg ${SVG_ATTR}><path d="M8 1.5C6.5 4 6 8 7 11h2c1-3 .5-7-1-9.5z"/><path d="M5.5 10l-2.5 3.5"/><path d="M10.5 10l2.5 3.5"/><circle cx="8" cy="7" r="1.2"/><path d="M7 11c-.5 1-.5 2.5 1 3.5 1.5-1 1.5-2.5 1-3.5"/></svg>`,
    building:    `<svg ${SVG_ATTR}><rect x="3" y="1.5" width="10" height="13"/><line x1="3" y1="14.5" x2="13" y2="14.5"/><rect x="5.5" y="4" width="1.5" height="1.5" rx=".3"/><rect x="9" y="4" width="1.5" height="1.5" rx=".3"/><rect x="5.5" y="7.5" width="1.5" height="1.5" rx=".3"/><rect x="9" y="7.5" width="1.5" height="1.5" rx=".3"/><rect x="7" y="11" width="2" height="3.5"/></svg>`,
    defaultIcon: `<svg ${SVG_ATTR}><path d="M5 6l3 2.5L11 6"/></svg>`,
};

/** 根据图标键名返回 SVG HTML */
function getIconSvg(key?: string): string {
    if (!key) return ICONS.defaultIcon;
    return ICONS[key] ?? ICONS.defaultIcon;
}

// ─── 模糊匹配引擎 ───────────────────────────────────────────
function fuzzyMatch(pattern: string, text: string): number {
    if (!pattern) return 0;
    const p = pattern.toLowerCase();
    const t = text.toLowerCase();

    // 完全前缀匹配 → 高分
    if (t.startsWith(p)) return 1000 + (p.length / t.length) * 500;
    // 包含匹配
    if (t.includes(p)) return 500 + (p.length / t.length) * 200;

    // 子序列匹配（连续字符加分）
    let pi = 0, score = 0, consecutive = 0, lastIdx = -2;
    for (let ti = 0; ti < t.length && pi < p.length; ti++) {
        if (t[ti] === p[pi]) {
            pi++;
            consecutive = (ti === lastIdx + 1) ? consecutive + 1 : 1;
            score += consecutive * 10;
            // 单词边界加分（在 . - _ 空格后）
            if (ti === 0 || /[.\-_ ]/.test(t[ti - 1])) score += 15;
            lastIdx = ti;
        }
    }
    return pi === p.length ? score : 0;
}

function fuzzyFilter(
    pattern: string,
    items: Suggestion[],
    frequencyMap?: Map<string, number>
): Suggestion[] {
    if (!pattern) return items.slice(0, 15);
    const scored = items.map(item => {
        const labelScore = fuzzyMatch(pattern, item.label);
        const descScore = item.description ? fuzzyMatch(pattern, item.description) * 0.3 : 0;
        const freqBonus = (frequencyMap?.get(item.value) ?? 0) * 5;
        return { item, score: labelScore + descScore + freqBonus };
    }).filter(s => s.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 15).map(s => ({ ...s.item, score: s.score }));
}

// ─── 命令库 ─────────────────────────────────────────────────

// Shell 通用命令
const shellCommands: Suggestion[] = [
    { label: 'cd', value: 'cd', description: '切换目录', type: 'command', icon: 'folder' },
    { label: 'ls', value: 'ls', description: '列出文件', type: 'command', icon: 'file' },
    { label: 'dir', value: 'dir', description: '列出文件（Windows）', type: 'command', icon: 'file' },
    { label: 'cat', value: 'cat', description: '显示文件内容', type: 'command', icon: 'fileText' },
    { label: 'type', value: 'type', description: '显示文件内容（Windows）', type: 'command', icon: 'fileText' },
    { label: 'pwd', value: 'pwd', description: '显示当前目录', type: 'command', icon: 'pin' },
    { label: 'echo', value: 'echo', description: '输出文本', type: 'command', icon: 'chat' },
    { label: 'mkdir', value: 'mkdir', description: '创建目录', type: 'command', icon: 'folder' },
    { label: 'rm', value: 'rm', description: '删除文件', type: 'command', icon: 'trash' },
    { label: 'cp', value: 'cp', description: '复制文件', type: 'command', icon: 'clipboard' },
    { label: 'mv', value: 'mv', description: '移动/重命名文件', type: 'command', icon: 'arrowRight' },
    { label: 'find', value: 'find', description: '查找文件', type: 'command', icon: 'search' },
    { label: 'grep', value: 'grep', description: '文本搜索', type: 'command', icon: 'search' },
    { label: 'head', value: 'head', description: '显示文件开头', type: 'command', icon: 'fileText' },
    { label: 'tail', value: 'tail', description: '显示文件末尾', type: 'command', icon: 'fileText' },
    { label: 'wc', value: 'wc', description: '统计行/词/字节', type: 'command', icon: 'number' },
    { label: 'chmod', value: 'chmod', description: '修改权限', type: 'command', icon: 'lock' },
    { label: 'curl', value: 'curl', description: 'HTTP 请求', type: 'command', icon: 'globe' },
    { label: 'wget', value: 'wget', description: '下载文件', type: 'command', icon: 'download' },
    { label: 'python', value: 'python', description: '运行 Python', type: 'command', icon: 'python' },
    { label: 'python3', value: 'python3', description: '运行 Python3', type: 'command', icon: 'python' },
    { label: 'pip', value: 'pip', description: 'Python 包管理', type: 'command', icon: 'package' },
    { label: 'git', value: 'git', description: 'Git 版本控制', type: 'command', icon: 'folderOpen' },
    { label: 'strings', value: 'strings', description: '提取可打印字符串', type: 'command', icon: 'text' },
    { label: 'xxd', value: 'xxd', description: '十六进制转储', type: 'command', icon: 'number' },
    { label: 'hexdump', value: 'hexdump', description: '十六进制转储', type: 'command', icon: 'number' },
    { label: 'file', value: 'file', description: '识别文件类型', type: 'command', icon: 'tag' },
    { label: 'md5sum', value: 'md5sum', description: '计算 MD5', type: 'command', icon: 'hashSign' },
    { label: 'sha256sum', value: 'sha256sum', description: '计算 SHA256', type: 'command', icon: 'hashSign' },
    { label: 'clear', value: 'clear', description: '清屏', type: 'command', icon: 'broom' },
];

// Volatility 2 命令（扩展版）
const vol2Commands: Suggestion[] = [
    { label: 'pslist', value: 'pslist', description: '列出运行的进程', type: 'command', icon: 'clipboard' },
    { label: 'psscan', value: 'psscan', description: '扫描进程对象', type: 'command', icon: 'search' },
    { label: 'pstree', value: 'pstree', description: '显示进程树', type: 'command', icon: 'tree' },
    { label: 'dlllist', value: 'dlllist', description: '列出加载的 DLL', type: 'command', icon: 'library' },
    { label: 'cmdline', value: 'cmdline', description: '显示进程命令行', type: 'command', icon: 'terminal' },
    { label: 'consoles', value: 'consoles', description: '提取命令历史', type: 'command', icon: 'scroll' },
    { label: 'filescan', value: 'filescan', description: '扫描文件对象', type: 'command', icon: 'folder' },
    { label: 'hivelist', value: 'hivelist', description: '列出注册表配置单元', type: 'command', icon: 'cabinet' },
    { label: 'hashdump', value: 'hashdump', description: '转储密码哈希', type: 'command', icon: 'key' },
    { label: 'imageinfo', value: 'imageinfo', description: '识别镜像信息', type: 'command', icon: 'info' },
    { label: 'kdbgscan', value: 'kdbgscan', description: '扫描 KDBG 结构', type: 'command', icon: 'search' },
    { label: 'malfind', value: 'malfind', description: '查找注入代码', type: 'command', icon: 'bug' },
    { label: 'memdump', value: 'memdump', description: '转储进程内存', type: 'command', icon: 'save' },
    { label: 'modules', value: 'modules', description: '列出加载的内核模块', type: 'command', icon: 'puzzle' },
    { label: 'modscan', value: 'modscan', description: '扫描内核模块', type: 'command', icon: 'search' },
    { label: 'netscan', value: 'netscan', description: '扫描网络连接', type: 'command', icon: 'globe' },
    { label: 'connscan', value: 'connscan', description: '扫描连接对象', type: 'command', icon: 'globe' },
    { label: 'connections', value: 'connections', description: '打印连接列表', type: 'command', icon: 'globe' },
    { label: 'sockets', value: 'sockets', description: '打印 Socket 列表', type: 'command', icon: 'plug' },
    { label: 'sockscan', value: 'sockscan', description: '扫描 Socket 对象', type: 'command', icon: 'plug' },
    { label: 'printkey', value: 'printkey', description: '打印注册表键', type: 'command', icon: 'key' },
    { label: 'hivedump', value: 'hivedump', description: '递归列出注册表项', type: 'command', icon: 'cabinet' },
    { label: 'hashdump', value: 'hashdump', description: '转储密码哈希', type: 'command', icon: 'key' },
    { label: 'dumpregistry', value: 'dumpregistry', description: '转储注册表 Hive 文件', type: 'command', icon: 'save' },
    { label: 'amcache', value: 'amcache', description: '解析 Amcache 程序执行记录', type: 'command', icon: 'clipboard' },
    { label: 'auditpol', value: 'auditpol', description: '解析审计策略', type: 'command', icon: 'chart' },
    { label: 'getservicesids', value: 'getservicesids', description: '获取服务 SID', type: 'command', icon: 'idCard' },
    { label: 'lsadump', value: 'lsadump', description: '转储 LSA 密钥', type: 'command', icon: 'key' },
    { label: 'cachedump', value: 'cachedump', description: '转储缓存的域凭证', type: 'command', icon: 'key' },
    { label: 'svcscan', value: 'svcscan', description: '扫描服务', type: 'command', icon: 'gear' },
    { label: 'userassist', value: 'userassist', description: '打印 UserAssist 键', type: 'command', icon: 'user' },
    { label: 'vadinfo', value: 'vadinfo', description: '转储 VAD 信息', type: 'command', icon: 'brain' },
    { label: 'vaddump', value: 'vaddump', description: '转储 VAD 区段', type: 'command', icon: 'save' },
    { label: 'vadtree', value: 'vadtree', description: '显示 VAD 树', type: 'command', icon: 'tree' },
    { label: 'shellbags', value: 'shellbags', description: '解析 Shellbags', type: 'command', icon: 'shellIcon' },
    { label: 'shimcache', value: 'shimcache', description: '解析 Shimcache', type: 'command', icon: 'disc' },
    { label: 'timeliner', value: 'timeliner', description: '创建时间线', type: 'command', icon: 'timer' },
    { label: 'mftparser', value: 'mftparser', description: '扫描 MFT 条目', type: 'command', icon: 'cdDisc' },
    { label: 'dumpfiles', value: 'dumpfiles', description: '提取内存映射文件', type: 'command', icon: 'folderOpen' },
    { label: 'procdump', value: 'procdump', description: '转储进程 EXE', type: 'command', icon: 'save' },
    { label: 'dlldump', value: 'dlldump', description: '转储 DLL', type: 'command', icon: 'save' },
    { label: 'handles', value: 'handles', description: '列出句柄', type: 'command', icon: 'link' },
    { label: 'getsids', value: 'getsids', description: '打印 SID', type: 'command', icon: 'idCard' },
    { label: 'envars', value: 'envars', description: '显示环境变量', type: 'command', icon: 'edit' },
    { label: 'cmdscan', value: 'cmdscan', description: '扫描命令历史', type: 'command', icon: 'scroll' },
    { label: 'clipboard', value: 'clipboard', description: '提取剪贴板内容', type: 'command', icon: 'clipboard' },
    { label: 'screenshot', value: 'screenshot', description: '截取窗口截图', type: 'command', icon: 'camera' },
    { label: 'iehistory', value: 'iehistory', description: 'IE 浏览历史', type: 'command', icon: 'globe' },
    { label: 'deskscan', value: 'deskscan', description: '扫描桌面堆', type: 'command', icon: 'desktop' },
    { label: 'atomscan', value: 'atomscan', description: '扫描原子表', type: 'command', icon: 'atom' },
    { label: 'ssdt', value: 'ssdt', description: '显示 SSDT', type: 'command', icon: 'chart' },
    { label: 'callbacks', value: 'callbacks', description: '打印回调函数', type: 'command', icon: 'bell' },
    { label: 'driverscan', value: 'driverscan', description: '扫描驱动对象', type: 'command', icon: 'car' },
    { label: 'devicetree', value: 'devicetree', description: '显示设备树', type: 'command', icon: 'tree' },
    { label: 'mutantscan', value: 'mutantscan', description: '扫描互斥对象', type: 'command', icon: 'lock' },
];

// Volatility 3 Windows 插件（按功能分组）
const vol3WindowsPlugins: Suggestion[] = [
    // ── 进程分析 ──
    { label: 'windows.info.Info', value: 'windows.info.Info', description: '显示系统信息', type: 'command', icon: 'info', group: '系统信息' },
    { label: 'windows.pslist.PsList', value: 'windows.pslist.PsList', description: '列出进程', type: 'command', icon: 'clipboard', group: '进程分析' },
    { label: 'windows.psscan.PsScan', value: 'windows.psscan.PsScan', description: '扫描进程（含隐藏）', type: 'command', icon: 'search', group: '进程分析' },
    { label: 'windows.pstree.PsTree', value: 'windows.pstree.PsTree', description: '进程树', type: 'command', icon: 'tree', group: '进程分析' },
    { label: 'windows.cmdline.CmdLine', value: 'windows.cmdline.CmdLine', description: '命令行参数', type: 'command', icon: 'terminal', group: '进程分析' },
    { label: 'windows.envars.Envars', value: 'windows.envars.Envars', description: '环境变量', type: 'command', icon: 'edit', group: '进程分析' },
    { label: 'windows.getsids.GetSIDs', value: 'windows.getsids.GetSIDs', description: '获取 SID', type: 'command', icon: 'idCard', group: '进程分析' },
    { label: 'windows.privileges.Privs', value: 'windows.privileges.Privs', description: '进程权限', type: 'command', icon: 'shield', group: '进程分析' },
    { label: 'windows.dlllist.DllList', value: 'windows.dlllist.DllList', description: '列出 DLL', type: 'command', icon: 'library', group: '进程分析' },
    { label: 'windows.handles.Handles', value: 'windows.handles.Handles', description: '列出句柄', type: 'command', icon: 'link', group: '进程分析' },
    { label: 'windows.threads.Threads', value: 'windows.threads.Threads', description: '列出线程', type: 'command', icon: 'thread', group: '进程分析' },
    // ── 内存转储 ──
    { label: 'windows.procdump.ProcDump', value: 'windows.procdump.ProcDump', description: '转储进程 EXE', type: 'command', icon: 'save', group: '内存转储' },
    { label: 'windows.memmap.Memmap', value: 'windows.memmap.Memmap', description: '内存映射', type: 'command', icon: 'mapIcon', group: '内存转储' },
    { label: 'windows.vadinfo.VadInfo', value: 'windows.vadinfo.VadInfo', description: 'VAD 信息', type: 'command', icon: 'brain', group: '内存转储' },
    { label: 'windows.vadyarascan.VadYaraScan', value: 'windows.vadyarascan.VadYaraScan', description: 'VAD YARA 扫描', type: 'command', icon: 'search', group: '内存转储' },
    { label: 'windows.virtmap.VirtMap', value: 'windows.virtmap.VirtMap', description: '虚拟内存映射', type: 'command', icon: 'mapIcon', group: '内存转储' },
    // ── 文件系统 ──
    { label: 'windows.filescan.FileScan', value: 'windows.filescan.FileScan', description: '扫描文件', type: 'command', icon: 'folder', group: '文件系统' },
    { label: 'windows.dumpfiles.DumpFiles', value: 'windows.dumpfiles.DumpFiles', description: '提取文件', type: 'command', icon: 'folderOpen', group: '文件系统' },
    { label: 'windows.mftscan.MFTScan', value: 'windows.mftscan.MFTScan', description: '扫描 MFT 条目', type: 'command', icon: 'cdDisc', group: '文件系统' },
    { label: 'windows.symlinkscan.SymlinkScan', value: 'windows.symlinkscan.SymlinkScan', description: '符号链接', type: 'command', icon: 'link', group: '文件系统' },
    // ── 网络 ──
    { label: 'windows.netscan.NetScan', value: 'windows.netscan.NetScan', description: '网络连接', type: 'command', icon: 'globe', group: '网络' },
    { label: 'windows.netstat.NetStat', value: 'windows.netstat.NetStat', description: '网络状态', type: 'command', icon: 'globe', group: '网络' },
    // ── 恶意代码 ──
    { label: 'windows.malfind.Malfind', value: 'windows.malfind.Malfind', description: '恶意代码注入', type: 'command', icon: 'bug', group: '恶意代码' },
    { label: 'windows.skeleton_key_check.Skeleton_Key_Check', value: 'windows.skeleton_key_check.Skeleton_Key_Check', description: '万能钥匙检测', type: 'command', icon: 'lockSecure', group: '恶意代码' },
    // ── 注册表 ──
    { label: 'windows.registry.hivelist.HiveList', value: 'windows.registry.hivelist.HiveList', description: '注册表 Hives', type: 'command', icon: 'cabinet', group: '注册表' },
    { label: 'windows.registry.printkey.PrintKey', value: 'windows.registry.printkey.PrintKey', description: '注册表键值', type: 'command', icon: 'key', group: '注册表' },
    { label: 'windows.registry.userassist.UserAssist', value: 'windows.registry.userassist.UserAssist', description: 'UserAssist 程序执行记录', type: 'command', icon: 'user', group: '注册表' },
    { label: 'windows.registry.certificates.Certificates', value: 'windows.registry.certificates.Certificates', description: '证书信息', type: 'command', icon: 'scroll', group: '注册表' },
    { label: 'windows.registry.getcellroutine.GetCellRoutine', value: 'windows.registry.getcellroutine.GetCellRoutine', description: '检测 Hive Hook', type: 'command', icon: 'bug', group: '注册表' },
    { label: 'windows.shimcachemem.ShimcacheMem', value: 'windows.shimcachemem.ShimcacheMem', description: 'Shimcache 程序执行痕迹', type: 'command', icon: 'disc', group: '注册表' },
    { label: 'windows.amcache.Amcache', value: 'windows.amcache.Amcache', description: 'Amcache 程序执行记录', type: 'command', icon: 'clipboard', group: '注册表' },
    // ── 凭证 ──
    { label: 'windows.hashdump.HashDump', value: 'windows.hashdump.HashDump', description: '密码哈希', type: 'command', icon: 'key', group: '凭证' },
    { label: 'windows.cachedump.CacheDump', value: 'windows.cachedump.CacheDump', description: '缓存凭证', type: 'command', icon: 'key', group: '凭证' },
    { label: 'windows.lsadump.LsaDump', value: 'windows.lsadump.LsaDump', description: 'LSA 密钥', type: 'command', icon: 'key', group: '凭证' },
    // ── 服务 & 驱动 ──
    { label: 'windows.svcscan.SvcScan', value: 'windows.svcscan.SvcScan', description: '扫描服务', type: 'command', icon: 'gear', group: '服务 & 驱动' },
    { label: 'windows.getservicesids.GetServiceSIDs', value: 'windows.getservicesids.GetServiceSIDs', description: '服务 SID', type: 'command', icon: 'idCard', group: '服务 & 驱动' },
    { label: 'windows.driverscan.DriverScan', value: 'windows.driverscan.DriverScan', description: '驱动对象', type: 'command', icon: 'car', group: '服务 & 驱动' },
    { label: 'windows.driverirp.DriverIrp', value: 'windows.driverirp.DriverIrp', description: '驱动 IRP', type: 'command', icon: 'car', group: '服务 & 驱动' },
    // ── 内核 ──
    { label: 'windows.modscan.ModScan', value: 'windows.modscan.ModScan', description: '内核模块', type: 'command', icon: 'puzzle', group: '内核' },
    { label: 'windows.modules.Modules', value: 'windows.modules.Modules', description: '加载的模块', type: 'command', icon: 'puzzle', group: '内核' },
    { label: 'windows.ssdt.SSDT', value: 'windows.ssdt.SSDT', description: 'SSDT', type: 'command', icon: 'chart', group: '内核' },
    { label: 'windows.callbacks.Callbacks', value: 'windows.callbacks.Callbacks', description: '内核回调', type: 'command', icon: 'bell', group: '内核' },
    { label: 'windows.bigpools.BigPools', value: 'windows.bigpools.BigPools', description: '大内存池', type: 'command', icon: 'pool', group: '内核' },
    { label: 'windows.mutantscan.MutantScan', value: 'windows.mutantscan.MutantScan', description: '互斥对象', type: 'command', icon: 'lock', group: '内核' },
    { label: 'windows.devicetree.DeviceTree', value: 'windows.devicetree.DeviceTree', description: '设备树', type: 'command', icon: 'tree', group: '内核' },
    // ── 杂项 ──
    { label: 'windows.crashinfo.Crashinfo', value: 'windows.crashinfo.Crashinfo', description: '崩溃转储信息', type: 'command', icon: 'crash', group: '杂项' },
    { label: 'windows.verinfo.VerInfo', value: 'windows.verinfo.VerInfo', description: 'PE 版本信息', type: 'command', icon: 'clip', group: '杂项' },
    { label: 'windows.joblinks.JobLinks', value: 'windows.joblinks.JobLinks', description: '作业对象', type: 'command', icon: 'link', group: '杂项' },
    { label: 'windows.sessions.Sessions', value: 'windows.sessions.Sessions', description: '用户会话', type: 'command', icon: 'user', group: '杂项' },
];

// Volatility 3 Linux 插件（按功能分组）
const vol3LinuxPlugins: Suggestion[] = [
    // ── 进程 ──
    { label: 'linux.pslist.PsList', value: 'linux.pslist.PsList', description: '列出进程', type: 'command', icon: 'clipboard', group: '进程' },
    { label: 'linux.pstree.PsTree', value: 'linux.pstree.PsTree', description: '进程树', type: 'command', icon: 'tree', group: '进程' },
    { label: 'linux.bash.Bash', value: 'linux.bash.Bash', description: 'Bash 历史', type: 'command', icon: 'scroll', group: '进程' },
    { label: 'linux.envars.Envars', value: 'linux.envars.Envars', description: '环境变量', type: 'command', icon: 'edit', group: '进程' },
    { label: 'linux.elfs.Elfs', value: 'linux.elfs.Elfs', description: '扫描 ELF 文件', type: 'command', icon: 'file', group: '进程' },
    { label: 'linux.proc.Maps', value: 'linux.proc.Maps', description: '进程内存映射', type: 'command', icon: 'mapIcon', group: '进程' },
    { label: 'linux.psaux.PsAux', value: 'linux.psaux.PsAux', description: '列出进程（含参数）', type: 'command', icon: 'clipboard', group: '进程' },
    // ── 文件 & 挂载 ──
    { label: 'linux.lsof.Lsof', value: 'linux.lsof.Lsof', description: '打开的文件', type: 'command', icon: 'folderOpen', group: '文件 & 挂载' },
    { label: 'linux.mountinfo.MountInfo', value: 'linux.mountinfo.MountInfo', description: '挂载信息', type: 'command', icon: 'cdDisc', group: '文件 & 挂载' },
    // ── 网络 ──
    { label: 'linux.sockstat.Sockstat', value: 'linux.sockstat.Sockstat', description: 'Socket 状态', type: 'command', icon: 'plug', group: '网络' },
    { label: 'linux.check_afinfo.Check_afinfo', value: 'linux.check_afinfo.Check_afinfo', description: '检查网络协议', type: 'command', icon: 'globe', group: '网络' },
    // ── 内核 ──
    { label: 'linux.lsmod.Lsmod', value: 'linux.lsmod.Lsmod', description: '内核模块列表', type: 'command', icon: 'puzzle', group: '内核' },
    { label: 'linux.check_modules.Check_modules', value: 'linux.check_modules.Check_modules', description: '检查隐藏模块', type: 'command', icon: 'puzzle', group: '内核' },
    { label: 'linux.check_syscall.Check_syscall', value: 'linux.check_syscall.Check_syscall', description: '检查系统调用', type: 'command', icon: 'chart', group: '内核' },
    { label: 'linux.check_idt.Check_idt', value: 'linux.check_idt.Check_idt', description: '检查 IDT', type: 'command', icon: 'chart', group: '内核' },
    { label: 'linux.check_creds.Check_creds', value: 'linux.check_creds.Check_creds', description: '检查凭证', type: 'command', icon: 'key', group: '内核' },
    { label: 'linux.keyboard_notifiers.Keyboard_notifiers', value: 'linux.keyboard_notifiers.Keyboard_notifiers', description: '键盘通知', type: 'command', icon: 'keyboard', group: '内核' },
    { label: 'linux.tty_check.tty_check', value: 'linux.tty_check.tty_check', description: 'TTY 检查', type: 'command', icon: 'desktop', group: '内核' },
    // ── 恶意代码 & YARA ──
    { label: 'linux.malfind.Malfind', value: 'linux.malfind.Malfind', description: '恶意代码检测', type: 'command', icon: 'bug', group: '恶意代码' },
    { label: 'linux.vmayarascan.VmaYaraScan', value: 'linux.vmayarascan.VmaYaraScan', description: 'YARA 扫描', type: 'command', icon: 'search', group: '恶意代码' },
    // ── 杂项 ──
    { label: 'linux.iomem.IOMem', value: 'linux.iomem.IOMem', description: 'IO 内存映射', type: 'command', icon: 'mapIcon', group: '杂项' },
    { label: 'linux.kmsg.Kmsg', value: 'linux.kmsg.Kmsg', description: '内核消息缓冲区', type: 'command', icon: 'scroll', group: '杂项' },
];

// Volatility 3 Mac 插件
const vol3MacPlugins: Suggestion[] = [
    { label: 'mac.pslist.PsList', value: 'mac.pslist.PsList', description: '列出进程', type: 'command', icon: 'clipboard', group: '进程' },
    { label: 'mac.pstree.PsTree', value: 'mac.pstree.PsTree', description: '进程树', type: 'command', icon: 'tree', group: '进程' },
    { label: 'mac.bash.Bash', value: 'mac.bash.Bash', description: 'Bash 历史', type: 'command', icon: 'scroll', group: '进程' },
    { label: 'mac.lsmod.Lsmod', value: 'mac.lsmod.Lsmod', description: '内核模块', type: 'command', icon: 'puzzle', group: '内核' },
    { label: 'mac.lsof.Lsof', value: 'mac.lsof.Lsof', description: '打开的文件', type: 'command', icon: 'folderOpen', group: '文件' },
    { label: 'mac.netstat.Netstat', value: 'mac.netstat.Netstat', description: '网络状态', type: 'command', icon: 'globe', group: '网络' },
    { label: 'mac.malfind.Malfind', value: 'mac.malfind.Malfind', description: '恶意代码检测', type: 'command', icon: 'bug', group: '恶意代码' },
    { label: 'mac.check_syscall.Check_syscall', value: 'mac.check_syscall.Check_syscall', description: '检查系统调用', type: 'command', icon: 'chart', group: '内核' },
    { label: 'mac.mount.Mount', value: 'mac.mount.Mount', description: '挂载信息', type: 'command', icon: 'cdDisc', group: '文件' },
    { label: 'mac.ifconfig.Ifconfig', value: 'mac.ifconfig.Ifconfig', description: '网络接口', type: 'command', icon: 'globe', group: '网络' },
    { label: 'mac.kauth_listeners.Kauth_listeners', value: 'mac.kauth_listeners.Kauth_listeners', description: 'Kauth 监听', type: 'command', icon: 'bell', group: '内核' },
    { label: 'mac.socket_filters.Socket_filters', value: 'mac.socket_filters.Socket_filters', description: 'Socket 过滤', type: 'command', icon: 'plug', group: '网络' },
];

// Vol3 命名空间快捷建议（输入 vol3 后显示）
const vol3Namespaces: Suggestion[] = [
    { label: 'windows.', value: 'windows.', description: 'Windows 分析插件', type: 'tool', icon: 'windowsIcon' },
    { label: 'linux.', value: 'linux.', description: 'Linux 分析插件', type: 'tool', icon: 'linuxIcon' },
    { label: 'mac.', value: 'mac.', description: 'macOS 分析插件', type: 'tool', icon: 'appleIcon' },
    { label: 'banners.Banners', value: 'banners.Banners', description: '扫描 Linux Banner', type: 'command', icon: 'tag' },
    { label: 'configwriter.ConfigWriter', value: 'configwriter.ConfigWriter', description: '输出运行配置', type: 'command', icon: 'edit' },
    { label: 'isfinfo.IsfInfo', value: 'isfinfo.IsfInfo', description: 'ISF 信息', type: 'command', icon: 'info' },
    { label: 'layerwriter.LayerWriter', value: 'layerwriter.LayerWriter', description: '输出内存层', type: 'command', icon: 'save' },
    { label: 'timeliner.Timeliner', value: 'timeliner.Timeliner', description: '创建时间线', type: 'command', icon: 'timer' },
    { label: 'yarascan.YaraScan', value: 'yarascan.YaraScan', description: 'YARA 规则扫描', type: 'command', icon: 'search' },
];

// Vol3 每个插件的专属参数
const vol3PluginFlags: Map<string, Suggestion[]> = new Map([
    ['windows.pslist.PsList', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--dump', value: '--dump', description: '转储进程', type: 'flag', icon: 'save' },
        { label: '--physical', value: '--physical', description: '显示物理偏移', type: 'flag', icon: 'pin' },
    ]],
    ['windows.psscan.PsScan', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--dump', value: '--dump', description: '转储进程', type: 'flag', icon: 'save' },
    ]],
    ['windows.pstree.PsTree', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
    ]],
    ['windows.procdump.ProcDump', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--dump', value: '--dump', description: '启用转储', type: 'flag', icon: 'save' },
    ]],
    ['windows.dlllist.DllList', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--dump', value: '--dump', description: '转储 DLL', type: 'flag', icon: 'save' },
    ]],
    ['windows.cmdline.CmdLine', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
    ]],
    ['windows.handles.Handles', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
    ]],
    ['windows.dumpfiles.DumpFiles', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--virtaddr', value: '--virtaddr ', description: '虚拟地址', type: 'flag', icon: 'pin' },
        { label: '--physaddr', value: '--physaddr ', description: '物理地址', type: 'flag', icon: 'pin' },
    ]],
    ['windows.malfind.Malfind', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--dump', value: '--dump', description: '转储注入区域', type: 'flag', icon: 'save' },
    ]],
    ['windows.netscan.NetScan', [
        { label: '--include-corrupt', value: '--include-corrupt', description: '包含损坏数据', type: 'flag', icon: 'warning' },
    ]],
    ['windows.registry.printkey.PrintKey', [
        { label: '--key', value: '--key ', description: '注册表键路径', type: 'flag', icon: 'key' },
        { label: '--recurse', value: '--recurse', description: '递归列出子键', type: 'flag', icon: 'refresh' },
        { label: '--offset', value: '--offset ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
    ]],
    ['windows.registry.hivelist.HiveList', [
        { label: '--filter', value: '--filter ', description: '过滤 Hive 名称', type: 'flag', icon: 'search' },
        { label: '--dump', value: '--dump', description: '转储 Hive', type: 'flag', icon: 'save' },
    ]],
    ['windows.registry.userassist.UserAssist', [
        { label: '--offset', value: '--offset ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
    ]],
    ['windows.registry.certificates.Certificates', [
        { label: '--dump', value: '--dump', description: '转储证书', type: 'flag', icon: 'save' },
    ]],
    ['windows.registry.getcellroutine.GetCellRoutine', []],
    ['windows.shimcachemem.ShimcacheMem', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
    ]],
    ['windows.amcache.Amcache', []],
    ['windows.filescan.FileScan', []],
    ['windows.envars.Envars', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
    ]],
    ['windows.svcscan.SvcScan', []],
    ['windows.vadinfo.VadInfo', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--dump', value: '--dump', description: '转储 VAD 区域', type: 'flag', icon: 'save' },
    ]],
    ['windows.vadyarascan.VadYaraScan', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--yara-file', value: '--yara-file ', description: 'YARA 规则文件', type: 'flag', icon: 'file' },
        { label: '--yara-rules', value: '--yara-rules ', description: 'YARA 规则字符串', type: 'flag', icon: 'edit' },
    ]],
    ['yarascan.YaraScan', [
        { label: '--yara-file', value: '--yara-file ', description: 'YARA 规则文件', type: 'flag', icon: 'file' },
        { label: '--yara-rules', value: '--yara-rules ', description: 'YARA 规则字符串', type: 'flag', icon: 'edit' },
    ]],
    ['timeliner.Timeliner', [
        { label: '--record-config', value: '--record-config', description: '记录配置', type: 'flag', icon: 'edit' },
    ]],
    ['linux.pslist.PsList', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
        { label: '--dump', value: '--dump', description: '转储进程', type: 'flag', icon: 'save' },
    ]],
    ['linux.bash.Bash', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
    ]],
    ['linux.lsof.Lsof', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
    ]],
    ['linux.malfind.Malfind', [
        { label: '--pid', value: '--pid ', description: '按 PID 过滤', type: 'flag', icon: 'number' },
    ]],
]);

// MemProcFS 命令
const memprocfsCommands: Suggestion[] = [
    { label: 'memprocfs', value: 'memprocfs', description: '使用 MemProcFS 分析', type: 'tool', icon: 'brain' },
    { label: '-device', value: '-device', description: '指定设备/镜像', type: 'flag', icon: 'save' },
    { label: '-forensic', value: '-forensic', description: '取证模式 (1-4)', type: 'flag', icon: 'microscope' },
    { label: '-mount', value: '-mount', description: '挂载点字母', type: 'flag', icon: 'folder' },
    { label: '-pagefile0', value: '-pagefile0', description: '指定页面文件', type: 'flag', icon: 'file' },
    { label: '-v', value: '-v', description: '详细输出', type: 'flag', icon: 'megaphone' },
    { label: '-vv', value: '-vv', description: '超详细输出', type: 'flag', icon: 'megaphone' },
];

// ─── 常用注册表路径（取证关键路径）─────────────────────────

const registryKeyPaths: Suggestion[] = [
    // ── 自启动 / 持久化 ──
    { label: 'Run', value: 'Microsoft\\Windows\\CurrentVersion\\Run', description: '用户登录自启动', type: 'flag', icon: 'rocket', group: '自启动' },
    { label: 'RunOnce', value: 'Microsoft\\Windows\\CurrentVersion\\RunOnce', description: '单次执行自启动', type: 'flag', icon: 'rocket', group: '自启动' },
    { label: 'Run (Machine)', value: 'Microsoft\\Windows\\CurrentVersion\\Run', description: '机器级自启动 (HKLM)', type: 'flag', icon: 'rocket', group: '自启动' },
    { label: 'RunServices', value: 'Microsoft\\Windows\\CurrentVersion\\RunServices', description: '服务自启动', type: 'flag', icon: 'rocket', group: '自启动' },
    { label: 'Winlogon', value: 'Microsoft\\Windows NT\\CurrentVersion\\Winlogon', description: 'Shell/Userinit 启动项', type: 'flag', icon: 'rocket', group: '自启动' },
    { label: 'Image File Execution Options', value: 'Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options', description: 'IFEO 映像劫持', type: 'flag', icon: 'bug', group: '自启动' },
    { label: 'AppInit_DLLs', value: 'Microsoft\\Windows NT\\CurrentVersion\\Windows', description: 'AppInit_DLLs 注入', type: 'flag', icon: 'bug', group: '自启动' },
    { label: 'BootExecute', value: 'ControlSet001\\Control\\Session Manager', description: 'BootExecute 启动程序', type: 'flag', icon: 'rocket', group: '自启动' },
    // ── 系统信息 ──
    { label: 'ComputerName', value: 'ControlSet001\\Control\\ComputerName\\ComputerName', description: '计算机名称', type: 'flag', icon: 'info', group: '系统信息' },
    { label: 'CurrentVersion', value: 'Microsoft\\Windows NT\\CurrentVersion', description: '系统版本信息', type: 'flag', icon: 'info', group: '系统信息' },
    { label: 'TimeZoneInformation', value: 'ControlSet001\\Control\\TimeZoneInformation', description: '时区设置', type: 'flag', icon: 'clock', group: '系统信息' },
    { label: 'NetworkCards', value: 'Microsoft\\Windows NT\\CurrentVersion\\NetworkCards', description: '网卡信息', type: 'flag', icon: 'globe', group: '系统信息' },
    { label: 'Interfaces', value: 'ControlSet001\\Services\\Tcpip\\Parameters\\Interfaces', description: 'TCP/IP 网络接口', type: 'flag', icon: 'globe', group: '系统信息' },
    // ── 服务 ──
    { label: 'Services', value: 'ControlSet001\\Services', description: '系统服务列表', type: 'flag', icon: 'gear', group: '服务' },
    // ── 用户活动 ──
    { label: 'UserAssist', value: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist', description: '程序执行记录（ROT13）', type: 'flag', icon: 'user', group: '用户活动' },
    { label: 'RecentDocs', value: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs', description: '最近文档', type: 'flag', icon: 'file', group: '用户活动' },
    { label: 'TypedPaths', value: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths', description: '资源管理器路径输入记录', type: 'flag', icon: 'edit', group: '用户活动' },
    { label: 'RunMRU', value: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU', description: '运行对话框历史', type: 'flag', icon: 'edit', group: '用户活动' },
    { label: 'MountPoints2', value: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2', description: '已挂载设备记录', type: 'flag', icon: 'save', group: '用户活动' },
    { label: 'WordWheelQuery', value: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\WordWheelQuery', description: '搜索历史', type: 'flag', icon: 'search', group: '用户活动' },
    // ── 网络活动 ──
    { label: 'NetworkList\\Profiles', value: 'Microsoft\\Windows NT\\CurrentVersion\\NetworkList\\Profiles', description: '网络连接历史', type: 'flag', icon: 'globe', group: '网络活动' },
    { label: 'NetworkList\\Signatures', value: 'Microsoft\\Windows NT\\CurrentVersion\\NetworkList\\Signatures', description: '网络签名', type: 'flag', icon: 'globe', group: '网络活动' },
    // ── 安全 / 凭证 ──
    { label: 'SAM\\Domains\\Account\\Users', value: 'SAM\\Domains\\Account\\Users', description: '本地用户账户', type: 'flag', icon: 'key', group: '安全' },
    { label: 'LSA', value: 'SECURITY\\Policy', description: 'LSA 安全策略', type: 'flag', icon: 'lockSecure', group: '安全' },
    { label: 'PolAdtEv', value: 'SECURITY\\Policy\\PolAdtEv', description: '审计事件策略', type: 'flag', icon: 'chart', group: '安全' },
    // ── USB / 外设 ──
    { label: 'USBSTOR', value: 'ControlSet001\\Enum\\USBSTOR', description: 'USB 存储设备历史', type: 'flag', icon: 'plug', group: 'USB / 外设' },
    { label: 'USB', value: 'ControlSet001\\Enum\\USB', description: 'USB 设备枚举', type: 'flag', icon: 'plug', group: 'USB / 外设' },
    { label: 'MountedDevices', value: 'MountedDevices', description: '已挂载设备 (盘符映射)', type: 'flag', icon: 'save', group: 'USB / 外设' },
    // ── 恶意软件常用路径 ──
    { label: 'Notify (DLL)', value: 'Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\Notify', description: 'Winlogon 通知 DLL', type: 'flag', icon: 'bug', group: '恶意软件' },
    { label: 'Security Providers', value: 'ControlSet001\\Control\\SecurityProviders', description: '安全提供程序（SSP 注入）', type: 'flag', icon: 'bug', group: '恶意软件' },
    { label: 'Known DLLs', value: 'ControlSet001\\Control\\Session Manager\\KnownDLLs', description: '已知 DLL 列表', type: 'flag', icon: 'library', group: '恶意软件' },
    { label: 'Print Monitors', value: 'ControlSet001\\Control\\Print\\Monitors', description: '打印监视器（持久化点）', type: 'flag', icon: 'bug', group: '恶意软件' },
];

// Volatility 2 Profiles（按 OS 分组）
const vol2Profiles: Suggestion[] = [
    // ── Windows XP ──
    { label: 'WinXPSP2x86', value: 'WinXPSP2x86', description: 'Windows XP SP2 32位', type: 'profile', icon: 'desktop', group: 'Windows XP' },
    { label: 'WinXPSP3x86', value: 'WinXPSP3x86', description: 'Windows XP SP3 32位', type: 'profile', icon: 'desktop', group: 'Windows XP' },
    // ── Windows Vista ──
    { label: 'VistaSP0x64', value: 'VistaSP0x64', description: 'Vista SP0 64位', type: 'profile', icon: 'desktop', group: 'Windows Vista' },
    { label: 'VistaSP1x64', value: 'VistaSP1x64', description: 'Vista SP1 64位', type: 'profile', icon: 'desktop', group: 'Windows Vista' },
    { label: 'VistaSP2x64', value: 'VistaSP2x64', description: 'Vista SP2 64位', type: 'profile', icon: 'desktop', group: 'Windows Vista' },
    // ── Windows 7 ──
    { label: 'Win7SP0x86', value: 'Win7SP0x86', description: 'Windows 7 SP0 32位', type: 'profile', icon: 'desktop', group: 'Windows 7' },
    { label: 'Win7SP1x86', value: 'Win7SP1x86', description: 'Windows 7 SP1 32位', type: 'profile', icon: 'desktop', group: 'Windows 7' },
    { label: 'Win7SP1x64', value: 'Win7SP1x64', description: 'Windows 7 SP1 64位', type: 'profile', icon: 'desktop', group: 'Windows 7' },
    // ── Windows 8 ──
    { label: 'Win8SP0x64', value: 'Win8SP0x64', description: 'Windows 8 64位', type: 'profile', icon: 'desktop', group: 'Windows 8' },
    { label: 'Win8SP1x64', value: 'Win8SP1x64', description: 'Windows 8.1 64位', type: 'profile', icon: 'desktop', group: 'Windows 8' },
    // ── Windows 10 ──
    { label: 'Win10x64', value: 'Win10x64', description: 'Windows 10 64位', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    { label: 'Win10x64_10586', value: 'Win10x64_10586', description: 'Win10 1511 (10586)', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    { label: 'Win10x64_14393', value: 'Win10x64_14393', description: 'Win10 1607 (14393)', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    { label: 'Win10x64_15063', value: 'Win10x64_15063', description: 'Win10 1703 (15063)', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    { label: 'Win10x64_16299', value: 'Win10x64_16299', description: 'Win10 1709 (16299)', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    { label: 'Win10x64_17134', value: 'Win10x64_17134', description: 'Win10 1803 (17134)', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    { label: 'Win10x64_17763', value: 'Win10x64_17763', description: 'Win10 1809 (17763)', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    { label: 'Win10x64_18362', value: 'Win10x64_18362', description: 'Win10 1903 (18362)', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    { label: 'Win10x64_19041', value: 'Win10x64_19041', description: 'Win10 2004 (19041)', type: 'profile', icon: 'terminal', group: 'Windows 10' },
    // ── Windows Server ──
    { label: 'Win2003SP0x86', value: 'Win2003SP0x86', description: 'Server 2003 SP0', type: 'profile', icon: 'building', group: 'Server' },
    { label: 'Win2003SP1x64', value: 'Win2003SP1x64', description: 'Server 2003 SP1 64位', type: 'profile', icon: 'building', group: 'Server' },
    { label: 'Win2008R2SP1x64', value: 'Win2008R2SP1x64', description: 'Server 2008 R2 SP1', type: 'profile', icon: 'building', group: 'Server' },
    { label: 'Win2012R2x64', value: 'Win2012R2x64', description: 'Server 2012 R2 64位', type: 'profile', icon: 'building', group: 'Server' },
    { label: 'Win2016x64_14393', value: 'Win2016x64_14393', description: 'Server 2016', type: 'profile', icon: 'building', group: 'Server' },
    { label: 'Win2019x64_17763', value: 'Win2019x64_17763', description: 'Server 2019', type: 'profile', icon: 'building', group: 'Server' },
];

// vol2 --profile= 快捷建议（在输入 vol2 后优先显示）
const vol2ProfileFlag: Suggestion = {
    label: '--profile=', value: '--profile=', description: '指定内存镜像的系统配置', type: 'flag', icon: 'gear'
};

// Vol2 每个命令的特定参数
const vol2CommandFlags: Map<string, Suggestion[]> = new Map([
    ['pslist', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
        { label: '-P', value: '-P', description: '显示物理偏移', type: 'flag', icon: 'pin' },
    ]],
    ['psscan', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
    ]],
    ['dlllist', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
    ]],
    ['memdump', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
        { label: '-D', value: '-D ', description: '转储目录', type: 'flag', icon: 'folder' },
    ]],
    ['procdump', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
        { label: '-D', value: '-D ', description: '转储目录', type: 'flag', icon: 'folder' },
    ]],
    ['dlldump', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
        { label: '-D', value: '-D ', description: '转储目录', type: 'flag', icon: 'folder' },
        { label: '-r', value: '-r ', description: 'DLL 正则匹配', type: 'flag', icon: 'search' },
    ]],
    ['handles', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
        { label: '-t', value: '-t ', description: '句柄类型', type: 'flag', icon: 'tag' },
    ]],
    ['malfind', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
        { label: '-D', value: '-D ', description: '转储目录', type: 'flag', icon: 'folder' },
    ]],
    ['printkey', [
        { label: '-K', value: '-K ', description: '注册表键路径', type: 'flag', icon: 'key' },
        { label: '-o', value: '-o ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
    ]],
    ['hivelist', [
        { label: '-o', value: '-o ', description: '物理偏移（筛选 Hive）', type: 'flag', icon: 'pin' },
    ]],
    ['hivedump', [
        { label: '-o', value: '-o ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
    ]],
    ['dumpregistry', [
        { label: '-o', value: '-o ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
        { label: '-D', value: '-D ', description: '转储目录', type: 'flag', icon: 'folder' },
    ]],
    ['shellbags', [
        { label: '-o', value: '-o ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
    ]],
    ['shimcache', [
        { label: '-o', value: '-o ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
    ]],
    ['userassist', [
        { label: '-o', value: '-o ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
    ]],
    ['hashdump', [
        { label: '-y', value: '-y ', description: 'SYSTEM Hive 偏移', type: 'flag', icon: 'pin' },
        { label: '-s', value: '-s ', description: 'SAM Hive 偏移', type: 'flag', icon: 'pin' },
    ]],
    ['lsadump', [
        { label: '-y', value: '-y ', description: 'SYSTEM Hive 偏移', type: 'flag', icon: 'pin' },
        { label: '-s', value: '-s ', description: 'SECURITY Hive 偏移', type: 'flag', icon: 'pin' },
    ]],
    ['cachedump', [
        { label: '-y', value: '-y ', description: 'SYSTEM Hive 偏移', type: 'flag', icon: 'pin' },
        { label: '-s', value: '-s ', description: 'SECURITY Hive 偏移', type: 'flag', icon: 'pin' },
    ]],
    ['amcache', [
        { label: '-o', value: '-o ', description: 'Hive 偏移地址', type: 'flag', icon: 'pin' },
    ]],
    ['dumpfiles', [
        { label: '-Q', value: '-Q ', description: '物理偏移', type: 'flag', icon: 'pin' },
        { label: '-D', value: '-D ', description: '转储目录', type: 'flag', icon: 'folder' },
        { label: '-n', value: '-n', description: '包含文件名', type: 'flag', icon: 'edit' },
    ]],
    ['filescan', []],
    ['envars', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
    ]],
    ['cmdline', [
        { label: '-p', value: '-p ', description: '指定 PID', type: 'flag', icon: 'number' },
    ]],
]);

// Vol3 通用参数（全局 + 输出格式）
const vol3CommonFlags: Suggestion[] = [
    { label: '-f', value: '-f ', description: '指定镜像文件', type: 'flag', icon: 'save', group: '输入' },
    { label: '-s', value: '-s ', description: '指定符号表目录', type: 'flag', icon: 'folderOpen', group: '输入' },
    { label: '-o', value: '-o ', description: '输出目录', type: 'flag', icon: 'folder', group: '输出' },
    { label: '-r', value: '-r ', description: '渲染器 (json/csv/pretty/jsonl)', type: 'flag', icon: 'chart', group: '输出' },
    { label: '-q', value: '-q', description: '静默模式', type: 'flag', icon: 'quiet', group: '输出' },
    { label: '-v', value: '-v', description: '详细模式', type: 'flag', icon: 'megaphone', group: '输出' },
    { label: '-p', value: '-p ', description: '额外插件路径', type: 'flag', icon: 'puzzle', group: '高级' },
    { label: '--single-location', value: '--single-location ', description: '单一镜像 URI', type: 'flag', icon: 'pin', group: '高级' },
    { label: '--stackers', value: '--stackers ', description: '指定 stacker', type: 'flag', icon: 'library', group: '高级' },
    { label: '--clear-cache', value: '--clear-cache', description: '清除缓存', type: 'flag', icon: 'broom', group: '高级' },
    { label: '--write-config', value: '--write-config', description: '写出配置文件', type: 'flag', icon: 'edit', group: '高级' },
];

// ─── 主类 ───────────────────────────────────────────────────

export class TerminalAutocomplete {
    private term: Terminal;
    private container: HTMLElement;
    private suggestionBox: HTMLElement;
    private currentInput: string = '';
    private active: boolean = false;
    private selectedIndex: number = 0;
    private suggestions: Suggestion[] = [];
    private currentImagePath: string = '';
    private sendData: (data: string) => void;
    private disposables: { dispose: () => void }[] = [];

    // 命令历史与频率
    private commandHistory: string[] = [];
    private commandFrequency: Map<string, number> = new Map();
    private static readonly HISTORY_STORAGE_KEY = 'lml_terminal_history';
    private static readonly FREQ_STORAGE_KEY = 'lml_terminal_freq';
    private static readonly MAX_HISTORY = 200;

    // 上次使用的 Profile 缓存
    private lastUsedProfile: string = '';
    private static readonly PROFILE_CACHE_KEY = 'lml_terminal_last_profile';

    constructor(term: Terminal, container: HTMLElement, sendData: (data: string) => void) {
        this.term = term;
        this.container = container;
        this.sendData = sendData;

        this.suggestionBox = document.createElement('div');
        this.suggestionBox.className = 'terminal-autocomplete-box';
        this.suggestionBox.style.display = 'none';
        this.container.appendChild(this.suggestionBox);

        this.loadHistory();
        this.bindEvents();
        this.loadCurrentImagePath();
    }

    // ─── 持久化 ─────────────────────────────────────────────

    private loadHistory(): void {
        try {
            const hist = localStorage.getItem(TerminalAutocomplete.HISTORY_STORAGE_KEY);
            if (hist) this.commandHistory = JSON.parse(hist);
            const freq = localStorage.getItem(TerminalAutocomplete.FREQ_STORAGE_KEY);
            if (freq) this.commandFrequency = new Map(JSON.parse(freq));
            this.lastUsedProfile = localStorage.getItem(TerminalAutocomplete.PROFILE_CACHE_KEY) ?? '';
        } catch { /* ignore */ }
    }

    private saveHistory(): void {
        try {
            const trimmed = this.commandHistory.slice(-TerminalAutocomplete.MAX_HISTORY);
            localStorage.setItem(TerminalAutocomplete.HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
            localStorage.setItem(TerminalAutocomplete.FREQ_STORAGE_KEY, JSON.stringify([...this.commandFrequency]));
        } catch { /* ignore */ }
    }

    /** 记录已执行的命令（由外部在回车时调用或内部检测） */
    public recordCommand(cmd: string): void {
        const trimmed = cmd.trim();
        if (!trimmed) return;
        this.commandHistory.push(trimmed);
        this.commandFrequency.set(trimmed, (this.commandFrequency.get(trimmed) ?? 0) + 1);
        this.saveHistory();
    }

    // ─── 镜像路径 ───────────────────────────────────────────

    private async loadCurrentImagePath(): Promise<void> {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            this.currentImagePath = await invoke('get_current_image_path_command') as string;
        } catch {
            this.currentImagePath = '';
        }
    }

    // ─── 事件绑定 ───────────────────────────────────────────

    private bindEvents(): void {
        this.term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
            if (this.active && event.type === 'keydown') {
                switch (event.key) {
                    case 'ArrowUp':   this.moveSelection(-1); return false;
                    case 'ArrowDown': this.moveSelection(1);  return false;
                    case 'Tab':
                    case 'Enter':     this.applySelection();  return false;
                    case 'Escape':    this.hide();             return false;
                }
            }
            return true;
        });

        const onDataDisposable = this.term.onData((data) => this.trackInput(data));
        this.disposables.push(onDataDisposable);
    }

    // ─── 输入追踪 ───────────────────────────────────────────

    private trackInput(data: string): void {
        if (data === '\r') {
            this.recordCommand(this.currentInput);
            this.currentInput = '';
            this.hide();
            return;
        }
        if (data === '\u0003' || data === '\u000c') { // Ctrl+C / Ctrl+L
            this.currentInput = '';
            this.hide();
            return;
        }
        if (data === '\u007F') { // Backspace
            this.currentInput = this.currentInput.slice(0, -1);
        } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
            this.currentInput += data;
        } else {
            // 方向键等控制序列不影响输入缓冲
            return;
        }
        this.checkTriggers();
    }

    // ─── 触发逻辑 ───────────────────────────────────────────

    private checkTriggers(): void {
        const input = this.currentInput;
        if (!input) { this.hide(); return; }

        // ① --profile= 智能位置识别（支持任意位置，如 vol2 pslist --profile= 也能触发）
        const profileMatch = input.match(/--profile=([a-zA-Z0-9_]*)$/);
        if (profileMatch && input.includes('vol2')) {
            const partial = profileMatch[1];
            const profileList = this.getProfilesWithCachePriority();
            const results = fuzzyFilter(partial, profileList, this.commandFrequency);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ①b 注册表键路径智能补全
        //    vol2: printkey -K <path>  |  vol3: PrintKey --key <path>
        const vol2RegKeyMatch = input.match(/printkey\s+(?:.*\s)?-K\s+([^\s]*)$/);
        const vol3RegKeyMatch = input.match(/PrintKey\s+(?:.*\s)?--key\s+([^\s]*)$/);
        const regKeyMatch = vol2RegKeyMatch || vol3RegKeyMatch;
        if (regKeyMatch) {
            const partial = regKeyMatch[1];
            const results = fuzzyFilter(partial, registryKeyPaths, this.commandFrequency);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ② vol2 <command> <flags> → 显示该命令的参数（包括 --profile=）
        const vol2FlagMatch = input.match(/vol2\s+(?:--profile=\S+\s+)?(\w+)\s+(-{0,2}\S*)$/);
        if (vol2FlagMatch) {
            const cmd = vol2FlagMatch[1];
            const partial = vol2FlagMatch[2];
            // 合并命令特定参数 + --profile= 通用参数
            const cmdFlags = vol2CommandFlags.get(cmd) ?? [];
            const allFlags = [...cmdFlags];
            // 如果当前命令行还没有 --profile=，提供它
            if (!input.includes('--profile=')) {
                allFlags.push(vol2ProfileFlag);
            }
            if (allFlags.length > 0) {
                const results = fuzzyFilter(partial, allFlags);
                if (results.length) { this.showSuggestions(results); return; }
            }
        }

        // ③ vol2 <command> → vol2 命令补全（混入 --profile= 作为首选推荐）
        const vol2Match = input.match(/vol2\s+(?:--profile=\S+\s+)?([a-zA-Z0-9-]*)$/);
        if (vol2Match) {
            const partial = vol2Match[1];
            // 如果刚输入 vol2 且还没有 --profile=，将 --profile= 加入候选列表顶部
            const candidates = [...vol2Commands];
            if (!input.includes('--profile=')) {
                candidates.unshift(vol2ProfileFlag);
            }
            // 如果有缓存的 profile，额外添加快捷模板
            if (this.lastUsedProfile && !input.includes('--profile=')) {
                candidates.unshift({
                    label: `--profile=${this.lastUsedProfile}`,
                    value: `--profile=${this.lastUsedProfile} `,
                    description: `上次使用的配置`,
                    type: 'profile' as const,
                    icon: 'star',
                    group: '快捷',
                });
            }
            const results = fuzzyFilter(partial, candidates, this.commandFrequency);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ④ vol3 <plugin> <flags> → 插件专属参数 + 通用参数
        const vol3FlagMatch = input.match(/vol3\s+(?:(?:-\w+\s+\S*\s+)*)?(\S+\.\S+\.\S+)\s+(-{0,2}\S*)$/);
        if (vol3FlagMatch) {
            const plugin = vol3FlagMatch[1];
            const partial = vol3FlagMatch[2];
            const pluginFlags = vol3PluginFlags.get(plugin) ?? [];
            const allFlags = [...pluginFlags, ...vol3CommonFlags];
            // 去重（插件专属优先）
            const seen = new Set<string>();
            const deduped = allFlags.filter(f => {
                if (seen.has(f.value)) return false;
                seen.add(f.value);
                return true;
            });
            const results = fuzzyFilter(partial, deduped);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ④b vol3 <global-flags> → vol3 通用参数（尚未输入插件名时）
        const vol3GlobalFlagMatch = input.match(/vol3\s+(-{1,2}\S*)$/);
        if (vol3GlobalFlagMatch) {
            const partial = vol3GlobalFlagMatch[1];
            const results = fuzzyFilter(partial, vol3CommonFlags);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ⑤ vol3 windows.xxx → Windows 插件
        const vol3WinMatch = input.match(/(windows\.[a-zA-Z0-9._]*)$/);
        if (vol3WinMatch) {
            const partial = vol3WinMatch[1];
            const results = fuzzyFilter(partial, vol3WindowsPlugins, this.commandFrequency);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ⑥ vol3 linux.xxx → Linux 插件
        const vol3LinMatch = input.match(/(linux\.[a-zA-Z0-9._]*)$/);
        if (vol3LinMatch) {
            const partial = vol3LinMatch[1];
            const results = fuzzyFilter(partial, vol3LinuxPlugins, this.commandFrequency);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ⑥b vol3 mac.xxx → Mac 插件
        const vol3MacMatch = input.match(/(mac\.[a-zA-Z0-9._]*)$/);
        if (vol3MacMatch) {
            const partial = vol3MacMatch[1];
            const results = fuzzyFilter(partial, vol3MacPlugins, this.commandFrequency);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ⑥c vol3 后直接输入命名空间/通用插件名
        const vol3NsMatch = input.match(/vol3\s+(?:(?:-\w+\s+\S*\s+)*)([a-zA-Z]*)$/);
        if (vol3NsMatch && !input.match(/--/)) {
            const partial = vol3NsMatch[1];
            const results = fuzzyFilter(partial, vol3Namespaces, this.commandFrequency);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ⑦ memprocfs 相关
        const mpMatch = input.match(/memprocfs\s+(-?\S*)$/);
        if (mpMatch) {
            const partial = mpMatch[1];
            const results = fuzzyFilter(partial, memprocfsCommands, this.commandFrequency);
            if (results.length) { this.showSuggestions(results); return; }
        }

        // ⑧ 通用命令 + 历史（在命令行的起始位置匹配）
        const generalMatch = input.match(/^([a-zA-Z0-9_.\-/\\]*)$/);
        if (generalMatch) {
            const partial = generalMatch[1];
            if (partial.length >= 1) {
                // 合并 shell 命令、历史记录、工具命令
                const historySuggestions = this.getHistorySuggestions(partial);
                const allCommands = [...historySuggestions, ...shellCommands, ...memprocfsCommands.slice(0, 1)];
                const results = fuzzyFilter(partial, allCommands, this.commandFrequency);
                if (results.length) { this.showSuggestions(results); return; }
            }
        }

        this.hide();
    }

    /** 获取按缓存优先排序的 Profile 列表 */
    private getProfilesWithCachePriority(): Suggestion[] {
        if (!this.lastUsedProfile) return vol2Profiles;
        // 将上次使用的 profile 置顶并标记为快捷
        const cached = vol2Profiles.find(p => p.value === this.lastUsedProfile);
        if (!cached) return vol2Profiles;
        const top: Suggestion = {
            ...cached,
            description: `★ 上次使用 — ${cached.description ?? ''}`,
            icon: 'star',
            group: '最近使用',
        };
        const rest = vol2Profiles.filter(p => p.value !== this.lastUsedProfile);
        return [top, ...rest];
    }

    /** 从历史记录生成建议 */
    private getHistorySuggestions(partial: string): Suggestion[] {
        const seen = new Set<string>();
        const suggestions: Suggestion[] = [];
        // 从最新到最旧遍历
        for (let i = this.commandHistory.length - 1; i >= 0 && suggestions.length < 8; i--) {
            const cmd = this.commandHistory[i];
            if (!seen.has(cmd) && cmd.toLowerCase().includes(partial.toLowerCase())) {
                seen.add(cmd);
                const freq = this.commandFrequency.get(cmd) ?? 1;
                suggestions.push({
                    label: cmd,
                    value: cmd,
                    description: `历史 (使用${freq}次)`,
                    type: 'history',
                    icon: 'clock',
                });
            }
        }
        return suggestions;
    }

    // ─── 显示 / 渲染 ───────────────────────────────────────

    private showSuggestions(suggestions: Suggestion[]): void {
        this.suggestions = suggestions;
        this.selectedIndex = 0;
        this.active = true;
        this.renderSuggestions();
        this.updatePosition();
        this.suggestionBox.style.display = 'block';
    }

    private renderSuggestions(): void {
        this.suggestionBox.innerHTML = '';

        // 镜像状态提示
        if (this.currentImagePath && (this.currentInput.includes('vol2') || this.currentInput.includes('vol3'))) {
            const hint = document.createElement('div');
            hint.className = 'suggestion-hint';
            const fileName = this.currentImagePath.split(/[/\\]/).pop() || this.currentImagePath;
            hint.innerHTML = `<span style="color:#4CAF50">✓</span> 已加载: <strong>${fileName}</strong>`;
            this.suggestionBox.appendChild(hint);
        } else if (!this.currentImagePath && (this.currentInput.includes('vol2') || this.currentInput.includes('vol3'))) {
            const hint = document.createElement('div');
            hint.className = 'suggestion-hint';
            hint.innerHTML = `<span style="color:#FF9800">⚠</span> 未加载镜像`;
            this.suggestionBox.appendChild(hint);
        }

        let lastGroup = '';
        this.suggestions.forEach((s, i) => {
            // 分组标头（仅 profile 类型使用）
            if (s.group && s.group !== lastGroup) {
                lastGroup = s.group;
                const groupHeader = document.createElement('div');
                groupHeader.className = 'suggestion-group-header';
                groupHeader.textContent = s.group;
                this.suggestionBox.appendChild(groupHeader);
            }

            const item = document.createElement('div');
            item.className = `suggestion-item${i === this.selectedIndex ? ' selected' : ''}`;

            // 图标（SVG）
            const icon = document.createElement('span');
            icon.className = 'suggestion-icon';
            icon.innerHTML = getIconSvg(s.icon);
            item.appendChild(icon);

            // 文本包裹
            const textWrap = document.createElement('div');
            textWrap.className = 'suggestion-text-wrap';

            const labelRow = document.createElement('div');
            labelRow.className = 'suggestion-label-row';

            const label = document.createElement('span');
            label.className = 'suggestion-label';
            label.textContent = s.label;
            labelRow.appendChild(label);

            // 类型标签
            const badge = document.createElement('span');
            badge.className = `suggestion-type-badge suggestion-type-${s.type}`;
            badge.textContent = this.getTypeName(s.type);
            labelRow.appendChild(badge);

            textWrap.appendChild(labelRow);

            if (s.description) {
                const desc = document.createElement('span');
                desc.className = 'suggestion-desc';
                desc.textContent = s.description;
                textWrap.appendChild(desc);
            }

            item.appendChild(textWrap);

            // 鼠标事件
            item.addEventListener('mouseenter', () => {
                this.selectedIndex = i;
                this.renderSuggestions();
            });
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // 防止终端失焦
                this.selectedIndex = i;
                this.applySelection();
            });

            this.suggestionBox.appendChild(item);
        });
    }

    private getTypeName(type: string): string {
        switch (type) {
            case 'command': return '命令';
            case 'profile': return '配置';
            case 'flag':    return '参数';
            case 'history': return '历史';
            case 'tool':    return '工具';
            default:        return type;
        }
    }

    // ─── 位置计算（精确） ───────────────────────────────────

    private updatePosition(): void {
        const cursorX = this.term.buffer.active.cursorX;
        const cursorY = this.term.buffer.active.cursorY;

        // 尝试从 xterm 实际渲染区域获取字符尺寸
        let charWidth = 9;
        let lineHeight = 17;
        const screen = this.container.querySelector('.xterm-screen') as HTMLElement;
        if (screen && this.term.rows > 0 && this.term.cols > 0) {
            charWidth = screen.clientWidth / this.term.cols;
            lineHeight = screen.clientHeight / this.term.rows;
        }

        // 计算 body 区域的偏移（header + padding）
        const body = this.container.querySelector('.terminal-body') as HTMLElement;
        const offsetTop = body ? body.offsetTop : 40;
        const offsetLeft = body ? body.offsetLeft : 0;
        const paddingLeft = 4; // .terminal-body padding

        let left = offsetLeft + paddingLeft + cursorX * charWidth;
        let top = offsetTop + (cursorY + 1) * lineHeight + 4;

        // 边界检测 - 防止超出容器
        const boxWidth = 320;
        const boxHeight = 260;
        if (left + boxWidth > this.container.clientWidth) {
            left = Math.max(4, this.container.clientWidth - boxWidth - 4);
        }
        if (top + boxHeight > this.container.clientHeight) {
            top = Math.max(4, offsetTop + cursorY * lineHeight - boxHeight);
        }

        this.suggestionBox.style.left = `${left}px`;
        this.suggestionBox.style.top = `${top}px`;
    }

    // ─── 选择与应用 ─────────────────────────────────────────

    private moveSelection(direction: number): void {
        this.selectedIndex = (this.selectedIndex + direction + this.suggestions.length) % this.suggestions.length;
        this.renderSuggestions();

        // 滚动到选中项
        const hintOffset = this.suggestionBox.querySelector('.suggestion-hint') ? 1 : 0;
        const selected = this.suggestionBox.children[this.selectedIndex + hintOffset] as HTMLElement;
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    private applySelection(): void {
        if (!this.active || !this.suggestions[this.selectedIndex]) return;

        const suggestion = this.suggestions[this.selectedIndex];
        let textToInsert = suggestion.value;
        const input = this.currentInput;

        if (suggestion.type === 'history') {
            // 历史命令：替换整行
            const backspaces = '\u007F'.repeat(input.length);
            this.sendData(backspaces);
            this.currentInput = textToInsert;
            this.sendData(textToInsert);
            this.hide();
            return;
        }

        if (suggestion.type === 'profile') {
            // Profile: 补全 --profile= 后面的部分
            const profilePartMatch = input.match(/--profile=([a-zA-Z0-9_]*)$/);
            if (profilePartMatch) {
                const typed = profilePartMatch[1];
                // 如果 value 包含 --profile=（快捷模板），跳过前缀
                if (textToInsert.startsWith('--profile=')) {
                    textToInsert = textToInsert.substring(('--profile=' + typed).length);
                } else {
                    textToInsert = textToInsert.substring(typed.length);
                }
            }
            // 缓存选择的 profile
            const profileName = suggestion.value.replace(/^--profile=/, '').trim();
            if (profileName && !profileName.startsWith('-')) {
                this.lastUsedProfile = profileName;
                try { localStorage.setItem(TerminalAutocomplete.PROFILE_CACHE_KEY, profileName); } catch { /* ignore */ }
            }
        } else if (suggestion.type === 'flag') {
            // Flag: 补全 - 后面的部分
            const flagMatch = input.match(/(-\S*)$/);
            if (flagMatch) {
                const typed = flagMatch[1];
                if (textToInsert.startsWith(typed)) {
                    textToInsert = textToInsert.substring(typed.length);
                }
            }
        } else if (suggestion.type === 'command' || suggestion.type === 'tool') {
            // 通用命令/工具补全
            // vol2 后面的命令
            const vol2Match = input.match(/vol2\s+(?:--profile=\S+\s+)?([a-zA-Z0-9]*)$/);
            if (vol2Match) {
                const typed = vol2Match[1];
                if (suggestion.value.startsWith(typed)) {
                    textToInsert = suggestion.value.substring(typed.length);
                }
            } else {
                // vol3 windows./linux./mac. 插件
                const nsMatch = input.match(/((?:windows|linux|mac)\.[a-zA-Z0-9._]*)$/);
                if (nsMatch) {
                    const typed = nsMatch[1];
                    if (suggestion.value.toLowerCase().startsWith(typed.toLowerCase())) {
                        textToInsert = suggestion.value.substring(typed.length);
                    }
                } else {
                    // vol3 命名空间/通用插件
                    const vol3NsApply = input.match(/vol3\s+(?:(?:-\w+\s+\S*\s+)*)([a-zA-Z]*)$/);
                    if (vol3NsApply) {
                        const typed = vol3NsApply[1];
                        if (suggestion.value.toLowerCase().startsWith(typed.toLowerCase())) {
                            textToInsert = suggestion.value.substring(typed.length);
                        }
                    } else {
                    // memprocfs 参数
                    const mpMatch = input.match(/memprocfs\s+(-?\S*)$/);
                    if (mpMatch) {
                        const typed = mpMatch[1];
                        if (suggestion.value.startsWith(typed)) {
                            textToInsert = suggestion.value.substring(typed.length);
                        }
                    } else {
                        // 一般命令
                        const genMatch = input.match(/([a-zA-Z0-9_.\-/\\]*)$/);
                        if (genMatch) {
                            const typed = genMatch[1];
                            if (suggestion.value.startsWith(typed)) {
                                textToInsert = suggestion.value.substring(typed.length);
                            }
                        }
                    }
                    }
                }
            }
        }

        this.sendData(textToInsert);
        this.currentInput += textToInsert;
        this.hide();
    }

    // ─── 隐藏 / 销毁 ───────────────────────────────────────

    private hide(): void {
        this.active = false;
        this.suggestionBox.style.display = 'none';
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        if (this.suggestionBox?.parentNode) {
            this.suggestionBox.parentNode.removeChild(this.suggestionBox);
        }
        this.term.attachCustomKeyEventHandler(() => true);
    }
}

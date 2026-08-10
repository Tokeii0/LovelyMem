/**
 * Vol3 通用 CSV 解析工具
 */

import { invoke } from '@tauri-apps/api/core';
import { loadAppSettings } from '../../../core/settingsHelper';

export function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(',').map(s => s.trim());
  const result: string[] = [];
  let current = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { current += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { result.push(current.trim()); current = ''; }
    else current += c;
  }
  result.push(current.trim());
  return result;
}

export async function loadVol3Csv(fileName: string): Promise<string[][]> {
  const settings = await loadAppSettings();
  const outputPath = (settings as any).output_path || 'output';
  const content = await invoke('read_file', { path: `${outputPath}\\${fileName}` }) as string;
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];
  return lines.map(l => parseCsvLine(l));
}

export function esc(t: string): string {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

export function highlight(text: string, keyword: string): string {
  const e = esc(text);
  if (!keyword) return e;
  const kw = esc(keyword);
  return e.replace(new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<mark class="svc-hl">$1</mark>');
}

/**
 * 智能标注系统
 * 允许用户对分析数据行添加注释和状态标签
 */

const STORAGE_KEY = 'lovelymem-annotations';

export type AnnotationTag = 'suspicious' | 'attention' | 'normal' | 'none';

export interface Annotation {
  rowKey: string;
  note: string;
  tag: AnnotationTag;
  createdAt: number;
  updatedAt: number;
}

export interface AnnotationTagInfo {
  label: string;
  color: string;
  bgColor: string;
}

/**
 * 标签元数据
 */
export const TAG_INFO: Record<AnnotationTag, AnnotationTagInfo> = {
  suspicious: { label: '可疑', color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)' },
  attention: { label: '关注', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)' },
  normal: { label: '正常', color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)' },
  none: { label: '无标签', color: '#94a3b8', bgColor: 'transparent' },
};

class AnnotationsManager {
  private data: Map<string, Map<string, Annotation>>;

  constructor() {
    this.data = this.load();
  }

  /**
   * 添加/更新标注
   * @param context 上下文标识，如 "vol2-pslist"
   * @param rowKey 行标识，如行号或唯一字段值
   * @param note 注释文本
   * @param tag 状态标签
   */
  annotate(context: string, rowKey: string, note: string, tag: AnnotationTag = 'none'): void {
    if (!this.data.has(context)) {
      this.data.set(context, new Map());
    }

    const contextMap = this.data.get(context)!;
    const existing = contextMap.get(rowKey);

    contextMap.set(rowKey, {
      rowKey,
      note,
      tag,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });

    this.save();
  }

  /**
   * 获取单个标注
   */
  getAnnotation(context: string, rowKey: string): Annotation | undefined {
    return this.data.get(context)?.get(rowKey);
  }

  /**
   * 获取某个上下文的所有标注
   */
  getAll(context: string): Annotation[] {
    const contextMap = this.data.get(context);
    if (!contextMap) return [];
    return Array.from(contextMap.values());
  }

  /**
   * 按标签筛选
   */
  getByTag(context: string, tag: AnnotationTag): Annotation[] {
    return this.getAll(context).filter(a => a.tag === tag);
  }

  /**
   * 获取标注的数量统计
   */
  getStats(context: string): { total: number; suspicious: number; attention: number; normal: number } {
    const all = this.getAll(context);
    return {
      total: all.length,
      suspicious: all.filter(a => a.tag === 'suspicious').length,
      attention: all.filter(a => a.tag === 'attention').length,
      normal: all.filter(a => a.tag === 'normal').length,
    };
  }

  /**
   * 移除标注
   */
  remove(context: string, rowKey: string): void {
    const contextMap = this.data.get(context);
    if (contextMap) {
      contextMap.delete(rowKey);
      if (contextMap.size === 0) {
        this.data.delete(context);
      }
      this.save();
    }
  }

  /**
   * 清除某个上下文的所有标注
   */
  clearContext(context: string): void {
    this.data.delete(context);
    this.save();
  }

  /**
   * 检查某行是否有标注
   */
  hasAnnotation(context: string, rowKey: string): boolean {
    return this.data.get(context)?.has(rowKey) || false;
  }

  // --- 内部 ---

  private load(): Map<string, Map<string, Annotation>> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const obj = JSON.parse(stored);
        const result = new Map<string, Map<string, Annotation>>();
        for (const [context, entries] of Object.entries(obj)) {
          const contextMap = new Map<string, Annotation>();
          for (const [key, annotation] of Object.entries(entries as Record<string, Annotation>)) {
            contextMap.set(key, annotation);
          }
          result.set(context, contextMap);
        }
        return result;
      }
    } catch (e) {
      console.warn('[Annotations] 加载失败:', e);
    }
    return new Map();
  }

  private save(): void {
    try {
      const obj: Record<string, Record<string, Annotation>> = {};
      for (const [context, contextMap] of this.data) {
        obj[context] = Object.fromEntries(contextMap);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.warn('[Annotations] 保存失败:', e);
    }
  }
}

export const annotationsManager = new AnnotationsManager();

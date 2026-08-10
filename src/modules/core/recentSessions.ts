/**
 * 最近会话管理器
 * 记录用户最近加载的内存镜像，在欢迎页展示以便快速恢复
 */

const STORAGE_KEY = 'lovelymem-recent-sessions';
const MAX_SESSIONS = 10;

export interface RecentSession {
  path: string;
  name: string;
  size: number;
  lastOpened: number; // timestamp
  engine?: string;
}

class RecentSessionsManager {
  private sessions: RecentSession[];

  constructor() {
    this.sessions = this.load();
  }

  /**
   * 添加或更新一条会话记录
   */
  addSession(path: string, name: string, size: number, engine?: string): void {
    // 移除已存在的同路径记录
    this.sessions = this.sessions.filter(s => s.path !== path);

    // 添加到头部
    this.sessions.unshift({
      path,
      name,
      size,
      lastOpened: Date.now(),
      engine,
    });

    // 限制数量
    if (this.sessions.length > MAX_SESSIONS) {
      this.sessions = this.sessions.slice(0, MAX_SESSIONS);
    }

    this.save();
  }

  /**
   * 获取所有最近会话
   */
  getAll(): RecentSession[] {
    return [...this.sessions];
  }

  /**
   * 移除指定会话
   */
  remove(path: string): void {
    this.sessions = this.sessions.filter(s => s.path !== path);
    this.save();
  }

  /**
   * 清空所有记录
   */
  clear(): void {
    this.sessions = [];
    this.save();
  }

  /**
   * 是否有最近会话
   */
  hasRecent(): boolean {
    return this.sessions.length > 0;
  }

  // --- 内部 ---

  private load(): RecentSession[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          return arr;
        }
      }
    } catch (e) {
      console.warn('[RecentSessions] 加载失败:', e);
    }
    return [];
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sessions));
    } catch (e) {
      console.warn('[RecentSessions] 保存失败:', e);
    }
  }
}

export const recentSessions = new RecentSessionsManager();

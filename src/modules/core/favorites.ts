/**
 * 收藏夹管理器
 * 允许用户标记常用的功能卡片，持久化到 localStorage
 */

const STORAGE_KEY = 'lovelymem-favorites';

class FavoritesManager {
  private favorites: Set<string>;

  constructor() {
    this.favorites = this.load();
  }

  /**
   * 切换收藏状态
   */
  toggle(featureId: string): boolean {
    if (this.favorites.has(featureId)) {
      this.favorites.delete(featureId);
    } else {
      this.favorites.add(featureId);
    }
    this.save();
    this.dispatchChange();
    return this.favorites.has(featureId);
  }

  /**
   * 检查是否已收藏
   */
  isFavorite(featureId: string): boolean {
    return this.favorites.has(featureId);
  }

  /**
   * 获取所有收藏的 feature ID
   */
  getAll(): string[] {
    return Array.from(this.favorites);
  }

  /**
   * 获取收藏数量
   */
  count(): number {
    return this.favorites.size;
  }

  // --- 内部 ---

  private load(): Set<string> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      }
    } catch (e) {
      console.warn('[Favorites] 加载收藏数据失败:', e);
    }
    return new Set();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.favorites)));
    } catch (e) {
      console.warn('[Favorites] 保存收藏数据失败:', e);
    }
  }

  private dispatchChange(): void {
    window.dispatchEvent(new CustomEvent('favorites-changed', {
      detail: { favorites: this.getAll() }
    }));
  }
}

/**
 * 全局单例
 */
export const favoritesManager = new FavoritesManager();

export class SearchEvents {
  /**
   * 绑定搜索事件
   */
  bindSearchEvents(): void {
    // 支持新的可展开搜索框和旧的搜索框
    const expandableSearchInput = document.querySelector('.expandable-search-input') as HTMLInputElement;
    const enhancedSearchInput = document.querySelector('.enhanced-search-input') as HTMLInputElement;
    const searchInput = document.querySelector('.search-input') as HTMLInputElement;

    // 优先绑定可展开搜索框
    if (expandableSearchInput) {
      // 移除可能的旧事件监听器
      expandableSearchInput.removeEventListener('input', this.enhancedSearchHandler);
      // 添加新的事件监听器
      expandableSearchInput.addEventListener('input', this.enhancedSearchHandler);
    } else if (enhancedSearchInput) {
      // 移除可能的旧事件监听器
      enhancedSearchInput.removeEventListener('input', this.enhancedSearchHandler);
      // 添加新的事件监听器
      enhancedSearchInput.addEventListener('input', this.enhancedSearchHandler);
    } else if (searchInput) {
      // 移除可能的旧事件监听器
      searchInput.removeEventListener('input', this.searchHandler);
      // 添加新的事件监听器
      searchInput.addEventListener('input', this.searchHandler);
    }
  }

  /**
   * 搜索处理器
   */
  private searchHandler = (e: Event): void => {
    const query = (e.target as HTMLInputElement).value;
    this.filterFeatures(query);
  };

  /**
   * 增强搜索处理器
   */
  private enhancedSearchHandler = (e: Event): void => {
    const query = (e.target as HTMLInputElement).value;
    this.filterFeatures(query);
    this.updateSearchSuggestions(query);
  };

  /**
   * 按分类过滤功能
   */
  filterFeaturesByCategory(category: string | null): void {
    const cards = document.querySelectorAll('.modern-feature-card');
    const buttons = document.querySelectorAll('.category-btn');
    const floatingButtons = document.querySelectorAll('.floating-category-btn');

    // 更新按钮状态
    buttons.forEach(btn => btn.classList.remove('active'));
    floatingButtons.forEach(btn => btn.classList.remove('active'));

    const activeBtn = document.querySelector(`[data-category="${category}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const activeFloatingBtn = document.querySelector(`.floating-category-btn[data-category="${category}"]`);
    if (activeFloatingBtn) activeFloatingBtn.classList.add('active');

    // 收藏夹过滤
    if (category === 'favorites') {
      import('../../core/favorites').then(({ favoritesManager }) => {
        cards.forEach(card => {
          const featureId = card.getAttribute('data-feature') || '';
          if (favoritesManager.isFavorite(featureId)) {
            (card as HTMLElement).style.display = 'block';
            card.classList.add('fadeIn');
          } else {
            (card as HTMLElement).style.display = 'none';
          }
        });
      });
      return;
    }

    // 过滤卡片
    cards.forEach(card => {
      const cardCategory = card.getAttribute('data-category');
      if (category === 'all' || cardCategory === category) {
        (card as HTMLElement).style.display = 'block';
        card.classList.add('fadeIn');
      } else {
        (card as HTMLElement).style.display = 'none';
      }
    });
  }

  /**
   * 过滤功能
   */
  filterFeatures(query: string): void {
    const cards = document.querySelectorAll('.modern-feature-card');
    cards.forEach(card => {
      const titleEl = card.querySelector('.feature-title');
      const title = titleEl?.textContent || '';
      const desc = card.querySelector('.feature-description')?.textContent || '';
      const searchText = (title + ' ' + desc).toLowerCase();

      if (searchText.includes(query.toLowerCase()) || query === '') {
        (card as HTMLElement).style.display = 'block';
        card.classList.add('fadeIn');
        if (titleEl && query.length >= 2) {
          const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          titleEl.innerHTML = title.replace(new RegExp('(' + safe + ')', 'gi'), '<mark class="search-match">$1</mark>');
        } else if (titleEl) {
          titleEl.textContent = title;
        }
      } else {
        (card as HTMLElement).style.display = 'none';
      }
    });
  }

  /**
   * 更新搜索建议
   */
  private updateSearchSuggestions(query: string): void {
    const suggestionsContainer = document.getElementById('search-suggestions');
    if (!suggestionsContainer) return;

    if (!query || query.length < 2) {
      suggestionsContainer.style.display = 'none';
      return;
    }

    const cards = document.querySelectorAll('.modern-feature-card');
    const suggestions: string[] = [];
    
    cards.forEach(card => {
      const title = card.querySelector('.feature-title')?.textContent || '';
      const desc = card.querySelector('.feature-description')?.textContent || '';
      
      if (title.toLowerCase().includes(query.toLowerCase()) || 
          desc.toLowerCase().includes(query.toLowerCase())) {
        if (!suggestions.includes(title) && suggestions.length < 5) {
          suggestions.push(title);
        }
      }
    });

    if (suggestions.length > 0) {
      suggestionsContainer.innerHTML = suggestions
        .map(suggestion => `
          <div class="search-suggestion-item" data-suggestion="${suggestion}">
            ${this.highlightSearchTerm(suggestion, query)}
          </div>
        `)
        .join('');
      
      suggestionsContainer.style.display = 'block';
      
      // 绑定建议项点击事件
      suggestionsContainer.querySelectorAll('.search-suggestion-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const suggestion = (e.target as HTMLElement).getAttribute('data-suggestion');
          if (suggestion) {
            const searchInput = document.querySelector('.enhanced-search-input') as HTMLInputElement;
            if (searchInput) {
              searchInput.value = suggestion;
              this.filterFeatures(suggestion);
              suggestionsContainer.style.display = 'none';
            }
          }
        });
      });
    } else {
      suggestionsContainer.style.display = 'none';
    }
  }

  /**
   * 高亮搜索关键词
   */
  private highlightSearchTerm(text: string, query: string): string {
    if (!query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
  }

  /**
   * 聚焦搜索框
   */
  focusSearch(): void {
    const expandableSearchInput = document.querySelector('.expandable-search-input') as HTMLInputElement;
    const enhancedSearchInput = document.querySelector('.enhanced-search-input') as HTMLInputElement;
    const searchInput = document.querySelector('.search-input') as HTMLInputElement;

    if (expandableSearchInput) {
      expandableSearchInput.focus();
    } else if (enhancedSearchInput) {
      enhancedSearchInput.focus();
    } else if (searchInput) {
      searchInput.focus();
    }
  }
}

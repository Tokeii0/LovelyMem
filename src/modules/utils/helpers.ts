/**
 * 通用辅助工具模块
 * 提供常用的工具函数
 */

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取文件图标
 */
export function getFileIcon(file: {name: string; extension: string; is_dir: boolean}): string {
  if (file.is_dir) return '📁';
  
  switch (file.extension.toLowerCase()) {
    case 'csv': return '📊';
    case 'txt': return '📄';
    case 'log': return '📋';
    case 'json': return '🔧';
    case 'xml': return '📜';
    case 'html': return '🌐';
    case 'pdf': return '📕';
    case 'zip':
    case 'rar':
    case '7z': return '📦';
    case 'exe': return '⚙️';
    case 'dll': return '🔗';
    default: return '📄';
  }
}

/**
 * 检查是否为文本文件
 */
export function isTextFile(extension: string): boolean {
  const textExtensions = [
    'txt', 'log', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'ts',
    'py', 'cpp', 'c', 'h', 'hpp', 'java', 'php', 'rb', 'go', 'rs',
    'ini', 'conf', 'cfg', 'yaml', 'yml', 'toml', 'sql', 'sh', 'bat',
    'ps1', 'vbs', 'asm', 's', 'reg', 'properties', 'gitignore'
  ];
  return textExtensions.includes(extension.toLowerCase());
}

/**
 * 获取状态图标
 */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending': return '[...]';
    case 'running': return '[>>]';
    case 'completed': return '[OK]';
    case 'error': return '[!!]';
    default: return '[??]';
  }
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait) as any;
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 更新状态文本
 */
export function updateStatus(text: string): void {
  const statusText = document.querySelector('#task-status .status-text');
  if (statusText) {
    statusText.textContent = text;
  }

  // 自动记录重要状态到通知中心（过滤掉加载中等临时状态）
  if (text && text.length > 2) {
    const lower = text.toLowerCase();
    // 判断是否是有意义的完成/错误/成功消息
    const isError = lower.includes('失败') || lower.includes('错误') || lower.includes('error') || lower.includes('fail');
    const isSuccess = lower.includes('完成') || lower.includes('成功') || lower.includes('已保存') || lower.includes('已加载') || lower.includes('已导出');
    const isWarning = lower.includes('注意') || lower.includes('警告') || lower.includes('warn') || lower.includes('未找到');
    // 跳过临时状态如 "正在...", "加载中", "执行中" 等
    const isLoading = lower.includes('正在') || lower.includes('加载中') || lower.includes('执行中') || lower.includes('等待') || lower === '就绪';

    if (!isLoading && (isError || isSuccess || isWarning)) {
      const type = isError ? 'error' : isWarning ? 'warning' : 'success';
      import('../core/notificationCenter').then(({ notificationCenter }) => {
        notificationCenter.add(type, text);
      }).catch(() => {});
    }
  }
}

/**
 * 使元素可拖拽
 */
export function makeDraggable(element: HTMLElement, headerSelector: string = '.command-window-header'): void {
  const header = element.querySelector(headerSelector) as HTMLElement;
  if (!header) return;

  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    initialX = e.clientX - currentX;
    initialY = e.clientY - currentY;
    header.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      element.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'move';
    }
  });
} 
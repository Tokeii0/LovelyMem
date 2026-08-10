/**
 * 确保反馈类 UI 所需的样式已加载：
 *  - src/css/notification.css ：确认/输入/信息弹窗 + 按钮 spinner
 *  - src/css/components/toast.css ：MessageManager 统一 toast
 *
 * 这些样式在主窗口由 main.ts / modernStyles.css 引入，但各子窗口
 * （字符串搜索、图片查找等独立 WebviewWindow）通常只加载
 * 主题 CSS。由于弹窗 / toast / 按钮加载态会在这些子窗口中使用，
 * 这里做一次幂等注入，保证任意窗口里反馈 UI 都有正确样式。
 */
export function ensureFeedbackStyles(): void {
  // 弹窗 + 按钮 spinner（主窗口用 id "notification-styles" 注入）
  ensureStylesheet('notification-styles', 'src/css/notification.css', 'notification.css');
  // 统一 toast（主窗口经由 modernStyles.css 的 @import 引入，子窗口需单独保障）
  ensureStylesheet('feedback-toast-styles', 'src/css/components/toast.css', 'components/toast.css');
}

function ensureStylesheet(id: string, href: string, matchSubstr: string): void {
  if (document.getElementById(id)) return;
  // 已有指向同一文件的 <link> 则跳过（@import 引入的无法检测，但重复 link 指向同一文件无害）
  if (document.querySelector(`link[href*="${matchSubstr}"]`)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * 内嵌网页对话框
 * 用于显示内嵌网页内容
 */

import { WebViewConfig, defaultWebViewConfig } from './index.js';

export class WebViewDialog {
  private dialog: HTMLElement | null = null;
  private config: WebViewConfig;

  constructor(config: Partial<WebViewConfig> = {}) {
    this.config = { ...defaultWebViewConfig, ...config };
  }

  /**
   * 显示内嵌网页对话框
   */
  public async showWebView(): Promise<void> {
    try {
      this.createWebViewDialog();
    } catch (error) {
      console.error('显示内嵌网页失败:', error);
      this.showErrorMessage('显示内嵌网页失败，请稍后重试');
    }
  }

  /**
   * 创建内嵌网页对话框
   */
  private createWebViewDialog(): void {
    // 创建对话框容器
    this.dialog = document.createElement('div');
    this.dialog.className = 'webview-dialog-overlay';
    this.dialog.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      backdrop-filter: blur(5px);
    `;

    // 创建对话框内容
    const dialogContent = document.createElement('div');
    dialogContent.className = 'webview-dialog-content';
    dialogContent.style.cssText = `
      background: white;
      border-radius: 12px;
      width: ${this.config.width}px;
      height: ${this.config.height}px;
      max-width: 95vw;
      max-height: 95vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      ${this.config.resizable ? 'resize: both;' : ''}
    `;

    // 创建标题栏
    const titleBar = document.createElement('div');
    titleBar.className = 'webview-title-bar';
    titleBar.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 16px;
    `;

    const title = document.createElement('span');
    title.textContent = this.config.title;

    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 5px 10px;
      border-radius: 4px;
      transition: background-color 0.2s;
    `;
    closeButton.addEventListener('click', () => this.closeWebView());
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.backgroundColor = 'transparent';
    });

    titleBar.appendChild(title);
    titleBar.appendChild(closeButton);

    // 创建iframe容器
    const iframeContainer = document.createElement('div');
    iframeContainer.style.cssText = `
      flex: 1;
      position: relative;
      overflow: hidden;
    `;

    // 创建iframe
    const iframe = document.createElement('iframe');
    iframe.src = this.config.url;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    `;

    // 添加加载指示器
    const loadingIndicator = document.createElement('div');
    loadingIndicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      color: #666;
    `;
    loadingIndicator.innerHTML = `
      <div style="
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <span>正在加载...</span>
    `;

    // 添加旋转动画
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    iframeContainer.appendChild(loadingIndicator);
    iframeContainer.appendChild(iframe);

    // iframe加载完成后隐藏加载指示器
    iframe.addEventListener('load', () => {
      loadingIndicator.style.display = 'none';
    });

    // 组装对话框
    dialogContent.appendChild(titleBar);
    dialogContent.appendChild(iframeContainer);
    this.dialog.appendChild(dialogContent);

    // 添加到页面
    document.body.appendChild(this.dialog);

    // 绑定ESC键关闭
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.closeWebView();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    // 点击遮罩关闭
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) {
        this.closeWebView();
      }
    });
  }

  /**
   * 关闭内嵌网页对话框
   */
  public closeWebView(): void {
    if (this.dialog) {
      document.body.removeChild(this.dialog);
      this.dialog = null;
    }
  }

  /**
   * 显示错误消息
   */
  private showErrorMessage(message: string): void {
    // 创建简单的错误提示
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ff4757;
      color: white;
      padding: 15px 20px;
      border-radius: 8px;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(255, 71, 87, 0.3);
      font-size: 14px;
      max-width: 300px;
    `;
    errorDiv.textContent = message;

    document.body.appendChild(errorDiv);

    // 3秒后自动移除
    setTimeout(() => {
      if (document.body.contains(errorDiv)) {
        document.body.removeChild(errorDiv);
      }
    }, 3000);
  }
}

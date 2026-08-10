/**
 * EXIF查看器功能模块
 * 负责EXIF查看器的启动和管理
 */

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { StateManager } from '../core/stateManager';
import { MessageManager } from '../utils/message';
import { showFriendlyError } from '../utils/errorMessage';
import { updateStatus } from '../utils/helpers';

export class EXIFManager {
  private stateManager: StateManager;
  private exifWindow: WebviewWindow | null = null;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * 启动EXIF查看器
   */
  async openEXIFViewer(): Promise<void> {
    try {
      updateStatus('正在启动EXIF查看器...');
      
      // 检查是否已经有EXIF查看器窗口打开
      if (this.exifWindow) {
        try {
          await this.exifWindow.setFocus();
          MessageManager.showInfo('EXIF查看器已打开');
          return;
        } catch (error) {
          // 窗口可能已关闭，重置引用
          this.exifWindow = null;
        }
      }

      // 创建新的EXIF查看器窗口
      this.exifWindow = new WebviewWindow('exif-viewer', {
        url: '/exif-viewer.html',
        title: 'EXIF查看器 - Lovelymem V2',
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        maximizable: true,
        minimizable: true,
        closable: true,
        center: true,
        decorations: false, // 移除系统默认标题栏
        alwaysOnTop: false,
        skipTaskbar: false,
        theme: 'auto' as any,
        transparent: false,
        shadow: true
      });

      // 监听窗口事件
      this.setupWindowEventListeners();

      // 等待窗口创建完成
      await this.exifWindow.once('tauri://created', () => {
        console.log('✅ EXIF查看器窗口创建成功');
        updateStatus('EXIF查看器已启动');
        MessageManager.showSuccess('EXIF查看器启动成功');
      });

      // 监听窗口关闭事件
      await this.exifWindow.once('tauri://close-requested', () => {
        console.log('🔒 EXIF查看器窗口即将关闭');
        this.exifWindow = null;
        updateStatus('EXIF查看器已关闭');
      });

      // 添加到命令历史
      const commandId = Date.now() + Math.random();
      this.stateManager.addCommandHistory({
        id: commandId,
        name: 'EXIF查看器',
        command: 'exif-viewer',
        status: 'completed'
      });

      this.stateManager.addCommandOutput('✅ EXIF查看器启动成功');

    } catch (error) {
      console.error('❌ 启动EXIF查看器失败:', error);
      updateStatus('启动EXIF查看器失败');
      this.stateManager.addCommandOutput(`❌ 启动EXIF查看器失败: ${error}`);
      showFriendlyError(error, '启动 EXIF 查看器');
      
      // 重置窗口引用
      this.exifWindow = null;
    }
  }

  /**
   * 设置窗口事件监听器
   */
  private setupWindowEventListeners(): void {
    if (!this.exifWindow) return;

    // 监听窗口错误事件
    this.exifWindow.once('tauri://error', (event) => {
      console.error('❌ EXIF查看器窗口错误:', event);
      MessageManager.showError('EXIF查看器窗口发生错误');
      this.exifWindow = null;
    });

    // 监听窗口焦点事件
    this.exifWindow.listen('tauri://focus', () => {
      console.log('🔍 EXIF查看器窗口获得焦点');
    });

    // 监听窗口失去焦点事件
    this.exifWindow.listen('tauri://blur', () => {
      console.log('🔍 EXIF查看器窗口失去焦点');
    });
  }

  /**
   * 关闭EXIF查看器
   */
  async closeEXIFViewer(): Promise<void> {
    try {
      if (this.exifWindow) {
        await this.exifWindow.close();
        this.exifWindow = null;
        updateStatus('EXIF查看器已关闭');
        MessageManager.showInfo('EXIF查看器已关闭');
      } else {
        MessageManager.showInfo('EXIF查看器未打开');
      }
    } catch (error) {
      console.error('❌ 关闭EXIF查看器失败:', error);
      showFriendlyError(error, '关闭 EXIF 查看器');
    }
  }

  /**
   * 检查EXIF查看器是否打开
   */
  isEXIFViewerOpen(): boolean {
    return this.exifWindow !== null;
  }

  /**
   * 获取EXIF查看器窗口引用
   */
  getEXIFViewerWindow(): WebviewWindow | null {
    return this.exifWindow;
  }

  /**
   * 向EXIF查看器发送消息
   */
  async sendMessageToEXIFViewer(message: any): Promise<void> {
    try {
      if (this.exifWindow) {
        await this.exifWindow.emit('exif-message', message);
        console.log('📤 向EXIF查看器发送消息:', message);
      } else {
        console.warn('⚠️ EXIF查看器未打开，无法发送消息');
      }
    } catch (error) {
      console.error('❌ 向EXIF查看器发送消息失败:', error);
    }
  }

  /**
   * 打开指定文件的EXIF信息
   */
  async openFileInEXIFViewer(filePath: string): Promise<void> {
    try {
      // 确保EXIF查看器已打开
      if (!this.exifWindow) {
        await this.openEXIFViewer();
        // 等待窗口完全加载
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 向EXIF查看器发送文件路径
      await this.sendMessageToEXIFViewer({
        type: 'open-file',
        filePath: filePath
      });

      updateStatus(`正在查看文件EXIF信息: ${filePath}`);
      MessageManager.showInfo(`正在查看文件EXIF信息`);

    } catch (error) {
      console.error('❌ 在EXIF查看器中打开文件失败:', error);
      showFriendlyError(error, '打开文件');
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      if (this.exifWindow) {
        await this.exifWindow.close();
        this.exifWindow = null;
      }
      console.log('🧹 EXIF管理器资源清理完成');
    } catch (error) {
      console.error('❌ EXIF管理器资源清理失败:', error);
    }
  }
}

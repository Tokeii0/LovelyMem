/**
 * 文本查看器功能模块
 * 处理文本文件查看和相关功能
 */

import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings } from '../core/settingsHelper';
import { MessageManager } from '../utils/message';
import { showFriendlyError } from '../utils/errorMessage';
import { ProgressManager } from '../utils/progress';
import { updateStatus } from '../utils/helpers';
import { StateManager } from '../core/stateManager';
import { translate } from '../../i18n';

export class TextManager {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * 处理文本查看器功能
   */
  handleTextViewerFeature(): void {
    console.log('启动文本查看器功能');
    
    // 创建文本查看器功能模态框
    const modal = document.createElement('div');
    modal.className = 'text-feature-modal';
    modal.innerHTML = `
      <style>
        .text-feature-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(5px);
        }
        
        .text-feature-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 700px;
          max-height: 80vh;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          animation: modalAppear 0.3s ease-out;
        }
        
        @keyframes modalAppear {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .text-feature-header {
          padding: 24px;
          border-bottom: 1px solid #e9ecef;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        
        .text-feature-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        
        .text-feature-close {
          background: rgba(255,255,255,0.2);
          color: white;
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        
        .text-feature-close:hover {
          background: rgba(255,255,255,0.3);
        }
        
        .text-feature-body {
          padding: 24px;
          overflow-y: auto;
          max-height: calc(80vh - 120px);
        }

        .text-feature-intro {
          text-align: center;
          margin-bottom: 30px;
          padding: 20px;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border-radius: 8px;
        }

        .text-feature-intro h3 {
          color: #495057;
          margin-bottom: 8px;
          font-size: 20px;
        }

        .text-feature-intro p {
          color: #6c757d;
          margin: 0;
          line-height: 1.5;
        }
        
        .text-controls {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
        }
        
        .text-btn {
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
          min-width: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .text-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .text-btn.primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        
        .text-btn.secondary {
          background: #6c757d;
          color: white;
        }
        
        .text-btn.secondary:hover {
          background: #545b62;
        }
        
        .text-option-group {
          display: flex;
          gap: 12px;
          width: 100%;
          justify-content: center;
        }
        
        .text-option-group .text-btn {
          flex: 1;
          min-width: auto;
        }
      </style>
      
      <div class="text-feature-content">
        <div class="text-feature-header">
          <h2>📄 文本查看器</h2>
          <button class="text-feature-close" title="关闭">×</button>
        </div>
        <div class="text-feature-body">
          <div class="text-feature-intro">
            <h3>功能特性</h3>
            <p>支持多种文本格式查看，包括普通文本、十六进制和二进制模式，支持大文件分页浏览</p>
          </div>
          <div class="text-controls">
            <button id="open-text-file-btn" class="text-btn primary">
              📂 选择文本文件
            </button>
            <div class="text-option-group">
              <button id="open-test-file-btn" class="text-btn secondary">
                🧪 查看测试文件
              </button>
              <button id="open-readme-btn" class="text-btn secondary">
                📋 查看README
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 设置事件监听器
    const openTextFileBtn = modal.querySelector('#open-text-file-btn') as HTMLButtonElement;
    const openTestFileBtn = modal.querySelector('#open-test-file-btn') as HTMLButtonElement;
    const openReadmeBtn = modal.querySelector('#open-readme-btn') as HTMLButtonElement;

    openTextFileBtn?.addEventListener('click', async () => {
      try {
        await this.openTextViewer();
        this.closeTextModal(modal);
      } catch (error) {
        console.error('打开文本文件失败:', error);
      }
    });

    openTestFileBtn?.addEventListener('click', async () => {
      try {
        await this.openTextViewer('test_text.txt', '测试文本文件');
        this.closeTextModal(modal);
      } catch (error) {
        console.error('打开测试文件失败:', error);
      }
    });

    openReadmeBtn?.addEventListener('click', async () => {
      try {
        await this.openTextViewer('README.md', 'README文档');
        this.closeTextModal(modal);
      } catch (error) {
        console.error('打开README失败:', error);
      }
    });

    // 关闭按钮事件
    const closeBtn = modal.querySelector('.text-feature-close');
    closeBtn?.addEventListener('click', () => this.closeTextModal(modal));
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeTextModal(modal);
      }
    });

    // ESC键关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeTextModal(modal);
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    document.body.appendChild(modal);
    MessageManager.showSuccess('文本查看器功能已启动');
  }

  /**
   * 关闭文本模态框
   */
  private closeTextModal(modal: HTMLElement): void {
    document.body.removeChild(modal);
  }

  /**
   * 通用的文本查看器处理函数
   */
  async openTextViewer(textFileName?: string, displayName?: string): Promise<void> {
    try {
      let textPath: string;
      let title: string;
      
      if (textFileName) {
        // 获取用户设置中的输出路径
        const settings = await loadAppSettings();
        const outputPath = settings.output_path || 'output';
        textPath = `${outputPath}\\${textFileName}`;
        title = `LovelyText - ${displayName || textFileName}`;
      } else {
        // 打开文件选择对话框
        const result = await invoke('select_file_path', { 
          title: translate('选择文本文件'),
          filters: ['txt', 'log', 'md', 'json', 'xml', 'html', 'css', 'js', 'py', 'cpp', 'c', 'h', 'ini', 'conf', 'cfg', 'yaml', 'sql']
        }) as string | null;
        
        if (!result) {
          return; // 用户取消了选择
        }
        
        textPath = result;
        title = `LovelyText - ${result.split('\\').pop() || translate('文本文件')}`;
      }
      
      //ProgressManager.show(`正在打开文本查看器...`);
      
      // 调用后端命令打开文本查看器
      await invoke('open_text_viewer', {
        textFilePath: textPath,
        windowTitle: title
      });
      
      ProgressManager.hide();
      updateStatus(`文本查看器已打开`);
      this.stateManager.addCommandOutput(`📄 文本查看器已打开: ${textPath}`);
      MessageManager.showSuccess(`文本查看器已打开`);
      
    } catch (error) {
      ProgressManager.hide();
      console.error(`打开文本查看器失败:`, error);
      updateStatus(`打开文本查看器失败`);
      showFriendlyError(error, '打开文本文件');
      this.stateManager.addCommandOutput(`❌ 打开文本查看器失败: ${error}`);
    }
  }

  /**
   * 从文件管理器打开文本文件
   */
  async openTextFromManager(fileName: string): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      await invoke('open_text_viewer', {
        textFilePath: `${outputPath}\\${fileName}`,
        windowTitle: `文本查看器 - ${fileName}`
      });
      MessageManager.showSuccess(`已打开文本文件: ${fileName}`);
    } catch (error) {
      console.error('打开文本文件失败:', error);
      MessageManager.showError(`打开文本文件失败: ${error}`);
    }
  }
}

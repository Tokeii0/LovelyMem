/**
 * CSV功能模块
 * 处理CSV文件查看和相关功能
 */

import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings } from '../core/settingsHelper';
import { csvExample } from './csv/csvExample';
import { MessageManager } from '../utils/message';
import { showFriendlyError } from '../utils/errorMessage';
import { ProgressManager } from '../utils/progress';
import { updateStatus } from '../utils/helpers';
import { StateManager } from '../core/stateManager';

export class CSVManager {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * 处理CSV读取功能
   */
  handleCSVReaderFeature(): void {
    console.log('启动CSV读取功能');
    
    // 创建CSV功能模态框
    const modal = document.createElement('div');
    modal.className = 'csv-feature-modal';
    modal.innerHTML = `
      <style>
        .csv-feature-modal {
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
        
        .csv-feature-content {
          background: white;
          border-radius: 12px;
          width: 90%;
          max-width: 800px;
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
        
        .csv-feature-header {
          padding: 24px;
          border-bottom: 1px solid #e9ecef;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        
        .csv-feature-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        
        .csv-feature-close {
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
        
        .csv-feature-close:hover {
          background: rgba(255,255,255,0.3);
        }
        
        .csv-feature-body {
          padding: 24px;
          overflow-y: auto;
          max-height: calc(80vh - 120px);
        }

        .csv-feature-intro {
          text-align: center;
          margin-bottom: 30px;
          padding: 20px;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border-radius: 8px;
        }

        .csv-feature-intro h3 {
          color: #495057;
          margin-bottom: 8px;
          font-size: 20px;
        }

        .csv-feature-intro p {
          color: #6c757d;
          margin: 0;
          line-height: 1.5;
        }
      </style>
      
      <div class="csv-feature-content">
        <div class="csv-feature-header">
          <h2>📊 CSV数据处理器</h2>
          <button class="csv-feature-close" title="关闭">×</button>
        </div>
        <div class="csv-feature-body">
          <div class="csv-feature-intro">
            <h3>功能特性</h3>
            <p>支持CSV文件读取、数据解析、表格预览、搜索过滤和独立窗口查看等功能</p>
          </div>
          <div id="csv-controls-container"></div>
        </div>
      </div>
    `;

    // 添加CSV控件
    const csvControlsContainer = modal.querySelector('#csv-controls-container');
    if (csvControlsContainer) {
      const csvControls = csvExample.createCSVButtons();
      csvControlsContainer.appendChild(csvControls);
    }

    // 关闭按钮事件
    const closeBtn = modal.querySelector('.csv-feature-close');
    const closeModal = () => {
      document.body.removeChild(modal);
    };

    closeBtn?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    // ESC键关闭
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    document.body.appendChild(modal);
    MessageManager.showSuccess('CSV功能已启动');
  }

  /**
   * 通用的CSV查看器处理函数
   */
  async openCSVViewer(csvFileName: string, displayName: string): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      const csvPath = `${outputPath}\\${csvFileName}`;
      
      ProgressManager.show(`正在打开${displayName}查看器...`);

      // 调用后端命令打开CSV查看器
      await invoke('open_csv_viewer', {
        csvFilePath: csvPath,
        windowTitle: `MemProcFS - ${displayName}`
      });
      
      ProgressManager.hide();
      updateStatus(`${displayName}查看器已打开`);
      this.stateManager.addCommandOutput(`📊 ${displayName}查看器已打开: ${csvPath}`);
      MessageManager.showSuccess(`${displayName}查看器已打开`);
      
    } catch (error) {
      ProgressManager.hide();
      console.error(`打开${displayName}查看器失败:`, error);
      updateStatus(`打开${displayName}查看器失败`);
      showFriendlyError(error, '打开CSV查看器');
      this.stateManager.addCommandOutput(`❌ 打开${displayName}查看器失败: ${error}`);
    }
  }

  /**
   * 从文件管理器打开CSV文件
   */
  async openCSVFromManager(fileName: string): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      await invoke('open_csv_viewer', {
        csvFilePath: `${outputPath}\\${fileName}`,
        windowTitle: `CSV查看器 - ${fileName}`
      });
      MessageManager.showSuccess(`已打开CSV文件: ${fileName}`);
    } catch (error) {
      console.error('打开CSV文件失败:', error);
      showFriendlyError(error, '打开CSV文件');
    }
  }
}
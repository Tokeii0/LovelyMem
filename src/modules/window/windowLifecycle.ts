/**
 * 窗口生命周期管理器
 * 负责窗口控制、关闭确认、平台样式加载等窗口相关功能
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from '@tauri-apps/api/event';
import { getMountLetter } from '../core/mountDrive';

import { showCloseConfirmDialog } from '../ui/closeAnimation';
import { showConfirm } from '../core/confirmDialog';
import { MessageManager } from '../utils/message';

export class WindowLifecycle {
  private closeConfirmListenerSetup: boolean = false;

  /**
   * 设置关闭确认对话框监听器
   */
  async setupCloseConfirmation(): Promise<void> {
    if (this.closeConfirmListenerSetup) {
      console.log('⚠️ 关闭确认监听器已设置，跳过重复设置');
      return;
    }

    try {
      // 监听关闭确认事件（当用户点击窗口X按钮或按Alt+F4时触发）
      await listen('show-close-confirmation', async () => {
        console.log('🚪 收到关闭确认请求');

        // 显示确认对话框
        const confirmed = await showCloseConfirmDialog();

        if (confirmed) {
          console.log('✅ 用户确认关闭，执行清理并退出');
          // 直接调用后端关闭（后端会 kill 进程、清空 output_path、退出）
          await invoke('confirm_close_application');
        } else {
          console.log('❌ 用户取消关闭');
          await invoke('cancel_close_application');
        }
      });

      this.closeConfirmListenerSetup = true;
      console.log('✅ 关闭确认对话框已设置');
    } catch (error) {
      console.error('❌ 设置关闭确认对话框失败:', error);
    }
  }

  /**
   * 加载平台特定样式文件
   */
  loadPlatformStyles(): void {
    if (document.getElementById('platform-styles')) {
      return;
    }

    const link = document.createElement('link');
    link.id = 'platform-styles';
    link.rel = 'stylesheet';
    link.href = 'src/css/platform-styles.css';
    document.head.appendChild(link);
  }

  /**
   * 加载内联样式文件
   */
  loadInlineStyles(): void {
    if (document.getElementById('inline-styles')) {
      return;
    }

    const link = document.createElement('link');
    link.id = 'inline-styles';
    link.rel = 'stylesheet';
    link.href = 'src/css/inline-styles.css';
    document.head.appendChild(link);

    // 加载平台特定样式
    this.loadPlatformStyles();
  }

  /**
   * 显示自定义模态框
   */
  showCustomModal(title: string, message: string, type: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
    return new Promise((resolve) => {
      const modalId = 'custom-modal-' + Date.now();
      const modalHtml = `
        <div id="${modalId}" class="custom-modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); z-index: 20000; display: flex; justify-content: center; align-items: center; backdrop-filter: blur(5px);">
          <div class="custom-modal-content" style="background: var(--bg-secondary, #1e1e1e); border: 1px solid var(--border-color, #333); border-radius: 8px; padding: 24px; width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); animation: modalFadeIn 0.3s ease-out;">
            <div class="custom-modal-header" style="display: flex; align-items: center; margin-bottom: 16px;">
              <span class="custom-modal-icon" style="font-size: 24px; margin-right: 12px;">${type === 'warning' ? '⚠️' : type === 'error' ? '❌' : 'ℹ️'}</span>
              <h3 style="margin: 0; font-size: 18px; color: var(--text-primary, #fff); font-weight: 600;">${title}</h3>
            </div>
            <div class="custom-modal-body" style="margin-bottom: 24px; color: var(--text-secondary, #ccc); line-height: 1.6; font-size: 14px;">
              ${message}
            </div>
            <div class="custom-modal-footer" style="display: flex; justify-content: flex-end;">
              <button id="${modalId}-btn" style="background: var(--accent-color, #3b82f6); color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: 500; transition: opacity 0.2s; font-size: 14px;">确定</button>
            </div>
          </div>
        </div>
        <style>
          @keyframes modalFadeIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          #${modalId}-btn:hover { opacity: 0.9; }
        </style>
      `;

      const div = document.createElement('div');
      div.innerHTML = modalHtml;
      document.body.appendChild(div);

      const btn = document.getElementById(`${modalId}-btn`);
      if (btn) {
        btn.addEventListener('click', () => {
          const modal = document.getElementById(modalId);
          if (modal) {
            modal.remove();
          }
          resolve();
        });
      }
    });
  }

  /**
   * 软件启动自检：
   *  1) Dokan2 驱动/服务是否正常（MemProcFS 挂载盘符的依赖）；
   *  2) 挂载盘是否异常存在 / 是否有残留 MemProcFS 进程（上次异常退出会驻留并占用挂载盘），
   *     发现残留时提供「一键终止」清理。
   * 健康时静默，仅在发现问题时提示。
   */
  async runStartupSelfCheck(): Promise<void> {
    // ① Dokan 环境
    try {
      const isDokanAvailable = await invoke('check_dokan_status');
      if (isDokanAvailable) {

      } else {
        await this.showCustomModal(
          '环境检测提示',
          '检测到系统未安装 Dokan2 环境或服务未启动。<br><br>本软件依赖 Dokan2 运行，请安装 Dokan2 驱动程序以确保功能正常使用。',
          'warning'
        );
      }
    } catch (error) {
      console.error('Dokan 环境检测失败:', error);
    }

    // ② 挂载盘 / 残留 MemProcFS 进程自检
    try {
      const driveLabel = `${getMountLetter()}:`;
      const mMounted = (await invoke('check_m_drive_available')) as boolean;
      let residual = 0;
      try {
        const procs = (await invoke('get_monitored_processes')) as Array<{ pid: number; name: string }>;
        residual = (procs || []).filter(p => /memprocfs/i.test(p.name)).length;
      } catch {
        /* 进程检测失败则忽略 */
      }

      // 启动时正常情况下挂载盘不应存在、也不该有 MemProcFS 在跑；任一成立都视为异常
      if (residual > 0 || mMounted) {
        const detail = residual > 0
          ? `检测到 <b>${residual}</b> 个 MemProcFS 进程正在运行${mMounted ? `，且 ${driveLabel} 盘已被占用` : ''}。`
          : `检测到 ${driveLabel} 盘已被占用，但未发现 MemProcFS 进程（可能是残留挂载，或 ${driveLabel} 为你的真实磁盘）。`;
        const message = `${detail}<br><br>这通常是上次<b>异常退出</b>导致 MemProcFS 驻留并占用了 ${driveLabel}，会使下次加载内存镜像失败。<br><br>是否立即<b>一键终止</b>残留进程并释放 ${driveLabel}？（若 ${driveLabel} 是你的真实磁盘，请选择“忽略”）`;
        const ok = await showConfirm({
          title: '启动自检：MemProcFS 残留 / 挂载盘异常',
          message,
          confirmText: '一键终止并清理',
          cancelText: '忽略',
          type: 'warning',
        });
        if (ok) {
          try {
            const result = (await invoke('force_cleanup_and_clear', { clearOutput: false })) as string;
            MessageManager.showSuccess(`已清理残留进程：${result}`);
          } catch (e) {
            MessageManager.showError(`清理残留进程失败：${e}`);
          }
        }
      }
    } catch (error) {
      console.error('挂载盘自检失败:', error);
    }
  }
}

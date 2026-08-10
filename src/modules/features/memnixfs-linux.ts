/**
 * MemNixFS（Linux 内存取证）功能模块
 *
 * 镜像 MemProcFSManager 的范式，但走"挂载浏览"：feature 直接读挂载点（M:\sys、M:\forensic 等），
 * 而非 output 目录。通过 memnixfsForensicItems 声明式注册表 + 通用 view 分发器路由。
 */

import { invoke } from '@tauri-apps/api/core';
import { mountPath } from '../core/mountDrive';
import { getMountLetter } from '../core/mountDrive';
import { MessageManager } from '../utils/message';
import { ProgressManager } from '../utils/progress';
import { updateStatus } from '../utils/helpers';
import { showConfirm } from '../core/confirmDialog';
import { StateManager } from '../core/stateManager';
import { memnixfsForensicItems } from '../areas/memnixfsArea';

/** 与后端 memnixfs::LinuxLoadResult 对应 */
interface LinuxLoadResult {
  success: boolean;
  message: string;
  process_id?: number | null;
  command: string;
  output: string;
  error: string;
  kernel_banner?: string | null;
  symbols_resolved: boolean;
}

export class MemNixFSManager {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  private getModernUIRenderer(): any {
    return (window as any).modernUIRenderer;
  }

  /**
   * 功能分发器：按声明式注册表的 view 字段路由。
   * 新增取证项只需往 memnixfsForensicItems 加一行，无需改这里。
   */
  async handleFeature(featureId: string): Promise<void> {
    const item = memnixfsForensicItems.find((i) => i.id === featureId);
    if (!item) {
      updateStatus(`未知的 MemNixFS 功能: ${featureId}`);
      return;
    }

    // 操作类（按 id 显式处理）
    switch (item.id) {
      case 'memnixfs-load_image':
        await this.loadLinuxImage();
        return;
      case 'memnixfs-unload':
        await this.unloadLinuxImage();
        return;
      case 'memnixfs-export_reports':
        await this.exportReports();
        return;
    }

    // 查看类（按 view 路由）
    switch (item.view) {
      case 'csv':
        if (item.vfsPath) await this.openCSVViewerAtMount(item.vfsPath, item.name);
        break;
      case 'text':
        if (item.vfsPath) await this.openTextViewerAtMount(item.vfsPath, item.name);
        break;
      case 'file-browser':
        await this.openFsBrowser();
        break;
      default:
        updateStatus(`暂不支持的功能: ${item.name}`);
    }
  }

  /**
   * 加载 Linux 内存镜像（通过 MemNixFS 挂载）
   */
  async loadLinuxImage(): Promise<void> {
    try {
      ProgressManager.show('正在选择 Linux 内存镜像...');
      const result = (await invoke('load_image_file')) as { path: string; name: string; size: number } | null;
      if (!result) {
        ProgressManager.hide();
        updateStatus('已取消选择');
        return;
      }
      this.stateManager.setCurrentImage(result);

      // 挂载盘互斥：清理占用 M: 盘的 MemProcFS/MemNixFS 残留
      if (!(await this.ensureExclusiveMount())) {
        ProgressManager.hide();
        updateStatus('已取消加载');
        return;
      }

      await invoke('set_current_image_path_command', { imagePath: result.path });

      ProgressManager.show('正在通过 MemNixFS 挂载 Linux 内存镜像（取证预热可能需要一些时间）...');
      this.stateManager.addCommandOutput(`🐧 开始加载 Linux 镜像: ${result.path}`);

      const loadResult = (await invoke('load_linux_memory_image', { imagePath: result.path })) as LinuxLoadResult;
      ProgressManager.hide();

      if (loadResult.success) {
        updateStatus('Linux 内存镜像已挂载');
        this.stateManager.addCommandOutput(`✅ ${loadResult.message}`);
        if (loadResult.kernel_banner) {
          this.stateManager.addCommandOutput(`🧬 内核: ${loadResult.kernel_banner}`);
        }
        MessageManager.showSuccess('Linux 内存镜像已挂载，点击功能卡片查看取证数据');
        try {
          this.getModernUIRenderer()?.updateMainWorkspace?.();
        } catch {
          /* 刷新工作区失败不影响主流程 */
        }
      } else {
        updateStatus('加载失败');
        this.stateManager.addCommandOutput(`❌ ${loadResult.message}`);
        MessageManager.showError(loadResult.message || '加载 Linux 镜像失败');
      }
    } catch (error) {
      ProgressManager.hide();
      updateStatus('加载 Linux 镜像失败');
      MessageManager.showError(`加载失败: ${error}`);
      this.stateManager.addCommandOutput(`❌ 加载 Linux 镜像失败: ${error}`);
    }
  }

  /**
   * 卸载 Linux 内存镜像（停止 MemNixFS、清空输出）
   */
  async unloadLinuxImage(): Promise<void> {
    try {
      ProgressManager.show('正在卸载 Linux 内存镜像...');
      const result = (await invoke('force_cleanup_and_clear', { clearOutput: true })) as string;
      ProgressManager.hide();
      this.stateManager.addCommandOutput(`✅ ${result}`);
      updateStatus('已卸载 Linux 内存镜像');
      MessageManager.showSuccess('已卸载 Linux 内存镜像');
    } catch (error) {
      ProgressManager.hide();
      updateStatus('卸载失败');
      MessageManager.showError(`卸载失败: ${error}`);
    }
  }

  /**
   * 导出关键取证报告到 output 目录（持久化用）
   */
  private async exportReports(): Promise<void> {
    try {
      ProgressManager.show('正在导出关键取证报告...');
      const result = (await invoke('export_key_forensic_reports')) as string;
      ProgressManager.hide();
      this.stateManager.addCommandOutput(`📦 ${result}`);
      updateStatus(result);
      MessageManager.showSuccess(result);
    } catch (error) {
      ProgressManager.hide();
      updateStatus('导出取证报告失败');
      MessageManager.showError(`导出失败（请确认已加载 Linux 镜像）: ${error}`);
    }
  }

  /**
   * 直接从挂载点打开 CSV 查看器
   */
  private async openCSVViewerAtMount(segments: string[], displayName: string): Promise<void> {
    try {
      const csvPath = mountPath(...segments);
      await invoke('open_csv_viewer', {
        csvFilePath: csvPath,
        windowTitle: `MemNixFS - ${displayName}`,
      });
      updateStatus(`${displayName}查看器已打开`);
      this.stateManager.addCommandOutput(`📊 ${displayName}查看器已打开: ${csvPath}`);
      MessageManager.showSuccess(`${displayName}查看器已打开`);
    } catch (error) {
      updateStatus(`打开${displayName}查看器失败`);
      this.stateManager.addCommandOutput(`❌ 打开${displayName}失败: ${error}`);
      MessageManager.showError(`打开失败（请确认已加载 Linux 镜像、该取证项已生成）: ${error}`);
    }
  }

  /**
   * 直接从挂载点打开文本查看器
   */
  private async openTextViewerAtMount(segments: string[], displayName: string): Promise<void> {
    try {
      const textPath = mountPath(...segments);
      await invoke('open_text_viewer', {
        textFilePath: textPath,
        windowTitle: `MemNixFS - ${displayName}`,
      });
      updateStatus(`${displayName}查看器已打开`);
      this.stateManager.addCommandOutput(`📄 ${displayName}查看器已打开: ${textPath}`);
      MessageManager.showSuccess(`${displayName}查看器已打开`);
    } catch (error) {
      updateStatus(`打开${displayName}查看器失败`);
      this.stateManager.addCommandOutput(`❌ 打开${displayName}失败: ${error}`);
      MessageManager.showError(`打开失败（请确认已加载 Linux 镜像、该取证项已生成）: ${error}`);
    }
  }

  /**
   * 打开文件管理器浏览挂载盘（M:\fs、M:\proc 等）
   */
  private async openFsBrowser(): Promise<void> {
    try {
      await invoke('open_file_manager');
      updateStatus('文件管理器已打开');
      this.stateManager.addCommandOutput(`🗂️ 文件管理器已打开，可浏览 ${getMountLetter()}:\\fs、${getMountLetter()}:\\proc`);
    } catch (error) {
      updateStatus('打开文件管理器失败');
      MessageManager.showError(`打开文件管理器失败: ${error}`);
    }
  }

  /**
   * 挂载盘互斥：加载前清理占用挂载盘的 MemProcFS/MemNixFS 残留。
   * 返回 true 表示可继续，false 表示用户取消。
   */
  private async ensureExclusiveMount(): Promise<boolean> {
    let residual = 0;
    try {
      const procs = (await invoke('get_monitored_processes')) as Array<{ pid: number; name: string }>;
      residual = (procs || []).filter((p) => /memprocfs|memnixfs/i.test(p.name)).length;
    } catch {
      return true; // 检测失败不拦截
    }
    if (residual === 0) return true;

    const driveLabel = `${getMountLetter()}:`;
    const proceed = await showConfirm({
      title: '检测到正在挂载的内存取证进程',
      message: `检测到 ${residual} 个正在运行的 MemProcFS/MemNixFS 进程，仍占用 ${driveLabel} 盘。\n加载 Linux 镜像前需要先清理，否则会因 ${driveLabel} 被占用而失败。\n是否立即清理并继续？`,
      confirmText: '清理并继续',
      cancelText: '取消',
      type: 'warning',
    });
    if (!proceed) return false;

    try {
      ProgressManager.show('正在清理占用挂载盘的进程...');
      const result = (await invoke('force_cleanup_and_clear', { clearOutput: true })) as string;
      this.stateManager.addCommandOutput(`🧹 ${result}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return true;
    } catch (e) {
      ProgressManager.hide();
      MessageManager.showError(`清理残留进程失败: ${e}`);
      return false;
    }
  }
}

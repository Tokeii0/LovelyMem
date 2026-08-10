/**
 * 镜像文件处理功能模块
 * 负责镜像文件的加载、卸载和MemProcFS操作
 */

import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings } from '../core/settingsHelper';
import { getMountLetter } from '../core/mountDrive';
import { StateManager } from '../core/stateManager';
import { MessageManager } from '../utils/message';
import { showFriendlyError } from '../utils/errorMessage';
import { showConfirm } from '../core/confirmDialog';
import { ProgressManager } from '../utils/progress';
import { updateStatus } from '../utils/helpers';
import { recentSessions } from '../core/recentSessions';


export class ImageManager {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  // 获取 ModernUIRenderer 实例的辅助方法
  private getModernUIRenderer(): any {
    return (window as any).modernUIRenderer;
  }

  /**
   * 加载镜像文件
   */
  async loadImageFile(forceOs?: 'windows' | 'linux'): Promise<void> {

    try {
      ProgressManager.show('正在选择镜像文件...');

      const result = await invoke('load_image_file') as { path: string; name: string; size: number } | null;

      if (result) {
        this.stateManager.setCurrentImage(result);
        recentSessions.addSession(result.path, result.name, result.size);

        // 决定镜像类型：用户在欢迎页显式选择(载入 Windows/Linux)时优先采用，否则自动探测。
        // Linux 镜像(LiME/AVML/ELF)改走 MemNixFS(MemProcFS 无法解析)。
        let osType: string | null = forceOs ?? null;
        if (!osType) {
          try {
            osType = await invoke('detect_memory_image_os', { imagePath: result.path }) as string;
          } catch (e) {
            console.warn('镜像类型探测失败，按 Windows(MemProcFS) 流程继续:', e);
          }
        }
        if (osType === 'linux') {
          await this.loadLinuxImageByPath(result);
          return;
        }

        // 加载前检测/清理残留的 MemProcFS 进程(上次异常退出会驻留并占用挂载盘)
        if (!(await this.ensureNoResidualMemProcFS())) {
          updateStatus('已取消加载');
          return;
        }

        // 触发加载动画
        const renderer = this.getModernUIRenderer();
        if (renderer) {
          // 确保渲染器状态已更新
          renderer.setImageLoadingEngine?.('memprocfs');
          renderer.updateState(this.stateManager.getState());
          renderer.updateImageLoadingStatus('loading', `正在加载镜像: ${result.name}`);
        }

        // 开始加载镜像到MemProcFS
        ProgressManager.show('正在启动MemProcFS加载镜像...');

        // 添加命令到历史记录（pending状态）
        const commandId = Date.now() + Math.random();
        const settings = await loadAppSettings();
        let memprocfsCommand = `${settings.memprocfs_path || 'memprocfs.exe'} -device "${result.path}" -v -license-accept-elastic-license-2-0 -forensic 1 -pythonpath ${settings.python3_path}`;

        // 如果启用了YARA扫描，添加到命令显示中
        if (settings.yara_enabled && settings.yara_rules_path) {
          memprocfsCommand += ` -forensic-yara-rules "${settings.yara_rules_path}"`;
        }

        this.stateManager.addCommandHistory({
          id: commandId,
          name: `加载镜像: ${result.name}`,
          command: memprocfsCommand,
          status: 'pending'
        });

        try {
          // 更新状态为运行中
          this.stateManager.updateCommandStatus(commandId, 'running');

          const loadResult = await invoke('load_memory_image', { imagePath: result.path }) as {
            success: boolean;
            message: string;
            process_id?: number;
            command: string;
            output: string;
            error: string;
            profile_info?: {
              detected_os?: string;
              suggested_profile?: string;
              profile_list: string[];
            };
          };

          console.log('🔍 加载结果:', loadResult);
          console.log('🔍 Profile信息详情:', loadResult.profile_info);

          if (loadResult.success) {
            ProgressManager.hide();
            updateStatus(`MemProcFS启动成功: ${result.name}`);
            this.stateManager.addCommandOutput(`✅ MemProcFS启动成功 - ${loadResult.message}`);

            // 触发成功动画
            if (renderer) {
              // 确保切换到 MemProcFS 区域并重置 Tab，确保显示主工作区
              this.stateManager.updateSelectedModule(0);
              this.stateManager.updateState({ currentTab: 'dashboard' });

              // 确保渲染器状态已更新
              renderer.updateState(this.stateManager.getState());
              renderer.updateImageLoadingStatus('completed', `镜像加载完成: ${result.name}`);
            }

            // 更新命令状态为完成，并保存输出
            this.stateManager.updateCommandStatus(commandId, 'completed');

            // 更新命令记录的详细信息
            const commandHistory = this.stateManager.getCommandHistory();
            const command = commandHistory.find(cmd => cmd.id === commandId);
            if (command) {
              command.output = loadResult.output || "无输出内容";
              command.error = loadResult.error || "";
              if (loadResult.process_id) {
                command.processId = loadResult.process_id;
              }
              console.log('✅ 命令记录已更新:', command);
            }

            if (loadResult.process_id) {
              // 保存进程ID以便后续管理
              this.stateManager.setMemProcFSProcessId(loadResult.process_id);
              this.stateManager.addCommandOutput(`📊 进程ID: ${loadResult.process_id}`);
            }

            // 处理profile信息
            console.log('🔍 检查Profile信息条件:');
            console.log('  - profile_info存在:', !!loadResult.profile_info);
            console.log('  - profile_list存在:', !!(loadResult.profile_info?.profile_list));
            console.log('  - profile_list长度:', loadResult.profile_info?.profile_list?.length || 0);

            if (loadResult.profile_info && loadResult.profile_info.profile_list && loadResult.profile_info.profile_list.length > 0) {
              console.log('🔍 检测到Profile信息:', loadResult.profile_info);
              this.stateManager.addCommandOutput(`🔍 检测到Profile信息:`);
              if (loadResult.profile_info.detected_os) {
                this.stateManager.addCommandOutput(`   操作系统: ${loadResult.profile_info.detected_os}`);
              }
              if (loadResult.profile_info.suggested_profile) {
                this.stateManager.addCommandOutput(`   建议Profile: ${loadResult.profile_info.suggested_profile}`);
              }
              this.stateManager.addCommandOutput(`   可用Profile: ${loadResult.profile_info.profile_list.join(', ')}`);

              // 将profile信息存储到localStorage，供后续使用（await确保保存完成后再继续）
              await this.storeDetectedProfileInfo(loadResult.profile_info);

              // 尝试立即更新下拉框（如果用户已经在vol2区域）
              this.updateVolatility2ProfileOptions(loadResult.profile_info.profile_list, loadResult.profile_info.suggested_profile);
            } else {
              console.log('🔍 未检测到Profile信息，使用默认选项');
              console.log('🔍 Profile信息详情 (调试):', JSON.stringify(loadResult.profile_info, null, 2));
              this.stateManager.addCommandOutput(`🔍 未检测到Profile信息，将使用默认选项`);
              // 设置默认的profile选项
              await this.setDefaultVolatility2ProfileOptions();
            }

            MessageManager.showSuccess(`镜像加载成功: ${result.name}`);

          } else {
            ProgressManager.hide();
            updateStatus(`MemProcFS启动失败: ${loadResult.message}`);
            this.stateManager.addCommandOutput(`❌ MemProcFS启动失败 - ${loadResult.message}`);

            // 触发错误动画
            if (renderer) {
              renderer.updateImageLoadingStatus('error', `镜像加载失败: ${loadResult.message}`);
            }

            MessageManager.showError(`启动失败: ${loadResult.message}`);

            // 更新命令状态为错误，并保存错误信息
            this.stateManager.updateCommandStatus(commandId, 'error');

            // 更新命令记录的错误信息
            const commandHistory = this.stateManager.getCommandHistory();
            const command = commandHistory.find(cmd => cmd.id === commandId);
            if (command) {
              command.output = loadResult.output || "";
              command.error = loadResult.error || loadResult.message;
              console.log('❌ 命令错误记录已更新:', command);
            }
          }
        } catch (memError) {
          ProgressManager.hide();
          console.error('启动MemProcFS失败:', memError);
          updateStatus('启动MemProcFS失败');
          this.stateManager.addCommandOutput(`❌ 启动MemProcFS失败 - ${memError}`);

          // 触发错误动画
          if (renderer) {
            renderer.updateImageLoadingStatus('error', `启动MemProcFS失败: ${memError}`);
          }

          MessageManager.showError(`启动MemProcFS失败: ${memError}`);

          // 更新命令状态为错误
          this.stateManager.updateCommandStatus(commandId, 'error');
        }

      } else {
        ProgressManager.hide();
        updateStatus('取消选择镜像文件');
      }
    } catch (error) {
      console.error('加载镜像文件失败:', error);
      ProgressManager.hide();
      updateStatus('加载镜像文件失败');
      this.stateManager.addCommandOutput(`错误: 加载镜像文件失败 - ${error}`);

      // 触发错误动画
      const renderer = this.getModernUIRenderer();
      if (renderer) {
        renderer.updateImageLoadingStatus('error', `加载镜像文件失败: ${error}`);
      }

      showFriendlyError(error, '加载镜像文件');
    }
  }

  /**
   * 检测到 Linux 镜像时改走 MemNixFS 挂载（而非 MemProcFS），成功后切换到 MemNixFS 功能区。
   */
  private async loadLinuxImageByPath(result: { path: string; name: string; size: number }): Promise<void> {
    const renderer = this.getModernUIRenderer();

    // 挂载盘互斥：清理占用挂载盘的 MemProcFS/MemNixFS 残留
    if (!(await this.ensureNoResidualMemProcFS())) {
      updateStatus('已取消加载');
      return;
    }

    // 同步镜像路径到后端
    await invoke('set_current_image_path_command', { imagePath: result.path });

    if (renderer) {
      renderer.setImageLoadingEngine?.('memnixfs');
      renderer.updateState(this.stateManager.getState());
      renderer.updateImageLoadingStatus('loading', `正在通过 MemNixFS 挂载: ${result.name}`);
    }
    ProgressManager.show('正在通过 MemNixFS 挂载 Linux 内存镜像...');

    const commandId = Date.now() + Math.random();
    this.stateManager.addCommandHistory({
      id: commandId,
      name: `加载 Linux 镜像: ${result.name}`,
      command: `memnixfs --dump "${result.path}" mount`,
      status: 'running'
    });

    // 监听后端复制进度，更新加载界面文案（同步复制期间）
    let copyUnlisten: (() => void) | null = null;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      copyUnlisten = await listen('memnixfs-copy-progress', (ev: any) => {
        const p = ev?.payload || {};
        const el = document.getElementById('dynamic-loading-text');
        if (el && p.total) el.textContent = `正在复制取证文件到 output (${p.current}/${p.total})`;
      });
    } catch { /* 进度可选 */ }

    try {
      const loadResult = await invoke('load_linux_memory_image', { imagePath: result.path }) as {
        success: boolean;
        message: string;
        process_id?: number | null;
        command: string;
        output: string;
        error: string;
        kernel_banner?: string | null;
      };
      if (copyUnlisten) { try { copyUnlisten(); } catch { /* ignore */ } copyUnlisten = null; }
      ProgressManager.hide();

      if (loadResult.success) {
        updateStatus(`MemNixFS 挂载成功: ${result.name}`);
        this.stateManager.addCommandOutput(`✅ ${loadResult.message}`);
        if (loadResult.kernel_banner) {
          this.stateManager.addCommandOutput(`🧬 内核: ${loadResult.kernel_banner}`);
        }
        this.stateManager.updateCommandStatus(commandId, 'completed');
        const okCmd = this.stateManager.getCommandHistory().find(c => c.id === commandId);
        if (okCmd) { okCmd.output = loadResult.output || ''; okCmd.error = loadResult.error || ''; }

        // 切换到 MemNixFS 功能区并显示功能卡片
        if (renderer) {
          let idx = typeof renderer.getAreaIndexByName === 'function' ? renderer.getAreaIndexByName('MemNixFS V2') : -1;
          if (idx < 0 && typeof renderer.getAreaIndexByName === 'function') idx = renderer.getAreaIndexByName('MemNixFS');
          if (idx >= 0) this.stateManager.updateSelectedModule(idx);
          this.stateManager.updateCurrentTab('function');
          renderer.updateState(this.stateManager.getState());
          renderer.updateImageLoadingStatus('completed', `Linux 镜像已挂载: ${result.name}`);
          if (typeof renderer.updateMainWorkspace === 'function') {
            await renderer.updateMainWorkspace();
          }
        }

        MessageManager.showSuccess(`Linux 镜像已挂载: ${result.name}`);

      } else {
        updateStatus(`MemNixFS 挂载失败: ${loadResult.message}`);
        this.stateManager.addCommandOutput(`❌ ${loadResult.message}`);
        this.stateManager.updateCommandStatus(commandId, 'error');
        const errCmd = this.stateManager.getCommandHistory().find(c => c.id === commandId);
        if (errCmd) { errCmd.output = loadResult.output || ''; errCmd.error = loadResult.error || loadResult.message; }
        if (renderer) renderer.updateImageLoadingStatus('error', `挂载失败: ${loadResult.message}`);
        if (loadResult.error === 'symbols-not-found') {
          await showConfirm({
            title: '未找到内核符号表',
            message: `${loadResult.message}\n\n配置位置：设置 → 工具配置 → MemNixFS 符号目录 / 符号缓存目录。`,
            confirmText: '我知道了',
            cancelText: '关闭',
            type: 'warning',
          });
        } else {
          MessageManager.showError(`挂载失败: ${loadResult.message}`);
        }
      }
    } catch (e) {
      if (copyUnlisten) { try { copyUnlisten(); } catch { /* ignore */ } copyUnlisten = null; }
      ProgressManager.hide();
      this.stateManager.updateCommandStatus(commandId, 'error');
      if (renderer) renderer.updateImageLoadingStatus('error', `挂载失败: ${e}`);
      MessageManager.showError(`MemNixFS 挂载失败: ${e}`);
      this.stateManager.addCommandOutput(`❌ MemNixFS 挂载失败: ${e}`);
    }
  }

  /**
   * 通过文件路径直接加载镜像（用于拖拽导入）
   */
  async loadImageFromPath(filePath: string): Promise<void> {
    try {
      // 提取文件名和大小
      const pathParts = filePath.replace(/\\/g, '/').split('/');
      const fileName = pathParts[pathParts.length - 1] || '未知文件';

      const result = { path: filePath, name: fileName, size: 0 };
      this.stateManager.setCurrentImage(result);
      recentSessions.addSession(result.path, result.name, result.size);

      // 探测镜像类型：Linux 镜像改走 MemNixFS
      try {
        const osType = await invoke('detect_memory_image_os', { imagePath: result.path }) as string;
        if (osType === 'linux') {
          await this.loadLinuxImageByPath(result);
          return;
        }
      } catch (e) {
        console.warn('镜像类型探测失败，按 Windows(MemProcFS) 流程继续:', e);
      }

      // 加载前检测/清理残留的 MemProcFS 进程(上次异常退出会驻留并占用挂载盘)
      if (!(await this.ensureNoResidualMemProcFS())) {
        updateStatus('已取消加载');
        return;
      }

      // 同步镜像路径到后端设置（供右键菜单插件 {current_image_path} 变量使用）
      await invoke('set_current_image_path_command', { imagePath: filePath });

      const renderer = this.getModernUIRenderer();
      if (renderer) {
        renderer.setImageLoadingEngine?.('memprocfs');
        renderer.updateState(this.stateManager.getState());
        renderer.updateImageLoadingStatus('loading', `正在加载镜像: ${result.name}`);
      }

      ProgressManager.show('正在启动MemProcFS加载镜像...');

      const commandId = Date.now() + Math.random();
      const settings = await loadAppSettings();
      let memprocfsCommand = `${settings.memprocfs_path || 'memprocfs.exe'} -device "${result.path}" -v -license-accept-elastic-license-2-0 -forensic 1`;

      this.stateManager.addCommandHistory({
        id: commandId,
        name: `加载镜像: ${result.name}`,
        command: memprocfsCommand,
        status: 'pending'
      });

      try {
        this.stateManager.updateCommandStatus(commandId, 'running');

        const loadResult = await invoke('load_memory_image', { imagePath: result.path }) as {
          success: boolean;
          message: string;
          process_id?: number;
          command: string;
          output: string;
          error: string;
          profile_info?: {
            detected_os?: string;
            suggested_profile?: string;
            profile_list: string[];
          };
        };

        if (loadResult.success) {
          ProgressManager.hide();
          updateStatus(`MemProcFS启动成功: ${result.name}`);
          this.stateManager.addCommandOutput(`✅ MemProcFS启动成功 - ${loadResult.message}`);

          if (renderer) {
            this.stateManager.updateSelectedModule(0);
            this.stateManager.updateState({ currentTab: 'dashboard' });
            renderer.updateState(this.stateManager.getState());
            renderer.updateImageLoadingStatus('completed', `镜像加载完成: ${result.name}`);
          }

          this.stateManager.updateCommandStatus(commandId, 'completed');

          const commandHistory = this.stateManager.getCommandHistory();
          const command = commandHistory.find(cmd => cmd.id === commandId);
          if (command) {
            command.output = loadResult.output || "无输出内容";
            command.error = loadResult.error || "";
            if (loadResult.process_id) {
              command.processId = loadResult.process_id;
            }
          }

          if (loadResult.process_id) {
            this.stateManager.setMemProcFSProcessId(loadResult.process_id);
          }

          if (loadResult.profile_info && loadResult.profile_info.profile_list && loadResult.profile_info.profile_list.length > 0) {
            await this.storeDetectedProfileInfo(loadResult.profile_info);
            this.updateVolatility2ProfileOptions(loadResult.profile_info.profile_list, loadResult.profile_info.suggested_profile);
          } else {
            await this.setDefaultVolatility2ProfileOptions();
          }

          MessageManager.showSuccess(`镜像加载成功: ${result.name}`);

        } else {
          ProgressManager.hide();
          updateStatus(`MemProcFS启动失败: ${loadResult.message}`);
          this.stateManager.addCommandOutput(`❌ MemProcFS启动失败 - ${loadResult.message}`);
          if (renderer) {
            renderer.updateImageLoadingStatus('error', `镜像加载失败: ${loadResult.message}`);
          }
          MessageManager.showError(`启动失败: ${loadResult.message}`);
          this.stateManager.updateCommandStatus(commandId, 'error');
        }
      } catch (memError) {
        ProgressManager.hide();
        updateStatus('启动MemProcFS失败');
        this.stateManager.addCommandOutput(`❌ 启动MemProcFS失败 - ${memError}`);
        if (renderer) {
          renderer.updateImageLoadingStatus('error', `启动MemProcFS失败: ${memError}`);
        }
        MessageManager.showError(`启动MemProcFS失败: ${memError}`);
        this.stateManager.updateCommandStatus(commandId, 'error');
      }
    } catch (error) {
      console.error('拖拽加载镜像文件失败:', error);
      ProgressManager.hide();
      updateStatus('加载镜像文件失败');
      showFriendlyError(error, '加载镜像文件');
    }
  }

  /**
   * 加载前检测并清理可能残留的 MemProcFS 进程。
   * 上次异常退出会导致 MemProcFS 进程驻留并占用挂载盘，再次加载会失败(常被误报为“文件不存在”)。
   * 返回 true 表示可继续加载，false 表示用户取消。
   */
  private async ensureNoResidualMemProcFS(): Promise<boolean> {
    let residual = 0;
    try {
      const procs = (await invoke('get_monitored_processes')) as Array<{ pid: number; name: string }>;
      residual = (procs || []).filter(p => /memprocfs|memnixfs/i.test(p.name)).length;
    } catch {
      // 检测失败则不拦截，按原流程继续
      return true;
    }
    if (residual === 0) return true;

    const driveLabel = `${getMountLetter()}:`;
    const proceed = await showConfirm({
      title: '检测到残留的 MemProcFS 进程',
      message: `检测到 ${residual} 个正在运行的 MemProcFS 进程，可能是已加载的镜像，或上次异常退出残留并仍占用 ${driveLabel} 盘。\n加载新镜像前需要先清理，否则会因 ${driveLabel} 被占用而加载失败。\n是否立即清理并继续加载？`,
      confirmText: '清理并继续',
      cancelText: '取消',
      type: 'warning',
    });
    if (!proceed) return false;

    try {
      ProgressManager.show('正在清理残留的 MemProcFS 进程...');
      const result = (await invoke('force_cleanup_and_clear', { clearOutput: true })) as string;
      this.stateManager.addCommandOutput(`🧹 ${result}`);
      // 等待进程退出与 M: 卸载完成
      await new Promise(resolve => setTimeout(resolve, 1500));
      return true;
    } catch (e) {
      ProgressManager.hide();
      MessageManager.showError(`清理残留进程失败: ${e}`);
      return false;
    }
  }

  /**
   * 卸载镜像文件
   */
  async unloadImageFile(): Promise<void> {
    const unloadedImage = this.stateManager.getCurrentImage();
    let cleanupSucceeded = false;

    try {
      const result = await invoke('force_cleanup_and_clear', { clearOutput: true }) as string;
      this.stateManager.addCommandOutput(`✅ ${result}`);
      MessageManager.showSuccess(result);
      cleanupSucceeded = true;
    } catch (error) {
      console.error('❌ 快速清理失败:', error);
      this.stateManager.addCommandOutput(`❌ 快速清理失败: ${error}`);
      showFriendlyError(error, '快速清理');
    } finally {
      ProgressManager.hide();
    }

    // 清理状态
    this.stateManager.clearCurrentImage();
    this.stateManager.clearMemProcFSProcessId();

    // 刷新UI以显示欢迎界面
    const renderer = this.getModernUIRenderer();
    if (renderer) {
      renderer.updateState(this.stateManager.getState());
      renderer.updateMainWorkspace().catch((err: any) => console.error('更新主工作区失败:', err));

      // 同时重置加载状态指示器
      renderer.updateImageLoadingStatus('completed', '');
    }

    updateStatus('已执行快速清理');
    if (unloadedImage && cleanupSucceeded) {

    }
    return;


  }




  /**
   * 停止MemProcFS进程
   */
  async stopMemProcFSProcess(processId: number): Promise<void> {
    try {
      const result = await invoke('stop_memprocfs', { processId }) as { success: boolean; message: string };

      if (result.success) {
        MessageManager.showSuccess(`进程已停止: PID ${processId}`);
        this.stateManager.clearMemProcFSProcessId();

        // 更新相关命令状态
        const commandHistory = this.stateManager.getCommandHistory();
        const command = commandHistory.find(cmd => cmd.processId === processId);
        if (command) {
          this.stateManager.updateCommandStatus(command.id, 'completed');
        }
      } else {
        MessageManager.showError(`停止进程失败: ${result.message}`);
      }
    } catch (error) {
      console.error('停止MemProcFS进程失败:', error);
      showFriendlyError(error, '停止进程');
    }
  }

  /**
   * 更新Volatility2的Profile下拉框选项（仅尝试一次）
   */
  private updateVolatility2ProfileOptions(profileList: string[], suggestedProfile?: string): void {
    const selectElement = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (!selectElement) {
      console.log('🔍 vol2-profile下拉框元素当前不存在（用户可能不在Volatility2区域）');
      console.log('💾 Profile信息已存储，切换到Volatility2区域时将自动应用');
      return;
    }

    console.log('✅ 找到vol2-profile下拉框元素，立即更新选项');

    // 清空现有选项
    selectElement.innerHTML = '';

    // 添加新的profile选项
    profileList.forEach((profile, index) => {
      const option = document.createElement('option');
      option.value = profile;
      option.textContent = profile;

      // 如果是建议的profile，设为选中状态
      if (suggestedProfile && profile === suggestedProfile) {
        option.selected = true;
      } else if (!suggestedProfile && index === 0) {
        // 如果没有建议的profile，选中第一个
        option.selected = true;
      }

      selectElement.appendChild(option);
    });

    console.log('✅ Volatility2 Profile下拉框已更新:', profileList);
    console.log('✅ 选中的Profile:', suggestedProfile || profileList[0]);
  }

  /**
   * 设置Volatility2默认Profile选项
   */
  private async setDefaultVolatility2ProfileOptions(): Promise<void> {
    const selectElement = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (!selectElement) {
      console.warn('未找到vol2-profile下拉框元素');
      return;
    }

    // 清空现有选项
    selectElement.innerHTML = '';

    try {
      // 从设置中获取保存的 volatility2_profile
      const { invoke } = await import('@tauri-apps/api/core');
      const settings = await loadAppSettings();
      const savedProfile = settings.volatility2_profile || 'Win7SP1x64';

      console.log('📂 从设置中加载的 Volatility2 Profile:', savedProfile);

      // 添加默认的profile选项
      const defaultProfiles = [
        { value: 'Win7SP1x64', text: 'Win7SP1x64' },
        { value: 'Win7SP1x86', text: 'Win7SP1x86' },
        { value: 'Win10x64', text: 'Win10x64' },
        { value: 'Win10x86', text: 'Win10x86' },
        { value: 'WinXPSP2x86', text: 'WinXPSP2x86' },
        { value: 'WinXPSP3x86', text: 'WinXPSP3x86' }
      ];

      defaultProfiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.value;
        option.textContent = profile.text;
        // 设置选中状态为保存的 profile
        if (profile.value === savedProfile) {
          option.selected = true;
        }
        selectElement.appendChild(option);
      });


    } catch (error) {
      console.error('❌ 加载 Volatility2 Profile 设置失败:', error);

      // 如果加载失败，使用默认设置
      const defaultProfiles = [
        { value: 'Win7SP1x64', text: 'Win7SP1x64', selected: true },
        { value: 'Win7SP1x86', text: 'Win7SP1x86' },
        { value: 'Win10x64', text: 'Win10x64' },
        { value: 'Win10x86', text: 'Win10x86' },
        { value: 'WinXPSP2x86', text: 'WinXPSP2x86' },
        { value: 'WinXPSP3x86', text: 'WinXPSP3x86' }
      ];

      defaultProfiles.forEach(profile => {
        const option = document.createElement('option');
        option.value = profile.value;
        option.textContent = profile.text;
        if (profile.selected) {
          option.selected = true;
        }
        selectElement.appendChild(option);
      });

      console.log('✅ 已设置默认Volatility2 Profile选项（使用默认值）');
    }
  }

  /**
   * 存储检测到的Profile信息到localStorage
   */
  private async storeDetectedProfileInfo(profileInfo: { detected_os?: string; suggested_profile?: string; profile_list: string[] }): Promise<void> {
    try {
      const profileData = {
        detected_os: profileInfo.detected_os,
        suggested_profile: profileInfo.suggested_profile,
        profile_list: profileInfo.profile_list,
        timestamp: Date.now()
      };

      localStorage.setItem('detected_profile_info', JSON.stringify(profileData));
      console.log('✅ Profile信息已存储到localStorage:', profileData);

      // 同时将检测到的 profile 保存到 settings.json，供 CSV 插件等使用
      const profileToSave = profileInfo.suggested_profile || (profileInfo.profile_list.length > 0 ? profileInfo.profile_list[0] : null);
      if (profileToSave) {
        try {
          await invoke('save_volatility2_profile', { profile: profileToSave });
          console.log('✅ 检测到的 Profile 已同步保存到 settings.json:', profileToSave);
        } catch (error: any) {
          console.error('❌ 保存 Profile 到 settings.json 失败:', error);
        }
      }

      // 通知状态管理器
      this.stateManager.addCommandOutput(`💾 Profile信息已保存，切换到Volatility2区域时将自动加载`);
    } catch (error) {
      console.error('❌ 存储Profile信息失败:', error);
    }
  }

  /**
   * 从localStorage加载检测到的Profile信息
   */
  public static loadDetectedProfileInfo(): { detected_os?: string; suggested_profile?: string; profile_list: string[]; timestamp: number } | null {
    try {
      const stored = localStorage.getItem('detected_profile_info');
      if (stored) {
        const profileData = JSON.parse(stored);
        console.log('📂 从localStorage加载Profile信息:', profileData);
        return profileData;
      }
    } catch (error) {
      console.error('❌ 加载Profile信息失败:', error);
    }
    return null;
  }

  /**
   * 清除存储的Profile信息
   */
  public static clearDetectedProfileInfo(): void {
    try {
      localStorage.removeItem('detected_profile_info');
      console.log('🗑️ 已清除存储的Profile信息');
    } catch (error) {
      console.error('❌ 清除Profile信息失败:', error);
    }
  }

  /**
   * 清空输出目录（独立功能）
   */
  async clearOutputDirectory(): Promise<void> {
    try {
      ProgressManager.show('正在清空输出目录...');

      // 调用后端的清空目录功能
      const result = await invoke('clear_output_directory') as string;

      ProgressManager.hide();
      this.stateManager.addCommandOutput(`🗑️ ${result}`);
      MessageManager.showSuccess(`输出目录清空完成`);
      updateStatus('输出目录已清空');

    } catch (error) {
      console.error('清空输出目录失败:', error);
      ProgressManager.hide();
      this.stateManager.addCommandOutput(`❌ 清空输出目录失败: ${error}`);
      showFriendlyError(error, '清空输出目录');
      updateStatus('清空输出目录失败');
    }
  }
}

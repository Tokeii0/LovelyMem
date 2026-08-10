/**
 * 事件协调器
 * 集中管理所有事件监听器
 */

import { listen } from '@tauri-apps/api/event';
import { StateManager } from '../core/stateManager';
import { CommandWindowManager } from '../ui/commandWindowManager';
import { EventManager } from '../ui/events';


export class EventCoordinator {
  constructor(
    private stateManager: StateManager,
    private commandWindowManager: CommandWindowManager,
    private eventManager: EventManager
  ) {}

  /**
   * 监听命令事件
   */
  async listenForCommandEvents(): Promise<void> {
    try {
      await listen('command-event', (event) => {
        console.log('收到命令事件:', event.payload);
        const commandData = event.payload as any;

        // 处理实时输出事件
        if (commandData.name === "MemProcFS 输出" || commandData.name === "MemProcFS 错误输出") {
          this.handleRealtimeOutput(commandData);
        } else if (commandData.name === "MemProcFS 加载完成") {
          this.handleMemProcFSLoadComplete(commandData);
        } else if (commandData.name === "Profile检测") {
          this.handleProfileDetection(commandData);
        } else {
          this.handleGeneralCommand(commandData);
        }
      });

      console.log('🎧 命令事件监听器已启动');
    } catch (error) {
      console.error('❌ 启动命令事件监听器失败:', error);
    }
  }

  /**
   * 监听CSV插件事件
   */
  async listenForCSVPluginEvents(): Promise<void> {
    try {
      await listen('csv-plugin-main-window', (event: any) => {
        console.log('📥 收到CSV插件主窗口事件:', event.payload);
        const commandData = event.payload;

        this.stateManager.addCommandHistory({
          id: commandData.id,
          name: commandData.name,
          command: commandData.command,
          status: commandData.status,
          time: commandData.time,
          output: commandData.output,
          error: commandData.error
        });

        this.commandWindowManager.updateCommandWindowDisplay();
        if (commandData.status === 'completed') {

        }
        console.log('✅ CSV插件命令已添加到历史记录');
      });

      console.log('🎧 CSV插件事件监听器已启动');
    } catch (error) {
      console.error('❌ 启动CSV插件事件监听器失败:', error);
    }
  }

  /**
   * 绑定AI触发功能事件
   */
  async bindAITriggerEvents(): Promise<void> {
    try {
      await listen('trigger-feature', (event: any) => {
        const { feature } = event.payload;
        console.log(`🚀 AI触发功能: ${feature}`);
        this.eventManager.triggerFeature(feature);

        this.stateManager.addCommandOutput(`🤖 AI智能助手触发了功能: ${feature}`);
        this.commandWindowManager.updateCommandWindowDisplay();
      });

      console.log('🎧 AI触发功能事件监听器已启动');
    } catch (error) {
      console.error('❌ 启动AI触发功能事件监听器失败:', error);
    }
  }

  /**
   * 处理实时输出事件
   */
  private handleRealtimeOutput(commandData: any): void {
    if (commandData.output) {
      this.commandWindowManager.appendRealtimeOutput('output', commandData.output, commandData.time);
    }
    if (commandData.error) {
      this.commandWindowManager.appendRealtimeOutput('error', commandData.error, commandData.time);
    }
  }

  /**
   * 处理MemProcFS加载完成事件
   */
  private handleMemProcFSLoadComplete(commandData: any): void {
    this.stateManager.addCommandHistory({
      id: commandData.id,
      name: commandData.name,
      command: commandData.command,
      status: commandData.status,
      time: commandData.time,
      output: commandData.output,
      error: commandData.error
    });

    console.log('✅ 检测到 MemProcFS 加载完成，更新镜像状态为已加载');

    // 更新镜像加载状态
    if ((window as any).modernUIRenderer) {
      (window as any).modernUIRenderer.updateImageLoadingStatus(
        'completed',
        commandData.output || 'MemProcFS 已完成内存镜像加载和分析'
      );
    }

    this.commandWindowManager.addCommandRecord({
      name: 'MemProcFS 加载完成',
      command: 'MemProcFS initialization completed',
      timestamp: commandData.time,
      type: 'system'
    });
  }

  /**
   * 处理Profile检测事件
   */
  private handleProfileDetection(commandData: any): void {
    this.stateManager.addCommandHistory({
      id: commandData.id,
      name: commandData.name,
      command: commandData.command,
      status: commandData.status,
      time: commandData.time,
      output: commandData.output,
      error: commandData.error
    });

    this.commandWindowManager.addCommandRecord({
      id: commandData.id?.toString(),
      name: commandData.name,
      command: commandData.command || 'Profile detection process',
      timestamp: commandData.time,
      type: 'system',
      output: commandData.output,
      error: commandData.error
    });

    // 处理Profile检测完成事件 - 解析并存储Profile信息
    if (commandData.status === 'completed') {
      this.handleProfileDetectionComplete(commandData);
    }
  }

  /**
   * 处理Profile检测完成事件 - 解析并存储Profile信息
   */
  private handleProfileDetectionComplete(commandData: any): void {
    try {
      const output = commandData.output || '';

      if (output.includes('检测到Profile:')) {
        // 解析Profile列表
        const profileMatch = output.match(/检测到Profile: \[(.*?)\]/);
        const suggestedMatch = output.match(/建议使用: (.+)/);

        if (profileMatch) {
          const profileListStr = profileMatch[1];
          const profileList = profileListStr.split(',').map((p: string) => p.trim().replace(/"/g, ''));
          const suggestedProfile = suggestedMatch ? suggestedMatch[1].trim() : profileList[0];

          // 存储Profile信息到localStorage
          const profileData = {
            profile_list: profileList,
            suggested_profile: suggestedProfile,
            timestamp: Date.now()
          };
          localStorage.setItem('detected_profile_info', JSON.stringify(profileData));

          // 如果当前在Volatility2区域，立即应用
          this.applyProfileInfoIfInVol2Area(profileList, suggestedProfile);
        }
      }
    } catch (error) {
      console.error('处理Profile检测完成事件失败:', error);
    }
  }

  /**
   * 如果当前在Volatility2区域，立即应用Profile信息
   */
  private applyProfileInfoIfInVol2Area(profileList: string[], suggestedProfile: string): void {
    const vol2ProfileSelect = document.getElementById('vol2-profile') as HTMLSelectElement;
    if (vol2ProfileSelect) {

      // 清空现有选项
      vol2ProfileSelect.innerHTML = '';

      // 添加新的profile选项
      profileList.forEach((profile) => {
        const option = document.createElement('option');
        option.value = profile;
        option.textContent = profile;

        if (profile === suggestedProfile) {
          option.selected = true;
        }

        vol2ProfileSelect.appendChild(option);
      });
    }
  }

  /**
   * 处理一般命令事件
   */
  private handleGeneralCommand(commandData: any): void {
    this.stateManager.addCommandHistory({
      id: commandData.id,
      name: commandData.name,
      command: commandData.command,
      status: commandData.status,
      time: commandData.time,
      output: commandData.output,
      error: commandData.error
    });

    this.commandWindowManager.updateCommandWindowDisplay();

    if (commandData.status === 'completed') {

    }
  }

  /**
   * 监听 Tauri 窗口拖拽事件，支持拖拽导入内存镜像
   */
  async listenForDragDropEvents(): Promise<void> {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();

      await appWindow.onDragDropEvent((event) => {
        const dropZone = document.getElementById('welcome-drop-zone');

        if (event.payload.type === 'enter') {
          // 拖拽进入窗口：显示高亮反馈
          const overlay = document.getElementById('welcome-drop-overlay');
          if (overlay) overlay.classList.add('active');
          if (dropZone) {
            dropZone.classList.add('drag-over');
            dropZone.classList.add('drag-active');
          }
        } else if (event.payload.type === 'leave') {
          // 拖拽离开或取消
          const overlay = document.getElementById('welcome-drop-overlay');
          if (overlay) overlay.classList.remove('active');
          if (dropZone) {
            dropZone.classList.remove('drag-over');
            dropZone.classList.remove('drag-active');
          }
        } else if (event.payload.type === 'drop') {
          // 拖拽释放：处理文件
          const overlay = document.getElementById('welcome-drop-overlay');
          if (overlay) overlay.classList.remove('active');
          if (dropZone) {
            dropZone.classList.remove('drag-over');
            dropZone.classList.remove('drag-active');
          }

          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            const filePath = paths[0];
            console.log('拖拽导入文件:', filePath);

            // 检查文件扩展名
            const ext = filePath.split('.').pop()?.toLowerCase() || '';
            const validExtensions = ['raw', 'dmp', 'vmem', 'img', 'dd', 'bin', 'mem', '001'];

            if (validExtensions.includes(ext) || !this.stateManager.getCurrentImage()) {
              // 动态导入 ImageManager 并调用 loadImageFromPath
              import('../features/image').then(({ ImageManager }) => {
                const imageManager = new ImageManager(this.stateManager);
                imageManager.loadImageFromPath(filePath);
              }).catch(err => {
                console.error('拖拽加载失败:', err);
              });
            } else {
              console.log('不支持的文件格式:', ext);
            }
          }
        }
      });

      console.log('🎧 拖拽导入事件监听器已启动');
    } catch (error) {
      console.error('❌ 启动拖拽导入事件监听器失败:', error);
    }
  }
}

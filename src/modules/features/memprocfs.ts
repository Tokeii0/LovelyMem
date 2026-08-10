/**
 * MemProcFS功能模块
 * 处理所有MemProcFS相关功能
 */

import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings } from '../core/settingsHelper';
import { mountPath, mountPathFwd } from '../core/mountDrive';
import { MessageManager } from '../utils/message';
import { ProgressManager } from '../utils/progress';
import { updateStatus } from '../utils/helpers';
import { StateManager } from '../core/stateManager';


export class MemProcFSManager {
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
  }

  /**
   * 通用的CSV查看器处理函数
   */
  private async openCSVViewer(csvFileName: string, displayName: string, retryCount: number = 0): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      const csvPath = `${outputPath}\\${csvFileName}`;

      //ProgressManager.show(`正在打开${displayName}查看器...`);

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

      // 如果是第一次失败且错误可能是文件不存在，尝试重新复制文件
      if (retryCount === 0 && (
        String(error).includes('不存在') ||
        String(error).includes('未正常') ||
        String(error).includes('打开失败') ||
        String(error).includes('cannot find') ||
        String(error).includes('FileNotFound')
      )) {
        console.log(`🔄 检测到文件可能不存在，尝试重新复制 forensic 文件...`);
        updateStatus(`文件不存在，正在重新复制文件...`);
        this.stateManager.addCommandOutput(`🔄 ${displayName}文件不存在，尝试重新复制 forensic 文件...`);

        try {
          // 调用后端重新复制 forensic 文件
          ProgressManager.show('正在重新复制 forensic 文件...');
          const copyResult = await invoke('copy_forensic_files_retry') as string;
          ProgressManager.hide();

          console.log(`✅ 文件重新复制完成: ${copyResult}`);
          this.stateManager.addCommandOutput(`✅ 文件重新复制完成: ${copyResult}`);

          // 递归调用自己，但增加重试计数避免无限循环
          await this.openCSVViewer(csvFileName, displayName, retryCount + 1);
          return;

        } catch (copyError) {
          ProgressManager.hide();
          console.error('重新复制文件失败:', copyError);
          this.stateManager.addCommandOutput(`❌ 重新复制文件失败: ${copyError}`);
          MessageManager.showError(`重新复制文件失败: ${copyError}`);
        }
      }

      updateStatus(`打开${displayName}查看器失败`);
      MessageManager.showError(`打开失败: ${error}`);
      this.stateManager.addCommandOutput(`❌ 打开${displayName}查看器失败: ${error}`);
    }
  }

  /**
   * 通用的文本查看器处理函数
   */
  private async openTextViewer(textFileName: string, displayName: string, retryCount: number = 0): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';
      const textPath = `${outputPath}\\${textFileName}`;

      ProgressManager.show(`正在打开${displayName}查看器...`);

      // 调用后端命令打开文本查看器
      await invoke('open_text_viewer', {
        textFilePath: textPath,
        windowTitle: `MemProcFS - ${displayName}`
      });

      ProgressManager.hide();
      updateStatus(`${displayName}查看器已打开`);
      this.stateManager.addCommandOutput(`📄 ${displayName}查看器已打开: ${textPath}`);
      MessageManager.showSuccess(`${displayName}查看器已打开`);

    } catch (error) {
      ProgressManager.hide();
      console.error(`打开${displayName}查看器失败:`, error);

      // 如果是第一次失败且错误可能是文件不存在，尝试重新复制文件
      if (retryCount === 0 && (
        String(error).includes('不存在') ||
        String(error).includes('打开失败') ||
        String(error).includes('找不到文件') ||
        String(error).includes('cannot find') ||
        String(error).includes('FileNotFound')
      )) {
        console.log(`🔄 检测到文件可能不存在，尝试重新复制 forensic 文件...`);
        updateStatus(`文件不存在，正在重新复制文件...`);
        this.stateManager.addCommandOutput(`🔄 ${displayName}文件不存在，尝试重新复制 forensic 文件...`);

        try {
          // 调用后端重新复制 forensic 文件
          ProgressManager.show('正在重新复制 forensic 文件...');
          const copyResult = await invoke('copy_forensic_files_retry') as string;
          ProgressManager.hide();

          console.log(`✅ 文件重新复制完成: ${copyResult}`);
          this.stateManager.addCommandOutput(`✅ 文件重新复制完成: ${copyResult}`);

          // 递归调用自己，但增加重试计数避免无限循环
          await this.openTextViewer(textFileName, displayName, retryCount + 1);
          return;

        } catch (copyError) {
          ProgressManager.hide();
          console.error('重新复制文件失败:', copyError);
          this.stateManager.addCommandOutput(`❌ 重新复制文件失败: ${copyError}`);
          MessageManager.showError(`重新复制文件失败: ${copyError}`);
        }
      }

      updateStatus(`打开${displayName}查看器失败`);
      MessageManager.showError(`打开失败: ${error}`);
      this.stateManager.addCommandOutput(`❌ 打开${displayName}查看器失败: ${error}`);
    }
  }


  // MemProcFS功能处理方法
  async handleSysInfoFeature(): Promise<void> {
    await this.openTextViewer('sysinfo.txt', '系统信息');
  }

  async handleProcInfoFeature(): Promise<void> {
    await this.openCSVViewer('process.csv', '进程信息');
  }

  async handleModuleInfoFeature(): Promise<void> {
    await this.openCSVViewer('modules.csv', '模块信息');
  }

  async handleNetInfoFeature(): Promise<void> {
    await this.openCSVViewer('net.csv', '网络信息');
  }

  async handleTasksFeature(): Promise<void> {
    await this.openCSVViewer('tasks.csv', '任务信息');
  }

  async handleDriversFeature(): Promise<void> {
    await this.openCSVViewer('drivers.csv', '驱动信息');
  }

  async handleHandlesFeature(): Promise<void> {
    await this.openCSVViewer('handles.csv', '句柄信息');
  }

  async handleServicesFeature(): Promise<void> {
    await this.openCSVViewer('services.csv', '服务信息');
  }

  async handleAllFilesFeature(): Promise<void> {
    await this.openCSVViewer('files.csv', '内存文件');
  }

  async handleYaraScanFeature(): Promise<void> {
    await this.openCSVViewer('yara.csv', 'Yara扫描结果');
  }

  async handleYaraDetailFeature(): Promise<void> {
    await this.openTextViewer('yara.txt', 'Yara详情');
  }

  async handleMalwareDetectFeature(): Promise<void> {
    await this.openCSVViewer('findevil.csv', '恶意软件检测');
  }
  async handleNetworkTimelineFeature(): Promise<void> {
    await this.openCSVViewer('timeline_net.csv', '网络时间线');
  }

  async handleNTFSTimelineFeature(): Promise<void> {
    await this.openCSVViewer('timeline_ntfs.csv', 'NTFS时间线');
  }

  async handleProcessTimelineFeature(): Promise<void> {
    await this.openCSVViewer('timeline_process.csv', '进程时间线');
  }
  async handleWebTimelineFeature(): Promise<void> {
    await this.openCSVViewer('timeline_web.csv', 'Web时间线');
  }
  // 注册表时间线
  async handleRegistryTimelineFeature(): Promise<void> {
    await this.openCSVViewer('timeline_registry.csv', '注册表时间线');
  }
  // 任务时间线
  async handleTasksTimelineFeature(): Promise<void> {
    await this.openCSVViewer('timeline_tasks.csv', '任务时间线');
  }
  // Prefetch时间线
  async handlePrefetchTimelineFeature(): Promise<void> {
    await this.openCSVViewer('timeline_prefetch.csv', 'Prefetch时间线');
  }
  async handleBitlockerKeyFeature(): Promise<void> {
    await this.openTextViewer('bitlocker.txt', 'Bitlocker密钥');
  }
  async handleNetDnsFeature(): Promise<void> {
    await this.openCSVViewer('netdns.csv', 'DNS解析');
  }
  async handleAccountsFeature(): Promise<void> {
    await this.openCSVViewer('accounts.csv', '账户信息');
  }
  async handleActivityFeature(): Promise<void> {
    await this.openCSVViewer('activity.csv', '活动信息');
  }
  async handleAnalysisFileFeature(): Promise<void> {
    await this.openCSVViewer('file.csv', '文件分析');
  }
  async handleAnalysisAppcompatFeature(): Promise<void> {
    await this.openCSVViewer('appcompat.csv', '应用兼容性分析');
  }
  async handleAnalysisCmdlineFeature(): Promise<void> {
    await this.openCSVViewer('cmdline.csv', '命令行分析');
  }
  async handleAnalysisCrashdumpFeature(): Promise<void> {
    await this.openCSVViewer('crashdump.csv', 'Crashdump分析');
  }
  async handleAnalysisEnvironFeature(): Promise<void> {
    await this.openCSVViewer('environ.csv', '环境变量分析');
  }
  async handleAnalysisEventlogFeature(): Promise<void> {
    await this.openCSVViewer('eventlog.csv', '事件日志分析');
  }
  async handleAnalysisExtensionsFeature(): Promise<void> {
    await this.openCSVViewer('extensions.csv', '浏览器扩展分析');
  }
  async handleAnalysisBrowserConfigFeature(): Promise<void> {
    await this.openCSVViewer('browser_config.csv', '浏览器配置分析');
  }
  async handleAnalysisPatchesFeature(): Promise<void> {
    await this.openCSVViewer('patches.csv', '补丁分析');
  }
  async handleAnalysisPoliciesFeature(): Promise<void> {
    await this.openCSVViewer('policies.csv', '策略分析');
  }
  async handleAnalysisPrintersFeature(): Promise<void> {
    await this.openCSVViewer('printers.csv', '打印机分析');
  }
  async handleAnalysisPrivacyFeature(): Promise<void> {
    await this.openCSVViewer('privacy.csv', '隐私分析');
  }
  async handleAnalysisSecurityFeature(): Promise<void> {
    await this.openCSVViewer('security.csv', '安全分析');
  }
  async handleAnalysisSharesFeature(): Promise<void> {
    await this.openCSVViewer('shares.csv', '共享分析');
  }
  async handleAnalysisShimcacheFeature(): Promise<void> {
    await this.openCSVViewer('shimcache.csv', 'Shimcache分析');
  }
  async handleAnalysisSoftwareFeature(): Promise<void> {
    await this.openCSVViewer('software.csv', '软件分析');
  }
  async handleAnalysisStartupFeature(): Promise<void> {
    await this.openCSVViewer('startup.csv', '启动项分析');
  }
  async handleAnalysisTimezoneFeature(): Promise<void> {
    await this.openCSVViewer('timezone.csv', '时区分析');
  }
  async handleAnalysisUsbstorFeature(): Promise<void> {
    await this.openCSVViewer('usbstor.csv', 'USB存储分析');
  }
  async handleAnalysisWmiFeature(): Promise<void> {
    await this.openCSVViewer('wmi.csv', 'WMI分析');
  }
  async handleAnalysisVirtualizationFeature(): Promise<void> {
    await this.openCSVViewer('virtualization.csv', '虚拟化分析');
  }
  async handleAnalysisWirelessFeature(): Promise<void> {
    await this.openCSVViewer('wireless.csv', '无线网络分析');
  }
  //browser.csv
  async handleAnalysisBrowserFeature(): Promise<void> {
    await this.openCSVViewer('browser.csv', '浏览器配置分析');
  }
  //chinabrowser.csv
  async handleAnalysisChinabrowserFeature(): Promise<void> {
    await this.openCSVViewer('chinabrowser.csv', '国产浏览器配置分析');
  }
  //chinacloud.csv
  async handleAnalysisChinacloudFeature(): Promise<void> {
    await this.openCSVViewer('chinacloud.csv', '国产云服务配置分析');
  }
  //chinamedia
  async handleAnalysisChinamediaFeature(): Promise<void> {
    await this.openCSVViewer('chinamedia.csv', '国产媒体配置分析');
  }
  //chineseapps
  async handleAnalysisChineseappsFeature(): Promise<void> {
    await this.openCSVViewer('chineseapps.csv', '国产应用配置分析');
  }
  //chineseim
  async handleAnalysisChineseimFeature(): Promise<void> {
    await this.openCSVViewer('chineseim.csv', '国产IM配置分析');
  }
  // chrome
  async handleAnalysisChromeFeature(): Promise<void> {
    await this.openCSVViewer('chrome.csv', 'Chrome浏览器配置分析');
  }
  // clipboard
  async handleAnalysisClipboardFeature(): Promise<void> {
    await this.openCSVViewer('clipboard.csv', '剪贴板配置分析');
  }
  // download
  async handleAnalysisDownloadFeature(): Promise<void> {
    await this.openCSVViewer('downloads.csv', '下载管理器和浏览器下载配置分析');
  }
  // rdp
  async handleAnalysisRDPFeature(): Promise<void> {
    await this.openCSVViewer('rdp.csv', 'RDP配置分析');
  }
  // analysis_recently_opened_documents
  async handleAnalysisRecentlyOpenedDocumentsFeature(): Promise<void> {
    await this.openCSVViewer('recentdocs.csv', '最近打开的文档');
  }
  // edge
  async handleAnalysisEdgeFeature(): Promise<void> {
    await this.openCSVViewer('edge.csv', 'Edge浏览器配置分析');
  }
  // firefox
  async handleAnalysisFirefoxFeature(): Promise<void> {
    await this.openCSVViewer('firefox.csv', 'Firefox浏览器配置分析');
  }
  // fileassoc
  async handleAnalysisFileassocFeature(): Promise<void> {
    await this.openCSVViewer('fileassoc.csv', '文件关联配置分析');
  }
  //onedrive
  async handleAnalysisOnedriveFeature(): Promise<void> {
    await this.openCSVViewer('onedrive.csv', 'OneDrive配置分析');
  }
  //mru
  async handleAnalysisMRUFeature(): Promise<void> {
    await this.openCSVViewer('mru.csv', 'MRU配置分析');
  }
  //runmru
  async handleAnalysisRunMRUFeature(): Promise<void> {
    await this.openCSVViewer('runmru.csv', 'RunMRU配置分析');
  }
  //shellbags
  async handleAnalysisShellbagsFeature(): Promise<void> {
    await this.openCSVViewer('shellbags.csv', 'ShellBags配置分析');
  }
  //typedpaths
  async handleAnalysisTypedpathsFeature(): Promise<void> {
    await this.openCSVViewer('typedpaths.csv', 'TypedPaths配置分析');
  }
  //userassist
  async handleAnalysisUserassistFeature(): Promise<void> {
    await this.openCSVViewer('userassist.csv', 'UserAssist配置分析');
  }
  //wechat
  async handleAnalysisWechatFeature(): Promise<void> {
    await this.openCSVViewer('wechat.csv', 'WeChat配置分析');
  }
  //steam
  async handleAnalysisSteamFeature(): Promise<void> {
    await this.openCSVViewer('steam.csv', 'Steam配置分析');
  }
  //epic
  async handleAnalysisEpicFeature(): Promise<void> {
    await this.openCSVViewer('epic.csv', 'Epic配置分析');
  }
  //wegame
  async handleAnalysisWegameFeature(): Promise<void> {
    await this.openCSVViewer('wegame.csv', 'WeGame配置分析');
  }
  //mihoyo
  async handleAnalysisMihoyoFeature(): Promise<void> {
    await this.openCSVViewer('mihoyo.csv', '米哈游游戏配置');
  }

  async handleExportEventlogFeature(): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';

      ProgressManager.show('正在导出事件日志...');
      updateStatus('正在导出事件日志...');

      // 源目录路径
      const sourceDir = mountPath('misc', 'eventlog');
      // 目标目录路径
      const targetDir = `${outputPath}\\日志`;

      // 调用后端命令复制整个目录
      const result = await invoke('copy_directory_recursive', {
        sourcePath: sourceDir,
        targetPath: targetDir
      }) as string;

      ProgressManager.hide();
      updateStatus('事件日志导出完成');
      this.stateManager.addCommandOutput(`📁 事件日志导出完成: ${result}`);
      MessageManager.showSuccess(`事件日志导出完成: ${result}`);

    } catch (error) {
      ProgressManager.hide();
      console.error('导出事件日志失败:', error);
      updateStatus('导出事件日志失败');
      MessageManager.showError(`导出失败: ${error}`);
      this.stateManager.addCommandOutput(`❌ 导出事件日志失败: ${error}`);
    }
  }

  async handleExportRegistryFeature(): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';

      ProgressManager.show('正在导出注册表...');
      updateStatus('正在导出注册表...');

      // 源目录路径
      const sourceDir = mountPath('registry', 'hive_files');
      // 目标目录路径
      const targetDir = `${outputPath}\\注册表`;

      // 调用后端命令复制整个目录
      const result = await invoke('copy_directory_recursive', {
        sourcePath: sourceDir,
        targetPath: targetDir
      }) as string;

      ProgressManager.hide();
      updateStatus('注册表导出完成');
      this.stateManager.addCommandOutput(`📁 注册表导出完成: ${result}`);
      MessageManager.showSuccess(`注册表导出完成: ${result}`);

    } catch (error) {
      ProgressManager.hide();
      console.error('导出注册表失败:', error);
      updateStatus('导出注册表失败');
      MessageManager.showError(`导出失败: ${error}`);
      this.stateManager.addCommandOutput(`❌ 导出注册表失败: ${error}`);
    }
  }

  async handleExportCertsFeature(): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';

      ProgressManager.show('正在导出证书...');
      updateStatus('正在导出证书...');

      // 源目录路径
      const sourceDir = mountPath('sys', 'certificates');
      // 目标目录路径
      const targetDir = `${outputPath}\\证书`;

      // 调用后端命令复制整个目录
      const result = await invoke('copy_directory_recursive', {
        sourcePath: sourceDir,
        targetPath: targetDir
      }) as string;

      ProgressManager.hide();
      updateStatus('证书导出完成');
      this.stateManager.addCommandOutput(`📁 证书导出完成: ${result}`);
      MessageManager.showSuccess(`证书导出完成: ${result}`);

    } catch (error) {
      ProgressManager.hide();
      console.error('导出证书失败:', error);
      updateStatus('导出证书失败');
      MessageManager.showError(`导出失败: ${error}`);
      this.stateManager.addCommandOutput(`❌ 导出证书失败: ${error}`);
    }
  }

  async handleProductIdFeature(): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';

      ProgressManager.show('正在获取产品ID...');
      updateStatus('正在获取产品ID...');

      // 产品ID文件路径
      const sourceFile = mountPathFwd('registry', 'HKLM', 'SOFTWARE', 'Microsoft', 'Windows NT', 'CurrentVersion', 'ProductId');
      const targetFile = `${outputPath}\\ProductId.txt`;

      try {
        // 复制文件到输出目录
        const content = await invoke('read_file', { path: sourceFile }) as string;
        await invoke('write_file', {
          path: targetFile,
          content: content
        });

        ProgressManager.hide();
        updateStatus('产品ID获取完成');
        this.stateManager.addCommandOutput(`🆔 产品ID文件已复制到: ${targetFile}`);

        // 使用文本查看器打开文件
        await invoke('open_text_viewer', {
          textFilePath: targetFile,
          windowTitle: 'MemProcFS - 产品ID'
        });

        MessageManager.showSuccess('产品ID文件已复制并打开');

      } catch (error) {
        ProgressManager.hide();
        console.error('获取产品ID失败:', error);
        updateStatus('获取产品ID失败');
        MessageManager.showError(`获取失败: ${error}`);
        this.stateManager.addCommandOutput(`❌ 获取产品ID失败: ${error}`);
      }

    } catch (error) {
      ProgressManager.hide();
      console.error('获取产品ID失败:', error);
      updateStatus('获取产品ID失败');
      MessageManager.showError(`获取失败: ${error}`);
      this.stateManager.addCommandOutput(`❌ 获取产品ID失败: ${error}`);
    }
  }

  async handleGetDtbFeature(): Promise<void> {
    try {
      // 获取用户设置中的输出路径
      const settings = await loadAppSettings();
      const outputPath = settings.output_path || 'output';

      ProgressManager.show('正在获取DTB...');
      updateStatus('正在获取DTB...');

      // DTB文件路径
      const sourceFile = mountPath('misc', 'procinfo', 'dtb.txt');
      const targetFile = `${outputPath}\\dtb.txt`;

      try {
        // 复制文件到输出目录
        const content = await invoke('read_file', { path: sourceFile }) as string;
        await invoke('write_file', {
          path: targetFile,
          content: content
        });

        ProgressManager.hide();
        updateStatus('DTB获取完成');
        this.stateManager.addCommandOutput(`🧠 DTB文件已复制到: ${targetFile}`);

        // 使用文本查看器打开文件
        await invoke('open_text_viewer', {
          textFilePath: targetFile,
          windowTitle: 'MemProcFS - DTB信息'
        });

        MessageManager.showSuccess('DTB文件已复制并打开');

      } catch (error) {
        ProgressManager.hide();
        console.error('获取DTB失败:', error);
        updateStatus('获取DTB失败');
        MessageManager.showError(`获取失败: ${error}`);
        this.stateManager.addCommandOutput(`❌ 获取DTB失败: ${error}`);
      }

    } catch (error) {
      ProgressManager.hide();
      console.error('获取DTB失败:', error);
      updateStatus('获取DTB失败');
      MessageManager.showError(`获取失败: ${error}`);
      this.stateManager.addCommandOutput(`❌ 获取DTB失败: ${error}`);
    }
  }
} 
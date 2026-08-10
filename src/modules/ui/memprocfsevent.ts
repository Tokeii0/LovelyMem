/**
 * MemProcFS 事件处理器
 * 专门处理所有 MemProcFS 相关功能的事件
 */

import { LovelymemApp } from '../core/app';
import { updateStatus } from '../utils/helpers';

export class MemProcFSEventHandler {
  private app: LovelymemApp;

  constructor(app: LovelymemApp) {
    this.app = app;
  }

  /**
   * 处理 MemProcFS 功能点击事件
   */
  handleMemProcFSFeature(feature: string): void {
    // 移除 memprocfs- 前缀，获取实际功能名
    const actualFeature = feature.replace(/^memprocfs-/, '');
    console.log(`🔍 DEBUG: 启动MemProcFS ${actualFeature}功能`);

    // 根据功能类型调用相应的处理方法
    switch (actualFeature) {
      case 'sys_info':
        this.app.featureHandlers.handleSysInfoFeature();
        break;
      case 'proc_info':
        this.app.featureHandlers.handleProcInfoFeature();
        break;
      case 'module_info':
        this.app.featureHandlers.handleModuleInfoFeature();
        break;
      case 'net_info':
        this.app.featureHandlers.handleNetInfoFeature();
        break;
      case 'tasks':
        this.app.featureHandlers.handleTasksFeature();
        break;
      case 'drivers':
        this.app.featureHandlers.handleDriversFeature();
        break;
      case 'handles':
        this.app.featureHandlers.handleHandlesFeature();
        break;
      case 'services':
        this.app.featureHandlers.handleServicesFeature();
        break;
      case 'all_files':
        this.app.featureHandlers.handleAllFilesFeature();
        break;
      case 'yara_scan':
        this.app.featureHandlers.handleYaraScanFeature();
        break;
      case 'yara_detail':
        this.app.featureHandlers.handleYaraDetailFeature();
        break;
      case 'malware_detect':
        this.app.featureHandlers.handleMalwareDetectFeature();
        break;
      case 'export_eventlog':
        this.app.featureHandlers.handleExportEventlogFeature();
        break;
      case 'export_registry':
        this.app.featureHandlers.handleExportRegistryFeature();
        break;
      case 'export_certs':
        this.app.featureHandlers.handleExportCertsFeature();
        break;
      case 'product_id':
        this.app.featureHandlers.handleProductIdFeature();
        break;
      case 'get_dtb':
        this.app.featureHandlers.handleGetDtbFeature();
        break;
        case 'timeline_network':
        this.app.featureHandlers.handleNetworkTimelineFeature();
        break;
      case 'timeline_ntfs':
        this.app.featureHandlers.handleNTFSTimelineFeature();
        break;
      case 'timeline_process':
        this.app.featureHandlers.handleProcessTimelineFeature();
        break;
      case 'timeline_web':
        this.app.featureHandlers.handleWebTimelineFeature();
        break;
      case 'timeline_registry':
        this.app.featureHandlers.handleRegistryTimelineFeature();
        break;
      case 'timeline_tasks':
        this.app.featureHandlers.handleTasksTimelineFeature();
        break;
      case 'timeline_prefetch':
        this.app.featureHandlers.handlePrefetchTimelineFeature();
        break;
      case 'bitlocker_key':
        this.app.featureHandlers.handleBitlockerKeyFeature();
        break;
      case 'netdns':
        this.app.featureHandlers.handleNetDnsFeature();
        break;
      case 'accounts':
        this.app.featureHandlers.handleAccountsFeature();
        break;
      case 'activity':
        this.app.featureHandlers.handleActivityFeature();
        break;
      case 'analysis_file':
        this.app.featureHandlers.handleAnalysisFileFeature();
        break;
      case 'analysis_appcompat':
        this.app.featureHandlers.handleAnalysisAppcompatFeature();
        break;
      case 'analysis_cmdline':
        this.app.featureHandlers.handleAnalysisCmdlineFeature();
        break;
      case 'analysis_crashdump':
        this.app.featureHandlers.handleAnalysisCrashdumpFeature();
        break;
      case 'analysis_environ':
        this.app.featureHandlers.handleAnalysisEnvironFeature();
        break;
      case 'analysis_eventlog':
        this.app.featureHandlers.handleAnalysisEventlogFeature();
        break;
      case 'analysis_extensions':
        this.app.featureHandlers.handleAnalysisExtensionsFeature();
        break;
      case 'analysis_browser_config':
        this.app.featureHandlers.handleAnalysisBrowserConfigFeature();
        break;
      case 'analysis_patches':
        this.app.featureHandlers.handleAnalysisPatchesFeature();
        break;
      case 'analysis_policies':
        this.app.featureHandlers.handleAnalysisPoliciesFeature();
        break;
      case 'analysis_printers':
        this.app.featureHandlers.handleAnalysisPrintersFeature();
        break;
      case 'analysis_privacy':
        this.app.featureHandlers.handleAnalysisPrivacyFeature();
        break;
      case 'analysis_security':
        this.app.featureHandlers.handleAnalysisSecurityFeature();
        break;
      case 'analysis_shares':
        this.app.featureHandlers.handleAnalysisSharesFeature();
        break;
      case 'analysis_shimcache':
        this.app.featureHandlers.handleAnalysisShimcacheFeature();
        break;
      case 'analysis_software':
        this.app.featureHandlers.handleAnalysisSoftwareFeature();
        break;
      case 'analysis_startup':
        this.app.featureHandlers.handleAnalysisStartupFeature();
        break;
      case 'analysis_timezone':
        this.app.featureHandlers.handleAnalysisTimezoneFeature();
        break;
      case 'analysis_usbstor':
        this.app.featureHandlers.handleAnalysisUsbstorFeature();
        break;
      case 'analysis_wmi':
        this.app.featureHandlers.handleAnalysisWmiFeature();
        break;
      case 'analysis_virtualization':
        this.app.featureHandlers.handleAnalysisVirtualizationFeature();
        break;
      case 'analysis_wireless':
        this.app.featureHandlers.handleAnalysisWirelessFeature();
        break;
      case 'analysis_ie_browser_history':
        this.app.featureHandlers.handleAnalysisBrowserFeature();
        break;
      case 'analysis_chinabrowser':
        this.app.featureHandlers.handleAnalysisChinabrowserFeature();
        break;
      case 'analysis_chinacloud':
        this.app.featureHandlers.handleAnalysisChinacloudFeature();
        break;
      case 'analysis_chinamedia':
        this.app.featureHandlers.handleAnalysisChinamediaFeature();
        break;
      case 'analysis_chinaapp':
        this.app.featureHandlers.handleAnalysisChineseappsFeature();
        break;
      case 'analysis_chinaim':
        this.app.featureHandlers.handleAnalysisChineseimFeature();
        break;
      case 'analysis_chrome':
        this.app.featureHandlers.handleAnalysisChromeFeature();
        break;
      case 'analysis_clipboard':
        this.app.featureHandlers.handleAnalysisClipboardFeature();
        break;
      case 'analysis_download':
        this.app.featureHandlers.handleAnalysisDownloadFeature();
        break;
      case 'analysis_rdp':
        this.app.featureHandlers.handleAnalysisRDPFeature();
        break;
      case 'analysis_edge':
        this.app.featureHandlers.handleAnalysisEdgeFeature();
        break;
      case 'analysis_firefox':
        this.app.featureHandlers.handleAnalysisFirefoxFeature();
        break;
      case 'analysis_fileassoc':
        this.app.featureHandlers.handleAnalysisFileassocFeature();
        break;
      case 'analysis_recently_opened_documents':
        this.app.featureHandlers.handleAnalysisRecentlyOpenedDocumentsFeature();
        break;
      case 'analysis_mru':
        this.app.featureHandlers.handleAnalysisMRUFeature();
        break;
      case 'analysis_runmru':
        this.app.featureHandlers.handleAnalysisRunMRUFeature();
        break;
      case 'analysis_onedrive':
        this.app.featureHandlers.handleAnalysisOnedriveFeature();
        break;
      case 'analysis_shellbags':
        this.app.featureHandlers.handleAnalysisShellbagsFeature();
        break;
      case 'analysis_typedpaths':
        this.app.featureHandlers.handleAnalysisTypedpathsFeature();
        break;
      case 'analysis_userassist':
        this.app.featureHandlers.handleAnalysisUserassistFeature();
        break;
      case 'analysis_wechat':
        this.app.featureHandlers.handleAnalysisWechatFeature();
        break;
      case 'analysis_steam':
        this.app.featureHandlers.handleAnalysisSteamFeature();
        break;
      case 'analysis_epic':
        this.app.featureHandlers.handleAnalysisEpicFeature();
        break;
      case 'analysis_wegame':
        this.app.featureHandlers.handleAnalysisWegameFeature();
        break;
      case 'analysis_mihoyo':
        this.app.featureHandlers.handleAnalysisMihoyoFeature();
        break;
      default:
        console.log('未实现的MemProcFS功能:', actualFeature);
        updateStatus(`MemProcFS功能开发中: ${actualFeature}`);
    }
  }

  /**
   * 检查是否是 MemProcFS 功能
   */
  static isMemProcFSFeature(feature: string): boolean {
    return feature.startsWith('memprocfs-');
  }

  /**
   * 获取所有支持的 MemProcFS 功能列表
   */
  static getSupportedFeatures(): string[] {
    return [
      'memprocfs-sys_info',
      'memprocfs-proc_info',
      'memprocfs-module_info',
      'memprocfs-net_info', 
      'memprocfs-tasks',
      'memprocfs-drivers',
      'memprocfs-handles',
      'memprocfs-services',
      'memprocfs-all_files',
      'memprocfs-yara_scan',
      'memprocfs-yara_detail',
      'memprocfs-malware_detect',
      'memprocfs-export_eventlog',
      'memprocfs-export_registry',
      'memprocfs-export_certs',
      'memprocfs-product_id',
      'memprocfs-get_dtb',
      'memprocfs-timeline_network',
      'memprocfs-timeline_ntfs',
      'memprocfs-timeline_process',
      'memprocfs-timeline_web',
      'memprocfs-timeline_registry',
      'memprocfs-timeline_tasks',
      'memprocfs-timeline_prefetch',
      'memprocfs-bitlocker_key'
    ];
  }
} 
import { CSVManager } from './features/csv';
import { TextManager } from './features/text';
import { MemProcFSManager } from './features/memprocfs';
import { EXIFManager } from './features/exif';
import { MemoryFileBrowserManager } from './memory-file-browser/MemoryFileBrowserManager';
import { Volatility2Executor } from './volatility/volatility2Executor';
import { Volatility3Executor } from './volatility/volatility3Executor';
import { Vol3LinuxExecutor } from './volatility/vol3LinuxExecutor';
import { MemNixFSManager } from './features/memnixfs-linux';

export class FeatureHandlers {
    constructor(
        private csvManager: CSVManager,
        private textManager: TextManager,
        private memoryFileBrowserManager: MemoryFileBrowserManager,
        private exifManager: EXIFManager,
        private memProcFSManager: MemProcFSManager,
        private volatility2Executor: Volatility2Executor,
        private volatility3Executor: Volatility3Executor,
        private vol3LinuxExecutor: Vol3LinuxExecutor,
        private memNixFSManager: MemNixFSManager
    ) {}

    // CSV功能
    handleCSVReaderFeature(): void {
        this.csvManager.handleCSVReaderFeature();
    }

    // 文本查看器功能
    handleTextViewerFeature(): void {
        this.textManager.handleTextViewerFeature();
    }

    // 内存文件浏览器功能
    handleMemoryFileBrowserFeature(): void {
        this.memoryFileBrowserManager.show();
    }

    // EXIF查看器功能
    handleEXIFViewerFeature(): void {
        this.exifManager.openEXIFViewer();
    }

    // MemProcFS功能
    handleSysInfoFeature(): void {
        this.memProcFSManager.handleSysInfoFeature();
    }

    handleProcInfoFeature(): void {
        this.memProcFSManager.handleProcInfoFeature();
    }

    handleModuleInfoFeature(): void {
        this.memProcFSManager.handleModuleInfoFeature();
    }

    handleNetInfoFeature(): void {
        this.memProcFSManager.handleNetInfoFeature();
    }

    handleTasksFeature(): void {
        this.memProcFSManager.handleTasksFeature();
    }

    handleDriversFeature(): void {
        this.memProcFSManager.handleDriversFeature();
    }

    handleHandlesFeature(): void {
        this.memProcFSManager.handleHandlesFeature();
    }

    handleServicesFeature(): void {
        this.memProcFSManager.handleServicesFeature();
    }

    handleAllFilesFeature(): void {
        this.memProcFSManager.handleAllFilesFeature();
    }

    handleYaraScanFeature(): void {
        this.memProcFSManager.handleYaraScanFeature();
    }

    handleYaraDetailFeature(): void {
        this.memProcFSManager.handleYaraDetailFeature();
    }

    handleMalwareDetectFeature(): void {
        this.memProcFSManager.handleMalwareDetectFeature();
    }

    handleExportEventlogFeature(): void {
        this.memProcFSManager.handleExportEventlogFeature();
    }

    handleExportRegistryFeature(): void {
        this.memProcFSManager.handleExportRegistryFeature();
    }

    handleExportCertsFeature(): void {
        this.memProcFSManager.handleExportCertsFeature();
    }

    handleProductIdFeature(): void {
        this.memProcFSManager.handleProductIdFeature();
    }

    handleGetDtbFeature(): void {
        this.memProcFSManager.handleGetDtbFeature();
    }

    handleNTFSTimelineFeature(): void {
        this.memProcFSManager.handleNTFSTimelineFeature();
    }

    handleProcessTimelineFeature(): void {
        this.memProcFSManager.handleProcessTimelineFeature();
    }

    handleNetworkTimelineFeature(): void {
        this.memProcFSManager.handleNetworkTimelineFeature();
    }

    handleWebTimelineFeature(): void {
        this.memProcFSManager.handleWebTimelineFeature();
    }
    handleRegistryTimelineFeature(): void {
        this.memProcFSManager.handleRegistryTimelineFeature();
    }

    handleTasksTimelineFeature(): void {
        this.memProcFSManager.handleTasksTimelineFeature();
    }

    handlePrefetchTimelineFeature(): void {
        this.memProcFSManager.handlePrefetchTimelineFeature();
    }

    handleBitlockerKeyFeature(): void {
        this.memProcFSManager.handleBitlockerKeyFeature();
    }

    handleNetDnsFeature(): void {
        this.memProcFSManager.handleNetDnsFeature();
    }

    handleAccountsFeature(): void {
        this.memProcFSManager.handleAccountsFeature();
    }

    handleActivityFeature(): void {
        this.memProcFSManager.handleActivityFeature();
    }

    handleAnalysisFileFeature(): void {
        this.memProcFSManager.handleAnalysisFileFeature();
    }

    handleAnalysisAppcompatFeature(): void {
        this.memProcFSManager.handleAnalysisAppcompatFeature();
    }

    handleAnalysisCmdlineFeature(): void {
        this.memProcFSManager.handleAnalysisCmdlineFeature();
    }

    handleAnalysisCrashdumpFeature(): void {
        this.memProcFSManager.handleAnalysisCrashdumpFeature();
    }

    handleAnalysisEnvironFeature(): void {
        this.memProcFSManager.handleAnalysisEnvironFeature();
    }

    handleAnalysisEventlogFeature(): void {
        this.memProcFSManager.handleAnalysisEventlogFeature();
    }

    handleAnalysisExtensionsFeature(): void {
        this.memProcFSManager.handleAnalysisExtensionsFeature();
    }

    handleAnalysisBrowserConfigFeature(): void {
        this.memProcFSManager.handleAnalysisBrowserConfigFeature();
    }

    handleAnalysisPatchesFeature(): void {
        this.memProcFSManager.handleAnalysisPatchesFeature();
    }

    handleAnalysisPoliciesFeature(): void {
        this.memProcFSManager.handleAnalysisPoliciesFeature();
    }

    handleAnalysisPrintersFeature(): void {
        this.memProcFSManager.handleAnalysisPrintersFeature();
    }

    handleAnalysisPrivacyFeature(): void {
        this.memProcFSManager.handleAnalysisPrivacyFeature();
    }

    handleAnalysisSecurityFeature(): void {
        this.memProcFSManager.handleAnalysisSecurityFeature();
    }

    handleAnalysisSharesFeature(): void {
        this.memProcFSManager.handleAnalysisSharesFeature();
    }

    handleAnalysisShimcacheFeature(): void {
        this.memProcFSManager.handleAnalysisShimcacheFeature();
    }

    handleAnalysisSoftwareFeature(): void {
        this.memProcFSManager.handleAnalysisSoftwareFeature();
    }

    handleAnalysisStartupFeature(): void {
        this.memProcFSManager.handleAnalysisStartupFeature();
    }

    handleAnalysisTimezoneFeature(): void {
        this.memProcFSManager.handleAnalysisTimezoneFeature();
    }

    handleAnalysisUsbstorFeature(): void {
        this.memProcFSManager.handleAnalysisUsbstorFeature();
    }

    handleAnalysisWmiFeature(): void {
        this.memProcFSManager.handleAnalysisWmiFeature();
    }

    handleAnalysisVirtualizationFeature(): void {
        this.memProcFSManager.handleAnalysisVirtualizationFeature();
    }

    handleAnalysisWirelessFeature(): void {
        this.memProcFSManager.handleAnalysisWirelessFeature();
    }

    handleAnalysisBrowserFeature(): void {
        this.memProcFSManager.handleAnalysisBrowserFeature();
    }

    handleAnalysisChinabrowserFeature(): void {
        this.memProcFSManager.handleAnalysisChinabrowserFeature();
    }

    handleAnalysisChinacloudFeature(): void {
        this.memProcFSManager.handleAnalysisChinacloudFeature();
    }

    handleAnalysisChinamediaFeature(): void {
        this.memProcFSManager.handleAnalysisChinamediaFeature();
    }

    handleAnalysisChineseappsFeature(): void {
        this.memProcFSManager.handleAnalysisChineseappsFeature();
    }

    handleAnalysisChineseimFeature(): void {
        this.memProcFSManager.handleAnalysisChineseimFeature();
    }

    handleAnalysisChromeFeature(): void {
        this.memProcFSManager.handleAnalysisChromeFeature();
    }

    handleAnalysisClipboardFeature(): void {
        this.memProcFSManager.handleAnalysisClipboardFeature();
    }

    handleAnalysisDownloadFeature(): void {
        this.memProcFSManager.handleAnalysisDownloadFeature();
    }

    handleAnalysisRDPFeature(): void {
        this.memProcFSManager.handleAnalysisRDPFeature();
    }

    handleAnalysisEdgeFeature(): void {
        this.memProcFSManager.handleAnalysisEdgeFeature();
    }

    handleAnalysisFirefoxFeature(): void {
        this.memProcFSManager.handleAnalysisFirefoxFeature();
    }

    handleAnalysisFileassocFeature(): void {
        this.memProcFSManager.handleAnalysisFileassocFeature();
    }

    handleAnalysisMRUFeature(): void {
        this.memProcFSManager.handleAnalysisMRUFeature();
    }

    handleAnalysisRunMRUFeature(): void {
        this.memProcFSManager.handleAnalysisRunMRUFeature();
    }

    handleAnalysisShellbagsFeature(): void {
        this.memProcFSManager.handleAnalysisShellbagsFeature();
    }

    handleAnalysisTypedpathsFeature(): void {
        this.memProcFSManager.handleAnalysisTypedpathsFeature();
    }

    handleAnalysisUserassistFeature(): void {
        this.memProcFSManager.handleAnalysisUserassistFeature();
    }

    handleAnalysisWechatFeature(): void {
        this.memProcFSManager.handleAnalysisWechatFeature();
    }
    handleAnalysisOnedriveFeature(): void {
        this.memProcFSManager.handleAnalysisOnedriveFeature();
    }
    handleAnalysisRecentlyOpenedDocumentsFeature(): void {
        this.memProcFSManager.handleAnalysisRecentlyOpenedDocumentsFeature();
    }
    handleAnalysisSteamFeature(): void {
        this.memProcFSManager.handleAnalysisSteamFeature();
    }
    handleAnalysisEpicFeature(): void {
        this.memProcFSManager.handleAnalysisEpicFeature();
    }
    handleAnalysisWegameFeature(): void {
        this.memProcFSManager.handleAnalysisWegameFeature();
    }
    handleAnalysisMihoyoFeature(): void {
        this.memProcFSManager.handleAnalysisMihoyoFeature();
    }

    async handleVol3LinuxFeature(feature: string): Promise<void> {
        await this.vol3LinuxExecutor.executeFeature(feature);
    }

    // MemNixFS（Linux 内存取证）功能
    async handleMemNixFSFeature(feature: string): Promise<void> {
        await this.memNixFSManager.handleFeature(feature);
    }

    async handleVolatility2Feature(feature: string): Promise<void> {
        await this.volatility2Executor.executeFeature(feature);
    }

    async handleVolatility3Feature(feature: string): Promise<void> {
        await this.volatility3Executor.executeFeature(feature);
    }
}

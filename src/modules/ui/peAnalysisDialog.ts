//! PE分析对话框组件
//! 用于显示PE文件的详细分析结果

import { invoke } from '@tauri-apps/api/core';
import { IconParkHelper } from '../utils/iconparkHelper';

// PE解析结果类型定义
export interface PESection {
    name: string;
    virtual_address: string;
    virtual_size: number;
    raw_size: number;
    raw_offset: number;
    characteristics: string;
    characteristics_desc: string[];
    entropy: number;
}

export interface PEImport {
    dll_name: string;
    functions: string[];
}

export interface PEExport {
    name: string;
    ordinal: number;
    rva: string;
}

export interface PEHeaderDetails {
    dos_magic: string;
    pe_offset: string;
    coff_characteristics: string[];
    linker_version: string;
    size_of_code: number;
    size_of_initialized_data: number;
    size_of_uninitialized_data: number;
    section_alignment: number;
    file_alignment: number;
    os_version: string;
    image_version: string;
    subsystem_version: string;
    size_of_image: number;
    size_of_headers: number;
    checksum: string;
    stack_reserve: number;
    stack_commit: number;
    heap_reserve: number;
    heap_commit: number;
    number_of_rva_and_sizes: number;
}

export interface SecurityFeatures {
    aslr: boolean;
    dep: boolean;
    seh: boolean;
    cfg: boolean;
    high_entropy_va: boolean;
    force_integrity: boolean;
    app_container: boolean;
    terminal_server_aware: boolean;
    features_list: string[];
    dll_characteristics: string;
}

export interface DataDirectory {
    name: string;
    index: number;
    rva: string;
    size: number;
    present: boolean;
}

export interface FileHashes {
    md5: string;
    sha1: string;
    sha256: string;
}

export interface SectionEntropy {
    name: string;
    entropy: number;
    suspicious: boolean;
}

export interface EntropyInfo {
    file_entropy: number;
    is_suspicious: boolean;
    section_entropy: SectionEntropy[];
}

// 新增类型
export interface VersionInfo {
    file_version: string;
    product_version: string;
    company_name: string;
    file_description: string;
    internal_name: string;
    original_filename: string;
    product_name: string;
    legal_copyright: string;
    legal_trademarks: string;
    comments: string;
    private_build: string;
    special_build: string;
}

export interface ResourceTypeInfo {
    type_name: string;
    type_id: number;
    count: number;
}

export interface ResourceInfo {
    version_info: VersionInfo | null;
    has_manifest: boolean;
    manifest_content: string | null;
    has_icon: boolean;
    resource_types: ResourceTypeInfo[];
    total_resources: number;
}

export interface DebugEntry {
    debug_type: string;
    size: number;
    rva: string;
    pointer_to_raw_data: number;
}

export interface DebugInfo {
    has_debug: boolean;
    debug_type: string;
    pdb_path: string | null;
    pdb_guid: string | null;
    pdb_age: number | null;
    timestamp: string | null;
    debug_entries: DebugEntry[];
}

export interface RichHeaderEntry {
    build_id: number;
    product_id: number;
    count: number;
    product_name: string;
    vs_version: string;
}

export interface RichHeaderInfo {
    present: boolean;
    checksum: string;
    entries: RichHeaderEntry[];
    compiler_info: string[];
}

export interface ImportClassification {
    file_operations: string[];
    registry_operations: string[];
    network_operations: string[];
    process_operations: string[];
    memory_operations: string[];
    crypto_operations: string[];
    anti_debug: string[];
    injection: string[];
    other: string[];
    suspicious_count: number;
    total_classified: number;
}

export interface PEParseResult {
    filename: string;
    file_size: number;
    is_64bit: boolean;
    is_dll: boolean;
    machine_type: string;
    entry_point: string;
    image_base: string;
    timestamp: string;
    subsystem: string;
    number_of_sections: number;
    sections: PESection[];
    imports: PEImport[];
    exports: PEExport[];
    import_count: number;
    export_count: number;
    output_dir: string;
    header_details: PEHeaderDetails;
    security: SecurityFeatures;
    data_directories: DataDirectory[];
    hashes: FileHashes;
    entropy: EntropyInfo;
    resources: ResourceInfo;
    debug_info: DebugInfo;
    rich_header: RichHeaderInfo;
    import_classification: ImportClassification;
}

/**
 * PE分析对话框管理器
 */
export class PEAnalysisDialog {
    
    /**
     * 创建loading提示覆盖层
     */
    public static createLoadingOverlay(filename: string): HTMLElement {
        const overlay = document.createElement('div');
        overlay.className = 'pe-loading-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10002;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;
        
        const iconAnalyze = IconParkHelper.getSvgString('analysis', { size: 32 });
        
        const content = document.createElement('div');
        content.style.cssText = `
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 30px 40px;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        `;
        
        content.innerHTML = `
            <div style="margin-bottom: 16px; color: var(--primary-color);">
                <div class="pe-loading-spinner" style="
                    display: inline-block;
                    animation: pe-spin 1s linear infinite;
                ">${iconAnalyze}</div>
            </div>
            <div style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                正在分析PE文件
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); max-width: 300px; word-break: break-all;">
                ${filename}
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 12px;">
                正在计算哈希值、熵值和解析结构...
            </div>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pe-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        content.appendChild(style);
        
        overlay.appendChild(content);
        return overlay;
    }

    /**
     * 显示PE分析错误对话框
     */
    public static showErrorDialog(filename: string, errorMessage: string): void {
        const overlay = document.createElement('div');
        overlay.className = 'pe-analysis-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        `;

        const iconError = IconParkHelper.getSvgString('close-one', { size: 48 });

        dialog.innerHTML = `
            <div style="text-align: center; margin-bottom: 16px;">
                <span style="color: #ef4444;">${iconError}</span>
            </div>
            <h3 style="margin: 0 0 12px 0; text-align: center; color: var(--text-primary);">PE文件分析失败</h3>
            <p style="margin: 0 0 8px 0; color: var(--text-secondary); font-size: 13px;">文件: ${filename}</p>
            <p style="margin: 0 0 20px 0; color: #ef4444; font-size: 13px; word-break: break-all;">${errorMessage}</p>
            <div style="text-align: center;">
                <button class="pe-close-btn" style="
                    padding: 8px 24px;
                    background: var(--primary-color);
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                ">关闭</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        dialog.querySelector('.pe-close-btn')?.addEventListener('click', () => overlay.remove());

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
    }

    /**
     * 显示PE分析结果对话框
     */
    public static show(result: PEParseResult): void {
        const overlay = document.createElement('div');
        overlay.className = 'pe-analysis-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;

        const dialog = document.createElement('div');
        dialog.className = 'pe-analysis-dialog';
        dialog.style.cssText = `
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 0;
            width: 950px;
            max-width: 95vw;
            max-height: 90vh;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        const iconAnalyze = IconParkHelper.getSvgString('analysis', { size: 20 });
        const iconFolder = IconParkHelper.getSvgString('folder-open', { size: 14 });

        // 格式化文件大小
        const formatSize = (bytes: number): string => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        // 熵值进度条颜色
        const getEntropyColor = (entropy: number): string => {
            if (entropy > 7.0) return '#ef4444';
            if (entropy > 6.0) return '#f59e0b';
            return '#10b981';
        };

        // 安全特性状态图标和颜色
        const getSecurityIcon = (enabled: boolean): string => {
            return enabled ? '<span style="color: #10b981;">✓</span>' : '<span style="color: #ef4444;">✗</span>';
        };

        // 安全特性定义（带中文翻译）
        const securityFeatures = [
            { key: 'aslr', name: 'ASLR', desc: '地址空间随机化', tip: '防止攻击者预测内存地址' },
            { key: 'dep', name: 'DEP/NX', desc: '数据执行保护', tip: '阻止数据区域代码执行' },
            { key: 'cfg', name: 'CFG', desc: '控制流保护', tip: '防止恶意代码劫持控制流' },
            { key: 'seh', name: 'SEH', desc: '结构化异常处理', tip: '支持Windows异常处理机制' },
            { key: 'high_entropy_va', name: 'HEVA', desc: '高熵虚拟地址', tip: '增强ASLR随机化效果' },
            { key: 'force_integrity', name: 'Integrity', desc: '强制完整性检查', tip: '要求代码签名验证' },
            { key: 'app_container', name: 'AppContainer', desc: '应用容器', tip: 'UWP应用沙箱隔离' },
            { key: 'terminal_server_aware', name: 'TS Aware', desc: '终端服务感知', tip: '支持远程桌面多用户' },
        ];

        // 生成安全特性HTML
        const securityHtml = result.security ? `
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 11px;">
                ${securityFeatures.map(f => {
                    const enabled = (result.security as any)[f.key];
                    return `
                        <div style="background: var(--bg-secondary); padding: 8px 10px; border-radius: 6px; display: flex; align-items: center; gap: 8px;" title="${f.tip}">
                            <span style="font-size: 14px;">${getSecurityIcon(enabled)}</span>
                            <div style="flex: 1; min-width: 0;">
                                <div style="color: var(--text-primary); font-weight: 500;">${f.name}</div>
                                <div style="color: var(--text-secondary); font-size: 10px;">${f.desc}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        ` : '<div style="color: var(--text-secondary);">无安全特性信息</div>';

        // 多维度可疑度分析
        const analyzeSuspiciousness = () => {
            const issues: { level: 'high' | 'medium' | 'low' | 'info'; category: string; detail: string }[] = [];
            let score = 0;
            
            // 1. 熵值分析
            if (result.entropy) {
                if (result.entropy.file_entropy > 7.5) {
                    issues.push({ level: 'high', category: '熵值异常', detail: `文件熵值极高 (${result.entropy.file_entropy.toFixed(2)})，可能被加壳或加密` });
                    score += 30;
                } else if (result.entropy.file_entropy > 7.0) {
                    issues.push({ level: 'medium', category: '熵值偏高', detail: `文件熵值偏高 (${result.entropy.file_entropy.toFixed(2)})，可能存在压缩或混淆` });
                    score += 15;
                }
                
                const highEntropySections = result.entropy.section_entropy.filter(s => s.entropy > 7.0);
                if (highEntropySections.length > 0) {
                    issues.push({ level: 'medium', category: '节熵值异常', detail: `${highEntropySections.map(s => s.name).join(', ')} 节熵值过高` });
                    score += highEntropySections.length * 10;
                }
            }
            
            // 2. 安全特性分析
            if (result.security) {
                if (!result.security.aslr && !result.security.dep) {
                    issues.push({ level: 'high', category: '缺少安全保护', detail: '未启用ASLR和DEP，程序易受攻击' });
                    score += 25;
                } else if (!result.security.aslr) {
                    issues.push({ level: 'medium', category: '缺少ASLR', detail: '未启用地址空间随机化' });
                    score += 10;
                } else if (!result.security.dep) {
                    issues.push({ level: 'medium', category: '缺少DEP', detail: '未启用数据执行保护' });
                    score += 10;
                }
                
                if (!result.security.seh) {
                    issues.push({ level: 'low', category: 'SEH被禁用', detail: '禁用了结构化异常处理，某些壳会这样做' });
                    score += 5;
                }
            }
            
            // 3. 节名称分析
            const suspiciousSectionNames = ['.upx', '.aspack', '.adata', '.packed', '.themida', '.vmp', '.enigma', '.petite'];
            const foundSuspiciousSections = result.sections.filter(s => 
                suspiciousSectionNames.some(name => s.name.toLowerCase().includes(name.replace('.', '')))
            );
            if (foundSuspiciousSections.length > 0) {
                issues.push({ level: 'high', category: '可疑节名称', detail: `发现加壳特征节: ${foundSuspiciousSections.map(s => s.name).join(', ')}` });
                score += 30;
            }
            
            // 4. 节属性分析
            const execWriteSections = result.sections.filter(s => 
                s.characteristics_desc.includes('EXECUTE') && s.characteristics_desc.includes('WRITE')
            );
            if (execWriteSections.length > 0) {
                issues.push({ level: 'high', category: '危险节属性', detail: `${execWriteSections.map(s => s.name).join(', ')} 同时具有执行和写入权限` });
                score += 25;
            }
            
            // 5. 导入函数分析
            if (result.import_classification) {
                if (result.import_classification.injection.length >= 3) {
                    issues.push({ level: 'high', category: '代码注入API', detail: `检测到 ${result.import_classification.injection.length} 个注入相关API` });
                    score += 25;
                }
                if (result.import_classification.anti_debug.length >= 3) {
                    issues.push({ level: 'medium', category: '反调试API', detail: `检测到 ${result.import_classification.anti_debug.length} 个反调试API` });
                    score += 15;
                }
            }
            
            // 6. 导入表过小
            if (result.import_count < 10 && result.imports.length < 3) {
                issues.push({ level: 'medium', category: '导入表过小', detail: `仅导入${result.import_count}个函数，可能是加壳程序` });
                score += 15;
            }
            
            // 计算风险等级
            let riskLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
            let riskColor: string;
            let riskText: string;
            
            if (score === 0) {
                riskLevel = 'safe'; riskColor = '#10b981'; riskText = '安全';
            } else if (score < 20) {
                riskLevel = 'low'; riskColor = '#22c55e'; riskText = '低风险';
            } else if (score < 40) {
                riskLevel = 'medium'; riskColor = '#f59e0b'; riskText = '中等风险';
            } else if (score < 70) {
                riskLevel = 'high'; riskColor = '#ef4444'; riskText = '高风险';
            } else {
                riskLevel = 'critical'; riskColor = '#dc2626'; riskText = '极高风险';
            }
            
            return { issues, score, riskLevel, riskColor, riskText };
        };
        
        const suspiciousness = analyzeSuspiciousness();
        
        // 生成可疑度分析HTML
        const suspiciousnessHtml = `
            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <span style="font-weight: 600; color: var(--text-primary);">综合风险评估</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${suspiciousness.riskColor}; color: white; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 600;">${suspiciousness.riskText}</span>
                        <span style="color: var(--text-secondary); font-size: 11px;">评分: ${suspiciousness.score}</span>
                    </div>
                </div>
                <div style="background: var(--bg-primary); border-radius: 4px; height: 8px; overflow: hidden;">
                    <div style="background: ${suspiciousness.riskColor}; height: 100%; width: ${Math.min(suspiciousness.score, 100)}%; transition: width 0.3s;"></div>
                </div>
            </div>
            ${suspiciousness.issues.length > 0 ? `
                <div style="max-height: 150px; overflow-y: auto;">
                    ${suspiciousness.issues.map(issue => {
                        const levelColors = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6', info: '#6b7280' };
                        const levelTexts = { high: '高', medium: '中', low: '低', info: '信息' };
                        return `
                            <div style="display: flex; align-items: flex-start; gap: 8px; padding: 6px; background: var(--bg-secondary); border-radius: 6px; margin-bottom: 4px; font-size: 11px;">
                                <span style="background: ${levelColors[issue.level]}; color: white; padding: 1px 6px; border-radius: 3px; font-size: 10px; flex-shrink: 0;">${levelTexts[issue.level]}</span>
                                <div style="flex: 1; min-width: 0;">
                                    <div style="color: var(--text-primary); font-weight: 500;">${issue.category}</div>
                                    <div style="color: var(--text-secondary); font-size: 10px;">${issue.detail}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            ` : '<div style="color: #10b981; text-align: center; padding: 12px; font-size: 12px;">未发现明显可疑特征</div>'}`;

        // 生成熵值HTML
        const entropyHtml = result.entropy ? `
            <div style="background: var(--bg-secondary); padding: 10px; border-radius: 8px; margin-bottom: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="color: var(--text-secondary); font-size: 11px;">文件熵值</span>
                    <span style="color: ${getEntropyColor(result.entropy.file_entropy)}; font-weight: 600; font-size: 12px;">${result.entropy.file_entropy.toFixed(4)}</span>
                </div>
                <div style="background: var(--bg-primary); border-radius: 4px; height: 6px; overflow: hidden;">
                    <div style="background: ${getEntropyColor(result.entropy.file_entropy)}; height: 100%; width: ${(result.entropy.file_entropy / 8) * 100}%;"></div>
                </div>
            </div>
            <div style="max-height: 100px; overflow-y: auto;">
                ${result.entropy.section_entropy.map(s => `
                    <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 10px;">
                        <span style="width: 70px; color: var(--text-primary); font-family: monospace;">${s.name}</span>
                        <div style="flex: 1; background: var(--bg-secondary); border-radius: 3px; height: 5px; overflow: hidden;">
                            <div style="background: ${getEntropyColor(s.entropy)}; height: 100%; width: ${(s.entropy / 8) * 100}%;"></div>
                        </div>
                        <span style="width: 50px; text-align: right; color: ${getEntropyColor(s.entropy)};">${s.entropy.toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
        ` : '<div style="color: var(--text-secondary);">无熵值信息</div>';

        // 生成哈希HTML
        const hashesHtml = result.hashes ? `
            <div style="font-size: 10px;">
                <div style="display: flex; margin-bottom: 4px;">
                    <span style="width: 50px; color: var(--text-secondary);">MD5:</span>
                    <span style="font-family: monospace; color: var(--text-primary); word-break: break-all;">${result.hashes.md5}</span>
                </div>
                <div style="display: flex; margin-bottom: 4px;">
                    <span style="width: 50px; color: var(--text-secondary);">SHA1:</span>
                    <span style="font-family: monospace; color: var(--text-primary); word-break: break-all;">${result.hashes.sha1}</span>
                </div>
                <div style="display: flex;">
                    <span style="width: 50px; color: var(--text-secondary);">SHA256:</span>
                    <span style="font-family: monospace; color: var(--text-primary); word-break: break-all;">${result.hashes.sha256}</span>
                </div>
            </div>
        ` : '<div style="color: var(--text-secondary);">无哈希信息</div>';

        // 生成版本信息HTML
        const versionHtml = result.resources?.version_info ? `
            <div style="font-size: 11px;">
                ${result.resources.version_info.file_description ? `<div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">描述:</span> <span style="color: var(--text-primary);">${result.resources.version_info.file_description}</span></div>` : ''}
                ${result.resources.version_info.file_version ? `<div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">文件版本:</span> <span style="color: var(--text-primary);">${result.resources.version_info.file_version}</span></div>` : ''}
                ${result.resources.version_info.product_name ? `<div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">产品:</span> <span style="color: var(--text-primary);">${result.resources.version_info.product_name}</span></div>` : ''}
                ${result.resources.version_info.company_name ? `<div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">公司:</span> <span style="color: var(--text-primary);">${result.resources.version_info.company_name}</span></div>` : ''}
                ${result.resources.version_info.legal_copyright ? `<div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">版权:</span> <span style="color: var(--text-primary);">${result.resources.version_info.legal_copyright}</span></div>` : ''}
                ${result.resources.version_info.original_filename ? `<div><span style="color: var(--text-secondary);">原始名:</span> <span style="color: var(--text-primary);">${result.resources.version_info.original_filename}</span></div>` : ''}
            </div>
        ` : '<div style="color: var(--text-secondary); font-size: 11px;">无版本信息</div>';

        // 生成调试信息HTML
        const debugHtml = result.debug_info?.has_debug ? `
            <div style="font-size: 11px;">
                <div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">类型:</span> <span style="color: var(--text-primary);">${result.debug_info.debug_type}</span></div>
                ${result.debug_info.pdb_path ? `<div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">PDB:</span> <span style="color: var(--text-primary); word-break: break-all; font-family: monospace; font-size: 10px;">${result.debug_info.pdb_path}</span></div>` : ''}
                ${result.debug_info.pdb_guid ? `<div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">GUID:</span> <span style="color: var(--text-primary); font-family: monospace; font-size: 10px;">${result.debug_info.pdb_guid}</span></div>` : ''}
                ${result.debug_info.pdb_age ? `<div><span style="color: var(--text-secondary);">Age:</span> <span style="color: var(--text-primary);">${result.debug_info.pdb_age}</span></div>` : ''}
            </div>
        ` : '<div style="color: var(--text-secondary); font-size: 11px;">无调试信息</div>';

        // 生成Rich头HTML
        const richHtml = result.rich_header?.present ? `
            <div style="font-size: 11px;">
                <div style="margin-bottom: 6px;"><span style="color: var(--text-secondary);">校验和:</span> <span style="color: var(--text-primary); font-family: monospace;">${result.rich_header.checksum}</span></div>
                ${result.rich_header.compiler_info.length > 0 ? `
                    <div style="max-height: 80px; overflow-y: auto;">
                        ${result.rich_header.compiler_info.slice(0, 5).map(info => `
                            <div style="color: var(--text-secondary); font-size: 10px; margin-bottom: 2px;">${info}</div>
                        `).join('')}
                        ${result.rich_header.compiler_info.length > 5 ? `<div style="color: var(--text-secondary); font-size: 10px;">...还有 ${result.rich_header.compiler_info.length - 5} 条</div>` : ''}
                    </div>
                ` : ''}
            </div>
        ` : '<div style="color: var(--text-secondary); font-size: 11px;">无Rich头信息</div>';

        // 生成导入分类HTML
        const importClassHtml = result.import_classification ? `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; font-size: 10px;">
                <div style="background: var(--bg-secondary); padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: var(--text-primary); font-weight: 600;">${result.import_classification.file_operations.length}</div>
                    <div style="color: var(--text-secondary);">文件</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: var(--text-primary); font-weight: 600;">${result.import_classification.network_operations.length}</div>
                    <div style="color: var(--text-secondary);">网络</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: var(--text-primary); font-weight: 600;">${result.import_classification.registry_operations.length}</div>
                    <div style="color: var(--text-secondary);">注册表</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: var(--text-primary); font-weight: 600;">${result.import_classification.process_operations.length}</div>
                    <div style="color: var(--text-secondary);">进程</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: var(--text-primary); font-weight: 600;">${result.import_classification.memory_operations.length}</div>
                    <div style="color: var(--text-secondary);">内存</div>
                </div>
                <div style="background: var(--bg-secondary); padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: var(--text-primary); font-weight: 600;">${result.import_classification.crypto_operations.length}</div>
                    <div style="color: var(--text-secondary);">加密</div>
                </div>
                <div style="background: ${result.import_classification.anti_debug.length > 0 ? '#fef3c7' : 'var(--bg-secondary)'}; padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: ${result.import_classification.anti_debug.length > 0 ? '#f59e0b' : 'var(--text-primary)'}; font-weight: 600;">${result.import_classification.anti_debug.length}</div>
                    <div style="color: var(--text-secondary);">反调试</div>
                </div>
                <div style="background: ${result.import_classification.injection.length > 0 ? '#fee2e2' : 'var(--bg-secondary)'}; padding: 6px; border-radius: 4px; text-align: center;">
                    <div style="color: ${result.import_classification.injection.length > 0 ? '#ef4444' : 'var(--text-primary)'}; font-weight: 600;">${result.import_classification.injection.length}</div>
                    <div style="color: var(--text-secondary);">注入</div>
                </div>
            </div>
        ` : '<div style="color: var(--text-secondary);">无分类信息</div>';

        // 生成节表HTML
        const sectionsHtml = result.sections.map(section => `
            <div style="background: var(--bg-secondary); padding: 8px 10px; border-radius: 6px; margin-bottom: 4px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                    <span style="font-weight: 600; color: var(--text-primary);">${section.name}</span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="color: ${getEntropyColor(section.entropy || 0)}; font-size: 10px;">熵: ${(section.entropy || 0).toFixed(2)}</span>
                        <span style="color: var(--text-secondary); font-family: monospace; font-size: 10px;">${section.virtual_address}</span>
                    </div>
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 3px;">
                    ${section.characteristics_desc.map(desc => `<span style="background: var(--primary-color); color: white; padding: 1px 4px; border-radius: 2px; font-size: 9px;">${desc}</span>`).join('')}
                </div>
            </div>
        `).join('');

        // 生成导入表HTML
        const importsHtml = result.imports.length > 0 ? result.imports.slice(0, 10).map(imp => `
            <div style="background: var(--bg-secondary); padding: 6px 8px; border-radius: 4px; margin-bottom: 3px; font-size: 10px;">
                <div style="font-weight: 500; color: var(--text-primary);">
                    ${imp.dll_name} <span style="color: var(--text-secondary); font-weight: normal;">(${imp.functions.length})</span>
                </div>
            </div>
        `).join('') + (result.imports.length > 10 ? `<div style="text-align: center; color: var(--text-secondary); font-size: 10px;">...还有 ${result.imports.length - 10} 个DLL</div>` : '') : '<div style="color: var(--text-secondary); font-size: 11px; text-align: center; padding: 10px;">无导入函数</div>';

        dialog.innerHTML = `
            <!-- 标题栏 -->
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: var(--primary-color);">${iconAnalyze}</span>
                    <h3 style="margin: 0; font-size: 15px; color: var(--text-primary);">PE文件分析</h3>
                    <span style="background: ${result.is_64bit ? '#3b82f6' : '#10b981'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${result.is_64bit ? '64位' : '32位'}</span>
                    <span style="background: ${result.is_dll ? '#8b5cf6' : '#f59e0b'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${result.is_dll ? 'DLL' : 'EXE'}</span>
                    ${suspiciousness.score >= 40 ? `<span style="background: ${suspiciousness.riskColor}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px;">${suspiciousness.riskText}</span>` : ''}
                </div>
                <button class="pe-close-btn" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-secondary); padding: 2px 6px; border-radius: 4px;">×</button>
            </div>

            <!-- 内容区域 -->
            <div style="flex: 1; overflow-y: auto; padding: 12px 16px;">
                <!-- 第一行：基本信息 + 哈希 + 版本信息 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">基本信息</h4>
                        <div style="background: var(--bg-secondary); padding: 10px; border-radius: 6px; font-size: 11px;">
                            <div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">文件:</span> <span style="color: var(--text-primary); word-break: break-all;">${result.filename}</span></div>
                            <div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">大小:</span> <span style="color: var(--text-primary);">${formatSize(result.file_size)}</span></div>
                            <div style="margin-bottom: 4px;"><span style="color: var(--text-secondary);">入口:</span> <span style="color: var(--text-primary); font-family: monospace;">${result.entry_point}</span></div>
                            <div><span style="color: var(--text-secondary);">时间:</span> <span style="color: var(--text-primary);">${result.timestamp}</span></div>
                        </div>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">文件哈希</h4>
                        <div style="background: var(--bg-secondary); padding: 10px; border-radius: 6px;">
                            ${hashesHtml}
                        </div>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">版本信息</h4>
                        <div style="background: var(--bg-secondary); padding: 10px; border-radius: 6px; max-height: 120px; overflow-y: auto;">
                            ${versionHtml}
                        </div>
                    </div>
                </div>

                <!-- 第二行：可疑度分析 -->
                <div style="margin-bottom: 12px;">
                    <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">程序可疑度分析</h4>
                    ${suspiciousnessHtml}
                </div>

                <!-- 第三行：安全特性 + 熵值 + 导入分类 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">安全特性</h4>
                        ${securityHtml}
                    </div>
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">熵值分析</h4>
                        ${entropyHtml}
                    </div>
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">导入函数分类</h4>
                        ${importClassHtml}
                    </div>
                </div>

                <!-- 第四行：调试信息 + Rich头 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">调试信息</h4>
                        <div style="background: var(--bg-secondary); padding: 10px; border-radius: 6px;">
                            ${debugHtml}
                        </div>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">Rich头 (编译器信息)</h4>
                        <div style="background: var(--bg-secondary); padding: 10px; border-radius: 6px;">
                            ${richHtml}
                        </div>
                    </div>
                </div>

                <!-- 第五行：节表 + 导入表 -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">节表 (${result.sections.length} 个节)</h4>
                        <div style="max-height: 180px; overflow-y: auto;">
                            ${sectionsHtml}
                        </div>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 8px 0; font-size: 12px; color: var(--text-primary);">导入表 (${result.import_count} 函数, ${result.imports.length} DLL)</h4>
                        <div style="max-height: 180px; overflow-y: auto;">
                            ${importsHtml}
                        </div>
                    </div>
                </div>
            </div>

            <!-- 底部按钮 -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-top: 1px solid var(--border-color); background: var(--bg-secondary);">
                <div style="color: var(--text-secondary); font-size: 10px; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    输出: ${result.output_dir}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="pe-open-dir-btn" style="
                        padding: 5px 12px;
                        background: var(--bg-primary);
                        color: var(--text-primary);
                        border: 1px solid var(--border-color);
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 12px;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    ">${iconFolder} 打开目录</button>
                    <button class="pe-close-btn" style="
                        padding: 5px 14px;
                        background: var(--primary-color);
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 12px;
                    ">关闭</button>
                </div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // 绑定事件
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        dialog.querySelectorAll('.pe-close-btn').forEach(btn => {
            btn.addEventListener('click', () => overlay.remove());
        });

        dialog.querySelector('.pe-open-dir-btn')?.addEventListener('click', async () => {
            try {
                await invoke('open_path', { path: result.output_dir });
            } catch (error) {
                console.error('打开目录失败:', error);
            }
        });

        // ESC 关闭
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
    }
}

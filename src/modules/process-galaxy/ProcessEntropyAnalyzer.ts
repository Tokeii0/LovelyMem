/**
 * 进程熵值分析器 — Process Entropy Analyzer
 * 基于 Shannon Entropy 和多维度统计指标，对每个进程计算异常度评分 (0-100)
 */

import {
    SYSTEM_PROCESS_RULES,
    LOOKALIKE_NAMES,
    SUSPICIOUS_PATH_KEYWORDS,
    SUSPICIOUS_PORTS,
    type ProcessRule,
} from './processKnowledge';

/** 进程数据接口（与 ProcessGalaxyInterface 中一致） */
export interface ProcessDataForAnalysis {
    PID: string;
    PPID: string;
    State: string;
    ShortName: string;
    Name: string;
    IntegrityLevel: string;
    User: string;
    CreateTime: string;
    ExitTime: string;
    Wow64: string;
    UserPath: string;
    KernelPath: string;
    CommandLine: string;
}

/** 网络连接数据接口 */
export interface NetworkDataForAnalysis {
    Proto: string;
    State: string;
    SrcAddr: string;
    SrcPort: string;
    DstAddr: string;
    DstPort: string;
    PID: string;
    Process: string;
}

/** 单维度评分结果 */
export interface DimensionScore {
    /** 维度名称 */
    dimension: string;
    /** 原始熵值或度量值 */
    rawValue: number;
    /** 归一化后的评分 (0-100) */
    normalizedScore: number;
    /** 权重 */
    weight: number;
    /** 该维度的详细说明 */
    detail: string;
}

/** 异常告警 */
export interface AnomalyAlert {
    /** 严重级别 */
    severity: 'critical' | 'warning' | 'info';
    /** 告警标题 */
    title: string;
    /** 告警描述 */
    description: string;
    /** 关联维度 */
    dimension: string;
}

/** 进程分析结果 */
export interface ProcessAnalysisResult {
    /** 进程 PID */
    pid: string;
    /** 进程名 */
    processName: string;
    /** 综合异常度评分 (0-100) */
    anomalyScore: number;
    /** 异常等级 */
    level: 'normal' | 'low' | 'medium' | 'high' | 'critical';
    /** 各维度评分 */
    dimensions: DimensionScore[];
    /** 告警列表 */
    alerts: AnomalyAlert[];
}

/** 分析配置 */
export interface AnalyzerConfig {
    /** 进程名熵值权重 */
    nameEntropyWeight: number;
    /** 命令行熵值权重 */
    cmdlineEntropyWeight: number;
    /** 路径异常度权重 */
    pathAnomalyWeight: number;
    /** 父子关系偏离度权重 */
    parentDeviationWeight: number;
    /** 网络行为熵权重 */
    networkEntropyWeight: number;
    /** 时间异常度权重 */
    timeAnomalyWeight: number;
}

const DEFAULT_CONFIG: AnalyzerConfig = {
    nameEntropyWeight: 0.30,
    cmdlineEntropyWeight: 0.07,
    pathAnomalyWeight: 0.20,
    parentDeviationWeight: 0.18,
    networkEntropyWeight: 0.15,
    timeAnomalyWeight: 0.10,
};

export class ProcessEntropyAnalyzer {
    private config: AnalyzerConfig;
    private processMap: Map<string, ProcessDataForAnalysis> = new Map();
    private networkByPid: Map<string, NetworkDataForAnalysis[]> = new Map();
    private processNameCount: Map<string, number> = new Map();
    private medianCreateTime: number = 0;
    private createTimeStdDev: number = 0;

    constructor(config?: Partial<AnalyzerConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * 分析所有进程，返回每个进程的异常度评分
     */
    public analyze(
        processes: ProcessDataForAnalysis[],
        networkData: NetworkDataForAnalysis[] = []
    ): ProcessAnalysisResult[] {
        // 预处理：建立索引
        this.buildIndices(processes, networkData);

        // 计算时间基线
        this.computeTimeBaseline(processes);

        // 对每个进程计算评分
        const results: ProcessAnalysisResult[] = [];
        for (const proc of processes) {
            results.push(this.analyzeProcess(proc));
        }

        // 按异常度排序（高到低）
        results.sort((a, b) => b.anomalyScore - a.anomalyScore);
        return results;
    }

    // ==================== 索引构建 ====================

    private buildIndices(
        processes: ProcessDataForAnalysis[],
        networkData: NetworkDataForAnalysis[]
    ): void {
        this.processMap.clear();
        this.networkByPid.clear();
        this.processNameCount.clear();

        for (const proc of processes) {
            this.processMap.set(proc.PID, proc);
            const name = (proc.ShortName || proc.Name || '').toLowerCase();
            this.processNameCount.set(name, (this.processNameCount.get(name) || 0) + 1);
        }

        for (const net of networkData) {
            if (!this.networkByPid.has(net.PID)) {
                this.networkByPid.set(net.PID, []);
            }
            this.networkByPid.get(net.PID)!.push(net);
        }
    }

    private computeTimeBaseline(processes: ProcessDataForAnalysis[]): void {
        const timestamps: number[] = [];
        for (const proc of processes) {
            if (proc.CreateTime) {
                const ts = this.parseTime(proc.CreateTime);
                if (ts > 0) timestamps.push(ts);
            }
        }

        if (timestamps.length === 0) {
            this.medianCreateTime = 0;
            this.createTimeStdDev = 0;
            return;
        }

        timestamps.sort((a, b) => a - b);
        this.medianCreateTime = timestamps[Math.floor(timestamps.length / 2)];

        const mean = timestamps.reduce((s, t) => s + t, 0) / timestamps.length;
        const variance = timestamps.reduce((s, t) => s + Math.pow(t - mean, 2), 0) / timestamps.length;
        this.createTimeStdDev = Math.sqrt(variance);
    }

    // ==================== 单进程分析 ====================

    private analyzeProcess(proc: ProcessDataForAnalysis): ProcessAnalysisResult {
        const dimensions: DimensionScore[] = [];
        const alerts: AnomalyAlert[] = [];
        const procName = (proc.ShortName || proc.Name || '').toLowerCase();

        // 维度1: 进程名熵值
        dimensions.push(this.scoreNameEntropy(proc, procName, alerts));

        // 维度2: 命令行熵值
        dimensions.push(this.scoreCmdlineEntropy(proc, alerts));

        // 维度3: 路径异常度
        dimensions.push(this.scorePathAnomaly(proc, procName, alerts));

        // 维度4: 父子关系偏离度
        dimensions.push(this.scoreParentDeviation(proc, procName, alerts));

        // 维度5: 网络行为熵
        dimensions.push(this.scoreNetworkEntropy(proc, procName, alerts));

        // 维度6: 时间异常度
        dimensions.push(this.scoreTimeAnomaly(proc, alerts));

        // 加权汇总
        let totalScore = 0;
        for (const dim of dimensions) {
            totalScore += dim.normalizedScore * dim.weight;
        }

        // ---- 多维度关联加分 ----
        // 加权平均会被 0 分维度稀释，当多个维度同时异常时应额外加分
        const nameScore = dimensions[0]?.normalizedScore || 0;
        const cmdlineScore = dimensions[1]?.normalizedScore || 0;
        const pathScore = dimensions[2]?.normalizedScore || 0;
        const parentScore = dimensions[3]?.normalizedScore || 0;
        const networkScore = dimensions[4]?.normalizedScore || 0;

        // 进程名可疑 + 路径可疑 → 强关联，大幅加分
        if (nameScore >= 50 && pathScore >= 40) {
            totalScore += 25;
            alerts.push({
                severity: 'critical',
                title: '名称+路径双重异常',
                description: `随机进程名运行在可疑路径，高度可疑`,
                dimension: '关联分析',
            });
        } else if (nameScore >= 50 && pathScore >= 20) {
            totalScore += 15;
        }

        // 进程名可疑 + 有外联网络 → 加分
        if (nameScore >= 50 && networkScore >= 30) {
            totalScore += 15;
            alerts.push({
                severity: 'critical',
                title: '可疑进程有外联',
                description: `随机名称进程存在外部网络连接`,
                dimension: '关联分析',
            });
        }

        // 进程名可疑 + 父进程异常 → 加分
        if (nameScore >= 40 && parentScore >= 40) {
            totalScore += 10;
        }

        // 进程名可疑 + 命令行可疑 → 加分
        if (nameScore >= 40 && cmdlineScore >= 50) {
            totalScore += 10;
        }

        // 3个及以上维度同时 >= 30 → 额外加分
        const highDimCount = dimensions.filter(d => d.normalizedScore >= 30).length;
        if (highDimCount >= 3) {
            totalScore += 10 * (highDimCount - 2);
        }

        // ---- 单维度极高分保底 ----
        // 任何维度 >= 85 → 总分至少 50（不被其他 0 分维度拖低）
        const maxDimScore = Math.max(...dimensions.map(d => d.normalizedScore));
        if (maxDimScore >= 85) {
            totalScore = Math.max(totalScore, 55);
        } else if (maxDimScore >= 70) {
            totalScore = Math.max(totalScore, 35);
        }

        // Clamp to 0-100
        totalScore = Math.max(0, Math.min(100, totalScore));

        const level = this.getLevel(totalScore);

        return {
            pid: proc.PID,
            processName: proc.ShortName || proc.Name || 'Unknown',
            anomalyScore: Math.round(totalScore * 10) / 10,
            level,
            dimensions,
            alerts,
        };
    }

    // ==================== 维度1: 进程名熵值 ====================

    private scoreNameEntropy(
        _proc: ProcessDataForAnalysis,
        procName: string,
        alerts: AnomalyAlert[]
    ): DimensionScore {
        const baseName = procName.replace(/\.exe$/i, '');
        // 剥离分隔符(.、-、_)后计算熵值，避免复合名如 NVDisplay.Container 被分隔符抬高熵值
        const alphaName = baseName.replace(/[.\-_]/g, '');
        const entropy = this.shannonEntropy(alphaName);
        let score = 0;
        const details: string[] = [];

        // 基础熵值评分: 正常进程名 ~2.5-3.2, 随机字符 ~3.8+
        if (entropy > 4.0) {
            score = 90;
        } else if (entropy > 3.7) {
            score = 70;
        } else if (entropy > 3.5) {
            score = 45;
        } else if (entropy > 3.2) {
            score = 20;
        }

        // 熵值密度: 短字符串即使全唯一字符绝对熵也不高，但 entropy / log2(len) 趋近 1.0 说明接近完全随机
        // 例如 "NqZK2V6p"(8字符全唯一) → H=3.0, log2(8)=3.0, 密度=1.0 → 非常可疑
        // 注意：已知系统进程名跳过此检测（避免 conhost、svchost 等正常短词误报）
        const isKnownProcess = !!SYSTEM_PROCESS_RULES[procName];
        if (alphaName.length >= 5 && alphaName.length <= 20 && !isKnownProcess) {
            const maxEntropy = Math.log2(alphaName.length);
            const entropyDensity = maxEntropy > 0 ? entropy / maxEntropy : 0;
            if (entropyDensity > 0.95) {
                score = Math.max(score, 75);
                details.push(`熵密度=${entropyDensity.toFixed(2)}`);
            } else if (entropyDensity > 0.90) {
                score = Math.max(score, 50);
                details.push(`熵密度=${entropyDensity.toFixed(2)}`);
            }
        }

        // 以下检测仅对非已知系统进程执行（避免 svchost、conhost 等合法缩写词误报）
        if (!isKnownProcess) {
            // 字符类混合检测: 同时包含大写+小写+数字 → 随机生成特征
            // 正常进程名通常全小写 (svchost) 或首字母大写 (Explorer)，不会大小写+数字混杂
            const hasUpper = /[A-Z]/.test(alphaName);
            const hasLower = /[a-z]/.test(alphaName);
            const hasDigit = /\d/.test(alphaName);
            const charClassCount = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasDigit ? 1 : 0);

            if (charClassCount === 3 && alphaName.length >= 5) {
                // 排除常见合法模式如 "Win32", "x64", "v2" 等
                const isCommonPattern = /^(win|x86|x64|v\d|net|lib)/i.test(alphaName);
                if (!isCommonPattern) {
                    score = Math.max(score, 70);
                    details.push('大小写+数字混合');
                    alerts.push({
                        severity: 'warning',
                        title: '进程名字符类混合',
                        description: `"${procName}" 同时含大写、小写和数字，疑似随机生成`,
                        dimension: '进程名熵值',
                    });
                }
            }

            // 元音比例检测: 英文单词元音占比 ~35-45%, 随机字符串 ~19% (5/26)
            const vowels = alphaName.match(/[aeiouAEIOU]/g) || [];
            const letterCount = (alphaName.match(/[a-zA-Z]/g) || []).length;
            if (letterCount >= 5) {
                const vowelRatio = vowels.length / letterCount;
                if (vowelRatio < 0.15) {
                    score = Math.max(score, 60);
                    details.push(`元音极少(${(vowelRatio * 100).toFixed(0)}%)`);
                    alerts.push({
                        severity: 'warning',
                        title: '进程名元音缺失',
                        description: `"${procName}" 元音占比仅 ${(vowelRatio * 100).toFixed(0)}%，不像正常英文名`,
                        dimension: '进程名熵值',
                    });
                } else if (vowelRatio < 0.2) {
                    score = Math.max(score, 40);
                    details.push(`元音偏少(${(vowelRatio * 100).toFixed(0)}%)`);
                }
            }
        }

        // 检查伪装名
        if (LOOKALIKE_NAMES[procName]) {
            score = Math.max(score, 95);
            alerts.push({
                severity: 'critical',
                title: '进程名伪装',
                description: `"${procName}" 疑似伪装 "${LOOKALIKE_NAMES[procName]}"`,
                dimension: '进程名熵值',
            });
        }

        // 检查名称长度异常（很短或很长）
        if (alphaName.length <= 2 && alphaName !== 'dw') {
            score = Math.max(score, 40);
        } else if (alphaName.length > 30) {
            score = Math.max(score, 50);
        }

        // 检查名称中是否包含数字（降低阈值 0.5→0.25）
        const digitRatio = (alphaName.match(/\d/g) || []).length / Math.max(alphaName.length, 1);
        if (digitRatio > 0.25 && alphaName.length > 4) {
            // 排除常见合法带数字的进程名模式
            const isLegitNumbered = /^(win|svc|rundll|regsvr)\d{2}$/i.test(alphaName) ||
                                     /^(python|node|java)\d/i.test(alphaName);
            if (!isLegitNumbered) {
                const severity = digitRatio > 0.4 ? 65 : 45;
                score = Math.max(score, severity);
                details.push(`数字占比${(digitRatio * 100).toFixed(0)}%`);
                alerts.push({
                    severity: 'warning',
                    title: '进程名高数字比例',
                    description: `"${procName}" 数字占比 ${(digitRatio * 100).toFixed(0)}%，可能为随机生成`,
                    dimension: '进程名熵值',
                });
            }
        }

        return {
            dimension: '进程名熵值',
            rawValue: Math.round(entropy * 1000) / 1000,
            normalizedScore: score,
            weight: this.config.nameEntropyWeight,
            detail: `H=${entropy.toFixed(3)}, len=${alphaName.length}${details.length > 0 ? ', ' + details.join(', ') : ''}`,
        };
    }

    // ==================== 维度2: 命令行熵值 ====================

    private scoreCmdlineEntropy(
        proc: ProcessDataForAnalysis,
        alerts: AnomalyAlert[]
    ): DimensionScore {
        const cmdline = proc.CommandLine || '';
        if (!cmdline || cmdline === '-') {
            return {
                dimension: '命令行熵值',
                rawValue: 0,
                normalizedScore: 0,
                weight: this.config.cmdlineEntropyWeight,
                detail: '无命令行信息',
            };
        }

        const entropy = this.shannonEntropy(cmdline);
        let score = 0;
        const details: string[] = [];

        // ---- 路径占比分析 ----
        // 含大量 Windows 路径的命令行天然熵值高（路径字符多样），需排除
        const pathSegments = cmdline.match(/[A-Za-z]:\\[^\s"]+/g) || [];
        const pathChars = pathSegments.reduce((sum, seg) => sum + seg.length, 0);
        const pathRatio = pathChars / Math.max(cmdline.length, 1);

        // 已知合法厂商关键词（出现在命令行中 → 降低可疑度）
        const knownVendors = [
            'nvidia', 'microsoft', 'windows', 'intel', 'amd', 'realtek',
            'logitech', 'corsair', 'razer', 'steam', 'epic', 'adobe',
            'google', 'chrome', 'firefox', 'mozilla', 'java', 'oracle',
            'vmware', 'virtualbox', 'docker', 'wsl', 'defender',
            'onedrive', 'dropbox', 'slack', 'teams', 'zoom', 'discord',
            'visual studio', 'vscode', 'jetbrains', 'python', 'node',
            'driverstore', 'filerepository', 'winsxs', 'assembly',
            'program files', 'programdata', 'commonfiles',
        ];
        const cmdLower = cmdline.toLowerCase();
        const hasKnownVendor = knownVendors.some(v => cmdLower.includes(v));

        // 路径占比 > 60% 且含已知厂商 → 高熵是路径导致的，不可疑
        const isPathHeavy = pathRatio > 0.5;

        if (isPathHeavy && hasKnownVendor) {
            // 路径密集 + 已知厂商 → 基本不可疑，只保留微弱评分
            score = 0;
            details.push(`路径占比${(pathRatio * 100).toFixed(0)}%, 已知厂商`);
        } else if (isPathHeavy) {
            // 路径密集但不认识的厂商 → 轻微可疑
            if (entropy > 5.0) score = 25;
            else score = 10;
            details.push(`路径占比${(pathRatio * 100).toFixed(0)}%`);
        } else {
            // 非路径密集的命令行 → 按原始熵值评分
            if (entropy > 5.5) {
                score = 90;
                alerts.push({
                    severity: 'critical',
                    title: '命令行极高熵值',
                    description: `命令行熵值 ${entropy.toFixed(3)}（非路径内容），可能包含加密/混淆`,
                    dimension: '命令行熵值',
                });
            } else if (entropy > 5.0) {
                score = 75;
                alerts.push({
                    severity: 'warning',
                    title: '命令行高熵值',
                    description: `命令行熵值 ${entropy.toFixed(3)}，可能为编码数据`,
                    dimension: '命令行熵值',
                });
            } else if (entropy > 4.5) {
                score = 50;
            } else if (entropy > 4.0) {
                score = 20;
            }
        }

        // ---- 非路径部分的熵值 ----
        // 去掉路径和常见参数，只看"可疑载荷"部分
        if (!isPathHeavy && cmdline.length > 80) {
            let nonPathContent = cmdline;
            for (const seg of pathSegments) {
                nonPathContent = nonPathContent.replace(seg, '');
            }
            // 也去掉常见参数标志
            nonPathContent = nonPathContent.replace(/[-\/][a-zA-Z]{1,3}\s/g, '');
            nonPathContent = nonPathContent.trim();

            if (nonPathContent.length > 40) {
                const nonPathEntropy = this.shannonEntropy(nonPathContent);
                if (nonPathEntropy > 5.0) {
                    score = Math.max(score, 85);
                    details.push(`非路径部分H=${nonPathEntropy.toFixed(2)}`);
                }
            }
        }

        // ---- 检查 Base64 特征 ----
        // 只在非路径密集命令行中检测 Base64
        if (!isPathHeavy) {
            const b64Ratio = this.base64Ratio(cmdline);
            if (b64Ratio > 0.6 && cmdline.length > 80) {
                score = Math.max(score, 75);
                alerts.push({
                    severity: 'warning',
                    title: '命令行含 Base64 特征',
                    description: `Base64 字符占比 ${(b64Ratio * 100).toFixed(0)}%`,
                    dimension: '命令行熵值',
                });
            }
        }

        // ---- 检查连续无空格长字符串 ----
        // Base64/混淆通常是一个超长无空格字符串
        const longTokens = cmdline.split(/\s+/).filter(t => t.length > 60 && !t.match(/^[A-Za-z]:\\/));
        if (longTokens.length > 0) {
            const longestToken = longTokens.reduce((a, b) => a.length > b.length ? a : b);
            const tokenEntropy = this.shannonEntropy(longestToken);
            if (tokenEntropy > 4.5 && longestToken.length > 80) {
                score = Math.max(score, 80);
                details.push(`超长token(${longestToken.length}字符, H=${tokenEntropy.toFixed(2)})`);
                alerts.push({
                    severity: 'critical',
                    title: '命令行含超长编码块',
                    description: `发现 ${longestToken.length} 字符连续块，熵值 ${tokenEntropy.toFixed(3)}`,
                    dimension: '命令行熵值',
                });
            }
        }

        // ---- 检查 PowerShell 混淆关键词 ----
        const psObfuscation = this.checkPowerShellObfuscation(cmdline);
        if (psObfuscation > 0) {
            score = Math.max(score, 60 + psObfuscation * 10);
            alerts.push({
                severity: psObfuscation >= 2 ? 'critical' : 'warning',
                title: 'PowerShell 混淆特征',
                description: `检测到 ${psObfuscation} 个混淆指标`,
                dimension: '命令行熵值',
            });
        }

        // ---- 命令行超长（非路径密集时才算可疑） ----
        if (cmdline.length > 2000 && !isPathHeavy) {
            score = Math.max(score, 50);
        }

        return {
            dimension: '命令行熵值',
            rawValue: Math.round(entropy * 1000) / 1000,
            normalizedScore: score,
            weight: this.config.cmdlineEntropyWeight,
            detail: `H=${entropy.toFixed(3)}, len=${cmdline.length}${details.length > 0 ? ', ' + details.join(', ') : ''}`,
        };
    }

    // ==================== 维度3: 路径异常度 ====================

    private scorePathAnomaly(
        proc: ProcessDataForAnalysis,
        procName: string,
        alerts: AnomalyAlert[]
    ): DimensionScore {
        let path = (proc.UserPath || proc.KernelPath || '').toLowerCase();
        // 规范化路径：双反斜杠→单反斜杠，去掉 \Device\HarddiskVolumeX\ 前缀
        path = path.replace(/\\\\/g, '\\');
        path = path.replace(/^\\device\\harddiskvolume\d+/i, '');
        let score = 0;
        const details: string[] = [];

        if (!path || path === '-') {
            // 无路径信息，轻微可疑
            return {
                dimension: '路径异常度',
                rawValue: 0,
                normalizedScore: 10,
                weight: this.config.pathAnomalyWeight,
                detail: '无路径信息',
            };
        }

        // 1. 路径字符串本身的熵
        const pathEntropy = this.shannonEntropy(path);
        if (pathEntropy > 4.5) {
            score = Math.max(score, 60);
            details.push(`路径熵值高: ${pathEntropy.toFixed(3)}`);
        }

        // 2. 系统进程路径验证
        const rule = SYSTEM_PROCESS_RULES[procName];
        if (rule && rule.expectedPaths.length > 0) {
            const pathMatch = rule.expectedPaths.some(ep => path.includes(ep.toLowerCase()));
            if (!pathMatch) {
                score = Math.max(score, 85);
                alerts.push({
                    severity: 'critical',
                    title: '系统进程路径异常',
                    description: `"${procName}" 不在预期路径: ${rule.expectedPaths.join(', ')}，实际: ${path}`,
                    dimension: '路径异常度',
                });
                details.push('系统进程路径不匹配');
            }
        }

        // 3. 可疑路径关键词
        for (const keyword of SUSPICIOUS_PATH_KEYWORDS) {
            if (path.includes(keyword.toLowerCase())) {
                score = Math.max(score, 55);
                details.push(`可疑路径: ${keyword}`);
                alerts.push({
                    severity: 'warning',
                    title: '进程运行在可疑路径',
                    description: `路径包含 "${keyword}"`,
                    dimension: '路径异常度',
                });
                break;
            }
        }

        // 4. 随机目录名检测
        // C:\ProgramData\pOPoh1Lm\g8QEGaf7.exe → 目录名 "pOPoh1Lm" 是随机的
        const pathSegments = path.split(/[\\\/]/).filter(s => s && s.length > 2);
        for (const seg of pathSegments) {
            // 跳过盘符、已知系统目录、文件名
            if (seg.match(/^[a-z]:$/i) || seg === 'windows' || seg === 'system32' ||
                seg === 'programdata' || seg === 'program files' || seg === 'program files (x86)' ||
                seg === 'users' || seg === 'appdata' || seg === 'local' || seg === 'roaming' ||
                seg === 'documents' || seg === 'desktop' || seg === 'downloads' ||
                seg === 'temp' || seg === 'administrator' || seg === 'public' ||
                seg.includes('.exe') || seg.includes('.dll') || seg.includes('.sys') ||
                seg.includes('.inf') || seg.includes('.') || seg === 'device' ||
                seg.startsWith('harddiskvolume')) {
                continue;
            }
            // 检测该目录段是否像随机字符串
            if (seg.length >= 5 && seg.length <= 20) {
                const segEntropy = this.shannonEntropy(seg);
                const segMaxEntropy = Math.log2(seg.length);
                const segDensity = segMaxEntropy > 0 ? segEntropy / segMaxEntropy : 0;
                const segHasUpper = /[A-Z]/.test(seg);
                const segHasLower = /[a-z]/.test(seg);
                const segHasDigit = /\d/.test(seg);
                const segClassCount = (segHasUpper ? 1 : 0) + (segHasLower ? 1 : 0) + (segHasDigit ? 1 : 0);

                if (segDensity > 0.9 && segClassCount >= 2) {
                    score = Math.max(score, 70);
                    details.push(`随机目录名: ${seg}`);
                    alerts.push({
                        severity: 'critical',
                        title: '路径含随机目录名',
                        description: `目录 "${seg}" 疑似随机生成（熵密度=${segDensity.toFixed(2)}）`,
                        dimension: '路径异常度',
                    });
                    break;
                }
            }
        }

        // 5. 路径深度 (正常系统进程路径深度 ≤ 4)
        const depth = path.split('\\').filter(s => s).length;
        if (depth > 7) {
            score = Math.max(score, 35);
            details.push(`路径深度: ${depth}`);
        }

        return {
            dimension: '路径异常度',
            rawValue: Math.round(pathEntropy * 1000) / 1000,
            normalizedScore: score,
            weight: this.config.pathAnomalyWeight,
            detail: details.length > 0 ? details.join('; ') : `路径正常, 熵=${pathEntropy.toFixed(3)}`,
        };
    }

    // ==================== 维度4: 父子关系偏离度 ====================

    private scoreParentDeviation(
        proc: ProcessDataForAnalysis,
        procName: string,
        alerts: AnomalyAlert[]
    ): DimensionScore {
        let score = 0;
        const details: string[] = [];

        const rule = SYSTEM_PROCESS_RULES[procName];
        if (!rule) {
            // 非系统进程，不做父子关系判断
            return {
                dimension: '父子关系偏离度',
                rawValue: 0,
                normalizedScore: 0,
                weight: this.config.parentDeviationWeight,
                detail: '非系统关键进程，跳过',
            };
        }

        // 检查父进程
        const parentProc = this.processMap.get(proc.PPID);
        if (parentProc && rule.expectedParents.length > 0) {
            const parentName = (parentProc.ShortName || parentProc.Name || '').toLowerCase();
            const parentMatch = rule.expectedParents.some(ep => parentName === ep.toLowerCase());
            if (!parentMatch) {
                score = Math.max(score, 80);
                alerts.push({
                    severity: 'critical',
                    title: '父进程异常',
                    description: `"${procName}" 的父进程应为 [${rule.expectedParents.join(', ')}]，实际为 "${parentName}" (PID: ${proc.PPID})`,
                    dimension: '父子关系偏离度',
                });
                details.push(`父进程不匹配: ${parentName}`);
            }
        } else if (!parentProc && proc.PPID && proc.PPID !== '0' && proc.PPID !== '4') {
            // 父进程不在进程列表中（可能已退出 = 注入后的进程）
            score = Math.max(score, 30);
            details.push(`父进程 PID=${proc.PPID} 不在列表中`);
        }

        // 检查 PID
        if (rule.expectedPID > 0 && parseInt(proc.PID) !== rule.expectedPID) {
            score = Math.max(score, 70);
            alerts.push({
                severity: 'warning',
                title: 'PID 异常',
                description: `"${procName}" 预期 PID=${rule.expectedPID}，实际 PID=${proc.PID}`,
                dimension: '父子关系偏离度',
            });
            details.push(`PID 不匹配: 预期 ${rule.expectedPID}`);
        }

        // 检查实例数
        if (rule.maxInstances > 0) {
            const count = this.processNameCount.get(procName) || 0;
            if (count > rule.maxInstances) {
                score = Math.max(score, 75);
                alerts.push({
                    severity: 'critical',
                    title: '实例数异常',
                    description: `"${procName}" 最多应有 ${rule.maxInstances} 个实例，实际有 ${count} 个`,
                    dimension: '父子关系偏离度',
                });
                details.push(`实例数: ${count} > ${rule.maxInstances}`);
            }
        }

        return {
            dimension: '父子关系偏离度',
            rawValue: score,
            normalizedScore: score,
            weight: this.config.parentDeviationWeight,
            detail: details.length > 0 ? details.join('; ') : '父子关系正常',
        };
    }

    // ==================== 维度5: 网络行为熵 ====================

    private scoreNetworkEntropy(
        proc: ProcessDataForAnalysis,
        procName: string,
        alerts: AnomalyAlert[]
    ): DimensionScore {
        const connections = this.networkByPid.get(proc.PID) || [];
        if (connections.length === 0) {
            return {
                dimension: '网络行为熵',
                rawValue: 0,
                normalizedScore: 0,
                weight: this.config.networkEntropyWeight,
                detail: '无网络连接',
            };
        }

        let score = 0;
        const details: string[] = [];

        // 1. 外联 IP 的 Shannon 熵
        const externalIPs = connections
            .filter(c => this.isExternalAddress(c.DstAddr))
            .map(c => c.DstAddr);

        if (externalIPs.length > 0) {
            const ipEntropy = this.shannonEntropyOfItems(externalIPs);
            details.push(`外联IP数: ${externalIPs.length}, 多样性H=${ipEntropy.toFixed(3)}`);

            // 多个不同的外联 IP = 更可疑
            if (externalIPs.length >= 5) {
                score = Math.max(score, 60);
            } else if (externalIPs.length >= 2) {
                score = Math.max(score, 35);
            } else {
                score = Math.max(score, 15);
            }

            // 系统进程不应有外联
            const systemProcesses = ['lsass.exe', 'csrss.exe', 'smss.exe', 'wininit.exe', 'winlogon.exe'];
            if (systemProcesses.includes(procName)) {
                score = Math.max(score, 90);
                alerts.push({
                    severity: 'critical',
                    title: '系统进程外联',
                    description: `"${procName}" 发起了 ${externalIPs.length} 个外部连接`,
                    dimension: '网络行为熵',
                });
            }
        }

        // 2. 目标端口的 Shannon 熵
        const dstPorts = connections
            .filter(c => c.DstPort && c.DstPort !== '0' && c.DstPort !== '*')
            .map(c => c.DstPort);

        if (dstPorts.length > 0) {
            const portEntropy = this.shannonEntropyOfItems(dstPorts);
            details.push(`端口多样性H=${portEntropy.toFixed(3)}`);

            // 端口扫描特征: 大量不同端口
            if (new Set(dstPorts).size > 20) {
                score = Math.max(score, 80);
                alerts.push({
                    severity: 'critical',
                    title: '疑似端口扫描',
                    description: `连接了 ${new Set(dstPorts).size} 个不同端口`,
                    dimension: '网络行为熵',
                });
            }
        }

        // 3. 可疑端口检测
        for (const conn of connections) {
            const port = parseInt(conn.DstPort);
            if (SUSPICIOUS_PORTS.includes(port)) {
                score = Math.max(score, 65);
                alerts.push({
                    severity: 'warning',
                    title: '连接可疑端口',
                    description: `连接到 ${conn.DstAddr}:${conn.DstPort}`,
                    dimension: '网络行为熵',
                });
                break;
            }
        }

        return {
            dimension: '网络行为熵',
            rawValue: externalIPs.length,
            normalizedScore: score,
            weight: this.config.networkEntropyWeight,
            detail: details.join('; ') || '仅本地连接',
        };
    }

    // ==================== 维度6: 时间异常度 ====================

    private scoreTimeAnomaly(
        proc: ProcessDataForAnalysis,
        alerts: AnomalyAlert[]
    ): DimensionScore {
        if (!proc.CreateTime || this.createTimeStdDev === 0) {
            return {
                dimension: '时间异常度',
                rawValue: 0,
                normalizedScore: 0,
                weight: this.config.timeAnomalyWeight,
                detail: '无时间信息或无法计算基线',
            };
        }

        const ts = this.parseTime(proc.CreateTime);
        if (ts <= 0) {
            return {
                dimension: '时间异常度',
                rawValue: 0,
                normalizedScore: 0,
                weight: this.config.timeAnomalyWeight,
                detail: '时间解析失败',
            };
        }

        // 计算与中位数的 Z-score
        const zScore = Math.abs(ts - this.medianCreateTime) / Math.max(this.createTimeStdDev, 1);
        let score = 0;

        if (zScore > 3) {
            score = 70;
        } else if (zScore > 2) {
            score = 45;
        } else if (zScore > 1.5) {
            score = 25;
        } else {
            score = 0;
        }

        // 系统进程应在启动初期创建，如果 Z-score 很高则更可疑
        const procName = (proc.ShortName || proc.Name || '').toLowerCase();
        if (SYSTEM_PROCESS_RULES[procName] && zScore > 2) {
            score = Math.max(score, 80);
            alerts.push({
                severity: 'warning',
                title: '系统进程创建时间异常',
                description: `"${procName}" 的创建时间偏离中位数 ${zScore.toFixed(1)} 个标准差`,
                dimension: '时间异常度',
            });
        }

        // 已退出进程
        if (proc.ExitTime && proc.ExitTime !== '-' && proc.ExitTime.trim() !== '') {
            score = Math.max(score, 15);
        }

        return {
            dimension: '时间异常度',
            rawValue: Math.round(zScore * 100) / 100,
            normalizedScore: score,
            weight: this.config.timeAnomalyWeight,
            detail: `Z-score = ${zScore.toFixed(2)}`,
        };
    }

    // ==================== 工具方法 ====================

    /**
     * 计算字符串的 Shannon Entropy
     * H(X) = -Σ p(x) × log₂(p(x))
     */
    public shannonEntropy(str: string): number {
        if (!str || str.length === 0) return 0;

        const freq: Map<string, number> = new Map();
        for (const ch of str) {
            freq.set(ch, (freq.get(ch) || 0) + 1);
        }

        let entropy = 0;
        const len = str.length;
        for (const count of freq.values()) {
            const p = count / len;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }

        return entropy;
    }

    /**
     * 计算元素集合的 Shannon 熵（按元素出现频率）
     */
    private shannonEntropyOfItems(items: string[]): number {
        if (items.length === 0) return 0;

        const freq: Map<string, number> = new Map();
        for (const item of items) {
            freq.set(item, (freq.get(item) || 0) + 1);
        }

        let entropy = 0;
        const total = items.length;
        for (const count of freq.values()) {
            const p = count / total;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }

        return entropy;
    }

    /** Base64 字符比例 */
    private base64Ratio(str: string): number {
        if (!str) return 0;
        const b64Chars = str.match(/[A-Za-z0-9+/=]/g) || [];
        return b64Chars.length / str.length;
    }

    /** 检测 PowerShell 混淆指标，返回命中数 */
    private checkPowerShellObfuscation(cmdline: string): number {
        const lower = cmdline.toLowerCase();
        let hits = 0;

        const indicators = [
            /\-e(nc|ncodedcommand)/i,
            /\-w\s*(hidden|1)/i,
            /\-nop(rofile)?/i,
            /\-exec(utionpolicy)?\s*bypass/i,
            /invoke-expression/i,
            /iex\s*\(/i,
            /\[convert\]::frombase64/i,
            /downloadstring/i,
            /downloadfile/i,
            /new-object\s+.*net\.webclient/i,
            /\$env:.*\+.*\$env:/i,
            /\-join\s*\[char\[\]\]/i,
            /\[char\]\s*\d+/i,
        ];

        for (const pattern of indicators) {
            if (pattern.test(lower)) hits++;
        }

        return hits;
    }

    /** 判断是否为外部地址 */
    private isExternalAddress(addr: string): boolean {
        if (!addr) return false;
        return !addr.startsWith('127.') &&
               !addr.startsWith('0.0.0.0') &&
               !addr.startsWith('10.') &&
               !addr.startsWith('192.168.') &&
               !addr.startsWith('172.16.') &&
               !addr.startsWith('172.17.') &&
               !addr.startsWith('172.18.') &&
               !addr.startsWith('172.19.') &&
               !addr.startsWith('172.2') &&
               !addr.startsWith('172.30.') &&
               !addr.startsWith('172.31.') &&
               !addr.startsWith('::') &&
               !addr.startsWith('*') &&
               addr !== '0';
    }

    /** 解析时间字符串为时间戳 */
    private parseTime(timeStr: string): number {
        if (!timeStr || timeStr === '-') return 0;
        try {
            const ts = new Date(timeStr).getTime();
            return isNaN(ts) ? 0 : ts;
        } catch {
            return 0;
        }
    }

    /** 根据评分返回等级 */
    private getLevel(score: number): ProcessAnalysisResult['level'] {
        if (score >= 80) return 'critical';
        if (score >= 60) return 'high';
        if (score >= 40) return 'medium';
        if (score >= 20) return 'low';
        return 'normal';
    }
}

/**
 * 系统进程基线知识库
 * 用于异常偏离度计算 — 定义 Windows 系统进程的正常特征
 */

/** 系统进程规则定义 */
export interface ProcessRule {
    /** 预期的父进程名（可多个） */
    expectedParents: string[];
    /** 预期路径片段（进程路径应包含这些字符串之一） */
    expectedPaths: string[];
    /** 最大实例数（0 = 不限） */
    maxInstances: number;
    /** 预期 PID（0 = 不限） */
    expectedPID: number;
    /** 正常进程名的 Shannon 熵基线（用于名称相似度对比） */
    nameEntropy: number;
    /** 该进程的描述 */
    description: string;
}

/**
 * Windows 系统关键进程知识库
 * 来源: SANS Windows Process Genealogy Poster, Microsoft Docs
 */
export const SYSTEM_PROCESS_RULES: Record<string, ProcessRule> = {
    'system': {
        expectedParents: ['idle', ''],
        expectedPaths: [],
        maxInstances: 1,
        expectedPID: 4,
        nameEntropy: 2.58,
        description: 'Windows 内核进程',
    },
    'smss.exe': {
        expectedParents: ['system'],
        expectedPaths: ['\\systemroot\\system32\\', '\\windows\\system32\\'],
        maxInstances: 1,
        expectedPID: 0,
        nameEntropy: 2.25,
        description: 'Session Manager Subsystem',
    },
    'csrss.exe': {
        expectedParents: ['smss.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0, // 每个 session 一个
        expectedPID: 0,
        nameEntropy: 2.52,
        description: 'Client Server Runtime Subsystem',
    },
    'wininit.exe': {
        expectedParents: ['smss.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 1,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'Windows Initialization Process',
    },
    'winlogon.exe': {
        expectedParents: ['smss.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.85,
        description: 'Windows Logon Process',
    },
    'services.exe': {
        expectedParents: ['wininit.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 1,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'Service Control Manager',
    },
    'lsass.exe': {
        expectedParents: ['wininit.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 1,
        expectedPID: 0,
        nameEntropy: 2.32,
        description: 'Local Security Authority Subsystem',
    },
    'lsaiso.exe': {
        expectedParents: ['wininit.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 1,
        expectedPID: 0,
        nameEntropy: 2.58,
        description: 'LSA Isolated (Credential Guard)',
    },
    'svchost.exe': {
        expectedParents: ['services.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'Service Host Process',
    },
    'taskhost.exe': {
        expectedParents: ['services.exe', 'svchost.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'Task Host Process',
    },
    'taskhostw.exe': {
        expectedParents: ['services.exe', 'svchost.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.95,
        description: 'Task Host Window',
    },
    'explorer.exe': {
        expectedParents: ['userinit.exe', 'winlogon.exe', 'explorer.exe'],
        expectedPaths: ['\\windows\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.95,
        description: 'Windows Explorer',
    },
    'userinit.exe': {
        expectedParents: ['winlogon.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'User Initialization',
    },
    'runtimebroker.exe': {
        expectedParents: ['svchost.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 3.25,
        description: 'Runtime Broker',
    },
    'spoolsv.exe': {
        expectedParents: ['services.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 1,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'Print Spooler Service',
    },
    'dwm.exe': {
        expectedParents: ['winlogon.exe', 'svchost.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 1.58,
        description: 'Desktop Window Manager',
    },
    'conhost.exe': {
        expectedParents: ['csrss.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'Console Window Host',
    },
    'dllhost.exe': {
        expectedParents: ['services.exe', 'svchost.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'COM Surrogate',
    },
    'searchindexer.exe': {
        expectedParents: ['services.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 1,
        expectedPID: 0,
        nameEntropy: 3.18,
        description: 'Windows Search Indexer',
    },
    'wudfhost.exe': {
        expectedParents: ['svchost.exe'],
        expectedPaths: ['\\windows\\system32\\'],
        maxInstances: 0,
        expectedPID: 0,
        nameEntropy: 2.75,
        description: 'Windows User-Mode Driver Host',
    },
};

/**
 * 常见恶意软件伪装的系统进程名变体
 * key: 变体名(小写), value: 它试图伪装的真实进程名
 */
export const LOOKALIKE_NAMES: Record<string, string> = {
    'svch0st.exe': 'svchost.exe',
    'scvhost.exe': 'svchost.exe',
    'svchosts.exe': 'svchost.exe',
    'svchost .exe': 'svchost.exe',
    'svchosl.exe': 'svchost.exe',
    'svchostt.exe': 'svchost.exe',
    'csrs.exe': 'csrss.exe',
    'cssrs.exe': 'csrss.exe',
    'csrss .exe': 'csrss.exe',
    'lsas.exe': 'lsass.exe',
    'lssas.exe': 'lsass.exe',
    'lsass .exe': 'lsass.exe',
    'lsasss.exe': 'lsass.exe',
    'explore.exe': 'explorer.exe',
    'expl0rer.exe': 'explorer.exe',
    'iexplore.exe': 'explorer.exe',
    'service.exe': 'services.exe',
    'servics.exe': 'services.exe',
    'rundl132.exe': 'rundll32.exe',
    'rundll.exe': 'rundll32.exe',
    'taskhost .exe': 'taskhost.exe',
    'wmiprvs.exe': 'wmiprvse.exe',
};

/**
 * 可疑路径关键词（出现在进程路径中视为异常）
 */
export const SUSPICIOUS_PATH_KEYWORDS: string[] = [
    '\\temp\\',
    '\\tmp\\',
    '\\appdata\\local\\temp\\',
    '\\appdata\\roaming\\',
    '\\appdata\\local\\',
    '\\downloads\\',
    '\\desktop\\',
    '\\documents\\',
    '\\public\\',
    '\\recycle',
    '\\$recycle',
    '\\programdata\\',
    '\\users\\public\\',
    '\\users\\default\\',
    '\\perflogs\\',
    '\\intel\\',
    '\\music\\',
    '\\contacts\\',
    '\\videos\\',
    '\\pictures\\',
    '\\favorites\\',
    '\\searches\\',
    '\\saved games\\',
];

/**
 * 已知可疑端口
 */
export const SUSPICIOUS_PORTS: number[] = [
    4444,   // Metasploit default
    5555,   // Common RAT
    1234,   // Common backdoor
    31337,  // Back Orifice
    12345,  // NetBus
    27374,  // SubSeven
    6666, 6667, 6668, 6669, // IRC (常被 C2 使用)
    8080,   // 常见代理/后门
    9999,   // Common RAT
    1337,   // Leet port
    7777,   // Common backdoor
    3389,   // RDP（非系统进程使用时可疑）
    445,    // SMB（非系统进程使用时可疑）
    135,    // RPC（非系统进程使用时可疑）
];

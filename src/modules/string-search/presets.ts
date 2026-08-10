/**
 * 字符串搜索 - 正则表达式预设
 */

export interface RegexPreset {
    label: string;
    pattern: string;
    keywords: string;
    group: string;
}

export const REGEX_PRESETS: RegexPreset[] = [
    // 基础信息
    {
        group: '基础信息',
        label: '网站URL',
        pattern: 'https?://[^\\s<>"{}|\\\\^`\\[\\]]+',
        keywords: '网站 URL 链接 http https'
    },
    {
        group: '基础信息',
        label: 'IP地址',
        pattern: '\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b',
        keywords: 'IP 地址 网络'
    },
    {
        group: '基础信息',
        label: '邮箱地址',
        pattern: '[\\w._%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}',
        keywords: '邮箱 邮件 email'
    },
    {
        group: '基础信息',
        label: '中国手机号',
        pattern: '\\b1[3-9]\\d{9}\\b',
        keywords: '手机号 电话 中国 移动'
    },
    {
        group: '基础信息',
        label: '固定电话(带区号)',
        pattern: '\\b0\\d{2,3}-?\\d{7,8}\\b',
        keywords: '固定电话 座机 区号'
    },
    {
        group: '基础信息',
        label: '中国身份证',
        pattern: '\\b[1-9]\\d{5}(?:18|19|20)\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx]\\b',
        keywords: '身份证 中国 ID'
    },
    {
        group: '基础信息',
        label: 'QQ号',
        pattern: '\\b[1-9]\\d{4,10}\\b',
        keywords: 'QQ 号码 腾讯'
    },
    {
        group: '基础信息',
        label: '微信号',
        pattern: '\\b[a-zA-Z][-_a-zA-Z0-9]{5,19}\\b',
        keywords: '微信 WeChat ID'
    },
    {
        group: '基础信息',
        label: '车牌号',
        pattern: '[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-HJ-NP-Z0-9]{5}',
        keywords: '车牌 车辆 号牌'
    },

    // 网络安全
    {
        group: '网络安全',
        label: 'IP:端口',
        pattern: '(?:[0-9]{1,3}\\.){3}[0-9]{1,3}:[0-9]{1,5}',
        keywords: 'IP 端口 地址'
    },
    {
        group: '网络安全',
        label: 'MAC地址',
        pattern: '(?:[A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}',
        keywords: 'MAC 地址 网卡'
    },
    {
        group: '网络安全',
        label: 'MD5哈希',
        pattern: '\\b[A-Fa-f0-9]{32}\\b',
        keywords: 'MD5 哈希 散列 文件校验'
    },
    {
        group: '网络安全',
        label: 'SHA1哈希',
        pattern: '\\b[A-Fa-f0-9]{40}\\b',
        keywords: 'SHA1 哈希 散列 文件校验'
    },
    {
        group: '网络安全',
        label: 'SHA256哈希',
        pattern: '\\b[A-Fa-f0-9]{64}\\b',
        keywords: 'SHA256 哈希 散列 文件校验'
    },
    {
        group: '网络安全',
        label: 'JWT Token',
        pattern: 'eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+',
        keywords: 'JWT Token 令牌 认证'
    },
    {
        group: '网络安全',
        label: 'Session ID',
        pattern: '[A-Za-z0-9]{32,128}',
        keywords: 'Session 会话 ID'
    },
    {
        group: '网络安全',
        label: '私钥特征',
        pattern: '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
        keywords: '私钥 密钥 证书 PEM'
    },
    //常见编码
    //base64
    {
        group: '常见编码',
        label: 'Base64编码',
        pattern: '[A-Za-z0-9+/]{40,}',
        keywords: 'Base64 编码'
    },


    // 常见密钥
    {
        group: '常见密钥',
        label: 'GitHub Token',
        pattern: 'gh[pousr]_[a-zA-Z0-9]{36,}',
        keywords: 'GitHub Token 令牌'
    },
    {
        group: '常见密钥',
        label: 'OpenAI API密钥',
        pattern: 'sk-[a-zA-Z0-9]{48,}',
        keywords: 'OpenAI API 密钥 ChatGPT'
    },
    {
        group: '常见密钥',
        label: 'AWS访问密钥',
        pattern: 'AKIA[0-9A-Z]{16}',
        keywords: 'AWS 访问 密钥 亚马逊'
    },
    {
        group: '常见密钥',
        label: '阿里云AccessKey',
        pattern: 'LTAI[a-zA-Z0-9]{12,20}',
        keywords: '阿里云 AccessKey 密钥'
    },
    {
        group: '常见密钥',
        label: '腾讯云SecretId',
        pattern: 'AKID[a-zA-Z0-9]{32,}',
        keywords: '腾讯云 SecretId 密钥'
    },

    // 财务/金融
    {
        group: '财务/金融',
        label: '银联卡号',
        pattern: '\\b62[0-9]{14,17}\\b',
        keywords: '银联 银行卡 UnionPay'
    },
    {
        group: '财务/金融',
        label: '支付宝账号',
        pattern: '\\b1[3-9]\\d{9}\\b|[\\w._%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}',
        keywords: '支付宝 Alipay 账号'
    },
    {
        group: '财务/金融',
        label: '比特币地址',
        pattern: '\\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\\b|\\bbc1[a-z0-9]{39,59}\\b',
        keywords: '比特币 BTC 加密货币'
    },
    {
        group: '财务/金融',
        label: '以太坊地址',
        pattern: '\\b0x[a-fA-F0-9]{40}\\b',
        keywords: '以太坊 ETH 加密货币'
    },
    {
        group: '财务/金融',
        label: 'USDT地址(TRC20)',
        pattern: '\\bT[A-Za-z1-9]{33}\\b',
        keywords: 'USDT TRC20 泰达币'
    },

    // 系统/路径
    {
        group: '系统/路径',
        label: 'Windows文件路径',
        pattern: '[a-zA-Z]:\\\\[^\\n\\r<>"|?*]+',
        keywords: 'Windows 路径 文件'
    },
    {
        group: '系统/路径',
        label: 'Windows服务名',
        pattern: '\\b[A-Z][a-zA-Z0-9]{2,}(?:Service|Svc)\\b',
        keywords: 'Windows 服务 Service'
    },
    {
        group: '系统/路径',
        label: '域名/主机名',
        pattern: '\\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}\\b',
        keywords: '域名 主机名 DNS'
    },

    // 网络取证
    {
        group: '网络取证',
        label: 'IPv4地址(精确)',
        pattern: '\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b',
        keywords: 'IPv4 IP地址 网络 取证'
    },
    {
        group: '网络取证',
        label: 'HTTP/HTTPS链接',
        pattern: 'https?://[\\w.-]+(?:\\.[\\w\\.-]+)+[\\w\\-\\._~:/?#[\\]@!\\$&\'\\(\\)\\*\\+,;=.]+',
        keywords: 'URL HTTP HTTPS 链接 网址'
    },
    {
        group: '网络取证',
        label: 'User-Agent字符串',
        pattern: 'User-Agent:\\s*[^\\r\\n]+',
        keywords: 'User-Agent UA 浏览器 恶意软件'
    },
    {
        group: '网络取证',
        label: 'MAC地址',
        pattern: '([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})',
        keywords: 'MAC 物理地址 网卡'
    },
    {
        group: '网络取证',
        label: 'UNC路径(SMB共享)',
        pattern: '\\\\\\\\[a-zA-Z0-9-._]+\\\\[a-zA-Z0-9-._$]+',
        keywords: 'UNC SMB 共享 网络路径'
    },

    // 加密货币
    {
        group: '加密货币',
        label: 'Bitcoin地址',
        pattern: '\\b([13][a-km-zA-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})\\b',
        keywords: 'Bitcoin BTC 比特币 钱包 勒索软件'
    },
    {
        group: '加密货币',
        label: 'Ethereum地址',
        pattern: '\\b0x[a-fA-F0-9]{40}\\b',
        keywords: 'Ethereum ETH 以太坊 钱包'
    },
    {
        group: '加密货币',
        label: 'Monero地址',
        pattern: '\\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\\b',
        keywords: 'Monero XMR 门罗币 挖矿木马'
    },

    // 云服务密钥
    {
        group: '云服务密钥',
        label: 'AWS Access Key',
        pattern: '\\b(AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}\\b',
        keywords: 'AWS Amazon 密钥 Access Key'
    },
    {
        group: '云服务密钥',
        label: 'Google Cloud API Key',
        pattern: '\\bAIza[0-9A-Za-z\\-_]{35}\\b',
        keywords: 'Google GCP API密钥'
    },
    {
        group: '云服务密钥',
        label: 'Azure连接字符串',
        pattern: 'Endpoint=sb://[a-zA-Z0-9]+\\.servicebus\\.windows\\.net/;SharedAccessKeyName=[a-zA-Z0-9]+;SharedAccessKey=[a-zA-Z0-9+/=]+',
        keywords: 'Azure 微软 连接字符串'
    },
    {
        group: '云服务密钥',
        label: 'Slack Token',
        pattern: 'xox[baprs]-([0-9a-zA-Z]{10,48})?',
        keywords: 'Slack Token 令牌'
    },

    // 敏感数据
    {
        group: '敏感数据',
        label: 'Base64长字符串',
        pattern: '(?:[A-Za-z0-9+/]{4}){50,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?',
        keywords: 'Base64 编码 Payload PE文件'
    },
    {
        group: '敏感数据',
        label: 'Visa信用卡',
        pattern: '\\b4[0-9]{12}(?:[0-9]{3})?\\b',
        keywords: 'Visa 信用卡 银行卡'
    },
    {
        group: '敏感数据',
        label: 'MasterCard信用卡',
        pattern: '\\b5[1-5][0-9]{14}\\b',
        keywords: 'MasterCard 万事达 信用卡'
    },
    {
        group: '敏感数据',
        label: 'Windows可执行文件路径',
        pattern: '[a-zA-Z]:\\\\[^:*?"<>|\\r\\n]+\\.(?:exe|dll|bat|ps1|vbs|sys)',
        keywords: 'Windows 可执行文件 恶意软件 路径'
    },

    // 恶意行为特征
    {
        group: '恶意行为',
        label: 'Webshell常见函数',
        pattern: '(eval\\(|base64_decode\\(|passthru\\(|exec\\(|system\\(|shell_exec\\(|CreateObject\\("WScript.Shell"\\))',
        keywords: 'Webshell 一句话木马 PHP JSP ASP'
    },
    {
        group: '恶意行为',
        label: 'Shellcode NOP Sled',
        pattern: '\\x90\\x90\\x90\\x90+',
        keywords: 'Shellcode NOP 缓冲区溢出 漏洞利用'
    },
    {
        group: '恶意行为',
        label: '可疑文件扩展名',
        pattern: '\\.(exe|dll|sys|bat|ps1|vbs|js|php|jsp|asp|aspx)\\b',
        keywords: '可执行文件 脚本 恶意软件'
    },
    {
        group: '恶意行为',
        label: '宽字符password',
        pattern: 'p\\x00a\\x00s\\x00s\\x00w\\x00o\\x00r\\x00d\\x00',
        keywords: '宽字符 UTF-16 密码 Windows'
    },

    // 混淆与编码
    {
        group: '混淆与编码',
        label: 'Hex编码字符串',
        pattern: '\\b[0-9A-Fa-f]{32,}\\b',
        keywords: 'Hex 十六进制 编码 混淆'
    },
    {
        group: '混淆与编码',
        label: 'URL编码序列',
        pattern: '(?:%[0-9A-Fa-f]{2}){5,}',
        keywords: 'URL编码 百分号编码 混淆'
    },
    {
        group: '混淆与编码',
        label: 'PowerShell混淆',
        pattern: '(?:\\w+`\\w+)+',
        keywords: 'PowerShell 混淆 反引号 命令'
    },

    // 栈字符串识别 (Stack Strings)
    {
        group: '栈字符串',
        label: 'x86 MOV字节赋值',
        pattern: '\\xC6\\x44\\x24[\\x00-\\xff][\\x20-\\x7e]',
        keywords: '栈字符串 x86 MOV 汇编 逐字节'
    },
    {
        group: '栈字符串',
        label: 'x86 MOV立即数到栈',
        pattern: '\\xC7\\x44\\x24[\\x00-\\xff][\\x20-\\x7e]{4}',
        keywords: '栈字符串 x86 MOV DWORD 汇编'
    },
    {
        group: '栈字符串',
        label: 'x64 MOV字节赋值',
        pattern: '\\xC6\\x45[\\x00-\\xff][\\x20-\\x7e]',
        keywords: '栈字符串 x64 MOV 汇编 逐字节'
    },
    {
        group: '栈字符串',
        label: 'x86 PUSH立即数序列',
        pattern: '(\\x68[\\x20-\\x7e]{4}){2,}',
        keywords: '栈字符串 PUSH 汇编 连续压栈'
    },
    {
        group: '栈字符串',
        label: 'XOR解密模式',
        pattern: '\\x80\\x34[\\x00-\\xff]{2}',
        keywords: 'XOR 解密 混淆 shellcode'
    },
    {
        group: '栈字符串',
        label: '连续ASCII压栈',
        pattern: '(\\x6A[\\x20-\\x7e]){4,}',
        keywords: '栈字符串 PUSH 单字节 ASCII'
    },

    // PE/ELF特征
    {
        group: 'PE/ELF特征',
        label: 'MZ头',
        pattern: 'MZ[\\x00-\\xff]{58}PE\\x00\\x00',
        keywords: 'PE MZ头 可执行文件 Windows'
    },
    {
        group: 'PE/ELF特征',
        label: 'PE签名',
        pattern: 'PE\\x00\\x00',
        keywords: 'PE签名 Windows 可执行文件'
    },
    {
        group: 'PE/ELF特征',
        label: 'ELF头',
        pattern: '\\x7fELF',
        keywords: 'ELF Linux 可执行文件'
    },
    {
        group: 'PE/ELF特征',
        label: 'DOS头提示',
        pattern: 'This program cannot be run in DOS mode',
        keywords: 'DOS PE 可执行文件'
    },
    {
        group: 'PE/ELF特征',
        label: '.text段',
        pattern: '\\.text\\x00',
        keywords: 'PE段 .text 代码段'
    },
    {
        group: 'PE/ELF特征',
        label: '.data段',
        pattern: '\\.data\\x00',
        keywords: 'PE段 .data 数据段'
    },
    {
        group: 'PE/ELF特征',
        label: '.rdata段',
        pattern: '\\.rdata\\x00',
        keywords: 'PE段 .rdata 只读数据'
    },

    // 进程/系统特征
    {
        group: '进程特征',
        label: 'Windows API调用',
        pattern: '(?:Kernel32|User32|Ntdll|Advapi32|Ws2_32)\\.dll',
        keywords: 'Windows API DLL 系统调用'
    },
    {
        group: '进程特征',
        label: '敏感API函数',
        pattern: '(?:VirtualAlloc|VirtualProtect|CreateRemoteThread|WriteProcessMemory|ReadProcessMemory|NtCreateThreadEx)',
        keywords: 'API 注入 内存操作 恶意软件'
    },
    {
        group: '进程特征',
        label: '网络API函数',
        pattern: '(?:WSAStartup|socket|connect|send|recv|InternetOpen|HttpOpenRequest)',
        keywords: 'API 网络 通信 C2'
    },
    {
        group: '进程特征',
        label: '加密API函数',
        pattern: '(?:CryptAcquireContext|CryptEncrypt|CryptDecrypt|BCryptOpenAlgorithmProvider)',
        keywords: 'API 加密 勒索软件'
    }
];

/**
 * 按分组组织预设
 */
export function getPresetsByGroup(): Map<string, RegexPreset[]> {
    const groups = new Map<string, RegexPreset[]>();
    
    REGEX_PRESETS.forEach(preset => {
        if (!groups.has(preset.group)) {
            groups.set(preset.group, []);
        }
        groups.get(preset.group)!.push(preset);
    });
    
    return groups;
}

/**
 * 搜索预设
 */
export function searchPresets(query: string): RegexPreset[] {
    if (!query) return REGEX_PRESETS;
    
    const lowerQuery = query.toLowerCase();
    return REGEX_PRESETS.filter(preset => 
        preset.label.toLowerCase().includes(lowerQuery) ||
        preset.pattern.toLowerCase().includes(lowerQuery) ||
        preset.keywords.toLowerCase().includes(lowerQuery)
    );
}

/**
 * 字符串搜索模块 - 类型定义
 */

// 搜索配置接口
export interface StringSearchConfig {
    mode: SearchMode;
    min_length: number;
    encodings: string[];
    search_pattern?: string;
    use_regex: boolean;
    case_sensitive: boolean;
    max_results: number;
    thread_count: number | null;
    enable_entropy_filter?: boolean;
    min_entropy?: number;
    use_hex?: boolean;
}

export type SearchMode = 
    | { ImageSearch: { image_path: string } }
    | { ProcessSearch: { process_id: number } }
    | { FileSearch: { file_path: string } }
    | { FolderSearch: { folder_path: string } };

// 搜索结果接口
export interface FoundString {
    offset: number;
    content: string;
    encoding: string;
    byte_length: number;
    context?: string;
    source_file?: string;
    source_file_path?: string;
    entropy?: number;
}

export interface SearchProgress {
    processed_bytes: number;
    total_bytes: number;
    found_count: number;
    status: string;
    completed: boolean;
}

export interface SearchStats {
    duration_ms: number;
    processed_bytes: number;
    total_found: number;
    encoding_stats: Record<string, number>;
}

export interface SearchResult {
    strings: FoundString[];
    stats: SearchStats;
    truncated: boolean;
    page: number;
    page_size: number;
    total_pages: number;
    has_more: boolean;
    cache_key?: string;
}

// Hex 上下文数据
export interface HexContextData {
    offset: number;
    bytes: number[];
    ascii: string;
}

// 排序配置
export interface SortConfig {
    column: 'offset' | 'encoding' | 'byte_length' | 'entropy' | 'content';
    direction: 'asc' | 'desc';
}

// 列过滤配置
export interface ColumnFilters {
    offset: string;
    encoding: string;
    content: string;
}

// 标签预定义
export const TAG_PRESETS = ['可疑', 'IOC', '良性', '证据', '关键线索'] as const;
export type TagPreset = typeof TAG_PRESETS[number];

// 字符串聚类分类
export type StringCategory =
    | 'url' | 'file_path' | 'registry_key' | 'dll_api'
    | 'ip_address' | 'email' | 'encoded_data' | 'hash'
    | 'crypto_key' | 'plaintext' | 'other';

export interface StringCluster {
    category: StringCategory;
    label: string;
    count: number;
    strings: FoundString[];
    collapsed: boolean;
}

// 搜索会话
export interface SearchSession {
    id: string;
    name: string;
    timestamp: number;
    config: StringSearchConfig;
    resultCount: number;
    tags: Record<string, string[]>;  // offset hex string -> tags
    bookmarks: SearchBookmark[];
    notes: string;
}

export interface SearchBookmark {
    offset: number;
    content: string;
    encoding: string;
    note: string;
    timestamp: number;
}

// 可视化数据
export interface VisualizationData {
    entropyHeatmap: Array<{ offset: number; entropy: number }>;
    offsetHistogram: Array<{ bucketStart: number; count: number }>;
    encodingDistribution: Record<string, number>;
    lengthDistribution: Array<{ bucket: number; count: number }>;
}

// YARA 相关类型
export interface YaraConfig {
    rule_paths: string[];
    rule_content?: string;
    target_path: string;
}

export interface YaraStringMatch {
    identifier: string;
    offset: number;
    matched_data_hex: string;
    length: number;
}

export interface YaraRuleMatch {
    rule_name: string;
    namespace: string;
    tags: string[];
    metadata: Record<string, string>;
    matched_strings: YaraStringMatch[];
}

export interface YaraScanResult {
    matches: YaraRuleMatch[];
    stats: YaraScanStats;
}

export interface YaraScanStats {
    rules_loaded: number;
    rules_matched: number;
    strings_matched: number;
    duration_ms: number;
    file_size: number;
}

export interface YaraScanProgress {
    status: string;
    completed: boolean;
    rules_loaded: number;
    matches_found: number;
}

// 默认搜索配置
export const DEFAULT_SEARCH_CONFIG: StringSearchConfig = {
    mode: { ImageSearch: { image_path: '' } },
    min_length: 4,
    encodings: ['Ascii', 'Utf8'],
    use_regex: false,
    case_sensitive: false,
    max_results: 10000,
    thread_count: null
};

// 应用状态和接口定义
export interface AppState {
  currentTab: string;
  selectedAvatar: number;
  files: FileItem[];
  commandOutput: string[];
  currentImage?: ImageInfo;
  memProcFSProcessId?: number;
  commandHistory?: CommandHistoryItem[];
  warnings?: any[];
  theme?: 'light' | 'dark' | 'sakura';
  volatility2Disabled?: boolean;
  volatility2DisabledMessage?: string;
}

export interface CommandHistoryItem {
  id: number;
  name: string;
  command: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  time: string;
  processId?: number;
  output?: string;
  error?: string;
}

export interface FileItem {
  name: string;
  size: string;
  modified: string;
  type: 'file' | 'folder';
}

export interface ImageInfo {
  path: string;
  name: string;
  size: number;
}

export interface FeatureConfig {
  icon: string;
  title: string;
  desc: string;
  feature: string;
  category: string;
}

export interface FeatureInfo {
  id: string;
  name: string;
  description: string;
  category: string;
}

// Profile信息接口
export interface ProfileInfo {
  detected_os?: string;
  suggested_profile?: string;
  profile_list: string[];
}

// 内存镜像加载结果接口
export interface LoadMemResult {
  success: boolean;
  message: string;
  process_id?: number;
  command: string;
  output: string;
  error: string;
  profile_info?: ProfileInfo;
}

// ─── 应用设置类型 (对应 Rust AppSettings) ─────────────────────

export interface ThemeSettings {
  mode?: string;
  custom_css?: string;
}

export interface WallpaperSettings {
  enabled?: boolean;
  path?: string;
  opacity?: number;
  blur?: number;
  fit?: string;
  zoom?: number;
  position_x?: number;
  position_y?: number;
}

export interface AiSettings {
  api_key?: string;
  base_url?: string;
  model?: string;
  custom_prompt?: string;
}

export interface AiProvider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  custom_prompt?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomTool {
  name: string;
  command: string;
  icon?: string;
  description?: string;
}

export interface ScriptManagementSettings {
  auto_save?: boolean;
  default_language?: string;
}

interface StoredWatermarkConfig {
  enabled: boolean;
  custom_text: string;
  opacity: number;
  font_size: number;
  density: number;
}

export interface AppSettings {
  python2_path: string;
  python3_path: string;
  memprocfs_path: string;
  mount_drive_letter: string;
  volatility2_path: string;
  volatility2_plugin: string;
  volatility3_path: string;
  output_path: string;
  warning_path: string;
  language: 'zh-CN' | 'en-US';
  theme: ThemeSettings;
  wallpaper: WallpaperSettings;
  current_image_path: string;
  custom_tools: CustomTool[];
  volatility2_profile: string;
  area_icons: Record<string, string>;
  ai_settings: AiSettings;
  ai_providers: AiProvider[];
  current_ai_provider_id?: string;
  ai_default_agent: string;
  ai_temperature: number;
  ai_max_tokens: number;
  scripts_path: string;
  extensions_path: string;
  tooltip_rules_path: string;
  script_management: ScriptManagementSettings;
  yara_enabled: boolean;
  yara_rules_path: string;
  pagefile0_path: string;
  pagefile1_path: string;
  dumpit_path: string;
  watermark_config: StoredWatermarkConfig;
  markdown_save_path: string;
  memnixfs_path?: string;
  memnixfs_symbols_path?: string;
  memnixfs_vmlinux_path?: string;
  memnixfs_forensic_mode?: string;
  memnixfs_auto_fetch?: boolean;
  memnixfs_symbol_cache_path?: string;
  memnixfs_proxy?: string;
  /** MemProcFS 组件（vmm.dll / memprocfs.exe）云端更新清单地址，留空禁用启动校验 */
  memprocfs_update_url?: string;
  /** 是否启用 Volatility 插件结果缓存（默认开启） */
  vol_cache_enabled?: boolean;
}

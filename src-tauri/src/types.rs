use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 镜像文件信息
#[derive(Debug, Serialize, Deserialize)]
pub struct ImageInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
}
/// 水印配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WatermarkConfig {
    #[serde(default = "default_watermark_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub custom_text: String,
    #[serde(default = "default_watermark_opacity")]
    pub opacity: f32,
    #[serde(default = "default_watermark_font_size")]
    pub font_size: u32,
    #[serde(default = "default_watermark_density")]
    pub density: f32,
}

fn default_watermark_enabled() -> bool {
    true
}

fn default_watermark_opacity() -> f32 {
    0.1
}

fn default_watermark_font_size() -> u32 {
    20
}

fn default_watermark_density() -> f32 {
    1.0
}

fn default_language() -> String {
    "zh-CN".to_string()
}

impl Default for WatermarkConfig {
    fn default() -> Self {
        Self {
            enabled: default_watermark_enabled(),
            custom_text: String::new(),
            opacity: default_watermark_opacity(),
            font_size: default_watermark_font_size(),
            density: default_watermark_density(),
        }
    }
}

/// 应用程序设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub python2_path: String,
    pub python3_path: String,
    pub memprocfs_path: String,
    #[serde(default = "default_mount_drive_letter")]
    pub mount_drive_letter: String,
    pub volatility2_path: String,
    #[serde(default)]
    pub volatility2_plugin: String,
    pub volatility3_path: String,
    pub output_path: String,
    #[serde(default)]
    pub warning_path: String,
    /// 是否启用内置告警规则库（默认开启）
    #[serde(default = "default_true")]
    pub builtin_warnings_enabled: bool,
    /// 被用户单独停用的内置告警规则 id 列表
    #[serde(default)]
    pub disabled_builtin_warning_ids: Vec<String>,
    #[serde(default)]
    pub theme: ThemeSettings,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default)]
    pub wallpaper: WallpaperSettings,
    #[serde(default)]
    pub current_image_path: String,
    #[serde(default)]
    pub custom_tools: Vec<CustomTool>,
    #[serde(default = "default_volatility2_profile")]
    pub volatility2_profile: String,
    #[serde(default)]
    pub area_icons: HashMap<String, String>,
    #[serde(default)]
    pub ai_settings: AiSettings,
    #[serde(default)]
    pub ai_providers: Vec<AiProvider>,
    #[serde(default)]
    pub current_ai_provider_id: Option<String>,
    #[serde(default = "default_ai_agent")]
    pub ai_default_agent: String,
    #[serde(default = "default_ai_temperature")]
    pub ai_temperature: f32,
    #[serde(default = "default_ai_max_tokens")]
    pub ai_max_tokens: u32,
    #[serde(default = "default_scripts_path")]
    pub scripts_path: String,
    #[serde(default = "default_extensions_path")]
    pub extensions_path: String,
    #[serde(default = "default_tooltip_rules_path")]
    pub tooltip_rules_path: String,
    #[serde(default)]
    pub script_management: ScriptManagementSettings,
    #[serde(default)]
    pub yara_enabled: bool,
    #[serde(default)]
    pub yara_rules_path: String,
    #[serde(default)]
    pub pagefile0_path: String,
    #[serde(default)]
    pub pagefile1_path: String,
    #[serde(default)]
    pub dumpit_path: String,
    /// 水印配置
    #[serde(default)]
    pub watermark_config: WatermarkConfig,
    /// Markdown 报告保存路径
    #[serde(default = "default_markdown_save_path")]
    pub markdown_save_path: String,
    /// MemNixFS 可执行文件路径（Linux 内存取证）
    #[serde(default)]
    pub memnixfs_path: String,
    /// MemNixFS ISF 符号文件/目录路径
    #[serde(default)]
    pub memnixfs_symbols_path: String,
    /// MemNixFS 自定义 vmlinux 路径（可选）
    #[serde(default)]
    pub memnixfs_vmlinux_path: String,
    /// MemNixFS 取证模式: "quick" | "smart" | "full"
    #[serde(default = "default_memnixfs_forensic_mode")]
    pub memnixfs_forensic_mode: String,
    /// 是否允许联网自动拉取内核符号（默认 false，纯离线）
    #[serde(default)]
    pub memnixfs_auto_fetch: bool,
    /// MemNixFS 符号缓存目录（--symbol-cache）
    #[serde(default)]
    pub memnixfs_symbol_cache_path: String,
    /// MemNixFS 拉取符号时使用的 HTTP 代理（如 http://127.0.0.1:7890）
    #[serde(default)]
    pub memnixfs_proxy: String,
    /// MemProcFS 组件（vmm.dll / memprocfs.exe）云端更新清单地址。
    /// 每次启动会拉取该 JSON 清单并对本地组件做 SHA256 校验，不一致时静默下载替换。
    /// 留空则禁用校验。
    #[serde(default = "default_memprocfs_update_url")]
    pub memprocfs_update_url: String,
    /// 是否启用 Volatility 插件结果缓存（默认开启）。
    /// 同一镜像重复执行同一插件（相同参数）时直接复用上次结果，不再重跑 Python。
    #[serde(default = "default_true")]
    pub vol_cache_enabled: bool,
}

/// AI 设置（保留用于向后兼容）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiSettings {
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub custom_prompt: Option<String>,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            base_url: String::new(),
            model: String::new(),
            api_key: String::new(),
            custom_prompt: None,
        }
    }
}

/// AI 提供商配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiProvider {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    #[serde(default)]
    pub custom_prompt: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 脚本管理设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptManagementSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub scripts: Vec<PythonScript>,
    #[serde(default)]
    pub auto_execute_on_image_load: bool,
}

impl Default for ScriptManagementSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_execute_on_image_load: true,
            scripts: Vec::new(),
        }
    }
}

/// 工具提示规则类型
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum TooltipRuleType {
    #[serde(rename = "exact")]
    Exact { value: String },
    #[serde(rename = "range")]
    Range { min: f64, max: f64 },
    #[serde(rename = "regex")]
    Regex { pattern: String },
}

/// 工具提示规则
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TooltipRule {
    pub rule_type: TooltipRuleType,
    pub tooltip: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 列的工具提示规则集合
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnTooltipRules {
    pub column_name: String,
    pub rules: Vec<TooltipRule>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Python脚本配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PythonScript {
    pub id: String,
    pub name: String,
    pub description: String,
    pub file_path: String,
    pub enabled: bool,
    pub arguments: String,
    pub timeout_seconds: u64,
    pub created_at: String,
    pub updated_at: String,
    pub last_executed: Option<String>,
    pub execution_count: u64,
    /// 是否启用变量替换功能
    #[serde(default)]
    pub enable_variable_substitution: bool,
    /// 脚本内容模板（可选，用于内联脚本）
    #[serde(default)]
    pub script_content: Option<String>,
}

impl Default for PythonScript {
    fn default() -> Self {
        Self {
            id: format!("script_{}", chrono::Utc::now().timestamp_millis()),
            name: "新脚本".to_string(),
            description: "".to_string(),
            file_path: "".to_string(),
            enabled: true,
            arguments: "".to_string(),
            timeout_seconds: 300, // 5分钟默认超时
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
            last_executed: None,
            execution_count: 0,
            enable_variable_substitution: true, // 默认启用变量替换
            script_content: None,
        }
    }
}

/// 脚本执行结果
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptExecutionResult {
    pub script_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub execution_time_ms: u64,
    pub executed_at: String,
}

/// 脚本执行状态
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScriptExecutionStatus {
    pub script_id: String,
    pub status: String, // "idle", "running", "completed", "error"
    pub progress: Option<String>,
    pub started_at: Option<String>,
}

/// 主题设置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ThemeSettings {
    #[serde(default = "default_theme_mode")]
    pub current_theme: String,
}

impl Default for ThemeSettings {
    fn default() -> Self {
        Self {
            current_theme: "light".to_string(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WallpaperSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub file_path: String,
    #[serde(default = "default_wallpaper_mode")]
    pub mode: String,
    #[serde(default = "default_wallpaper_blend_mode")]
    pub blend_mode: String,
    #[serde(default = "default_wallpaper_tint_color")]
    pub tint_color: String,
    #[serde(default = "default_wallpaper_tint_opacity")]
    pub tint_opacity: f32,
    #[serde(default = "default_wallpaper_vignette")]
    pub vignette: f32,
    #[serde(default = "default_wallpaper_zoom")]
    pub zoom: f32,
    #[serde(default = "default_wallpaper_pos_x")]
    pub pos_x: f32,
    #[serde(default = "default_wallpaper_pos_y")]
    pub pos_y: f32,
    #[serde(default = "default_wallpaper_clarity")]
    pub clarity: f32,
    #[serde(default = "default_wallpaper_opacity")]
    pub opacity: f32,
    #[serde(default = "default_wallpaper_blur")]
    pub blur: f32,
    #[serde(default = "default_wallpaper_dim")]
    pub dim: f32,
    #[serde(default = "default_wallpaper_brightness")]
    pub brightness: f32,
    #[serde(default = "default_wallpaper_contrast")]
    pub contrast: f32,
    #[serde(default = "default_wallpaper_hue_rotate")]
    pub hue_rotate: f32,
    #[serde(default = "default_wallpaper_grayscale")]
    pub grayscale: f32,
    #[serde(default = "default_wallpaper_sepia")]
    pub sepia: f32,
    #[serde(default = "default_wallpaper_fit")]
    pub fit: String,
    #[serde(default = "default_wallpaper_saturate")]
    pub saturate: f32,
}

fn default_wallpaper_opacity() -> f32 {
    0.35
}

fn default_wallpaper_mode() -> String {
    "overlay".to_string()
}

fn default_wallpaper_blend_mode() -> String {
    "normal".to_string()
}

fn default_wallpaper_tint_color() -> String {
    "#000000".to_string()
}

fn default_wallpaper_tint_opacity() -> f32 {
    0.0
}

fn default_wallpaper_vignette() -> f32 {
    0.0
}

fn default_wallpaper_zoom() -> f32 {
    1.0
}

fn default_wallpaper_pos_x() -> f32 {
    50.0
}

fn default_wallpaper_pos_y() -> f32 {
    50.0
}

fn default_wallpaper_clarity() -> f32 {
    0.0
}

fn default_wallpaper_blur() -> f32 {
    0.0
}

fn default_wallpaper_dim() -> f32 {
    0.25
}

fn default_wallpaper_brightness() -> f32 {
    1.0
}

fn default_wallpaper_contrast() -> f32 {
    1.0
}

fn default_wallpaper_hue_rotate() -> f32 {
    0.0
}

fn default_wallpaper_grayscale() -> f32 {
    0.0
}

fn default_wallpaper_sepia() -> f32 {
    0.0
}

fn default_wallpaper_fit() -> String {
    "cover".to_string()
}

fn default_wallpaper_saturate() -> f32 {
    1.0
}

impl Default for WallpaperSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            file_path: String::new(),
            mode: default_wallpaper_mode(),
            blend_mode: default_wallpaper_blend_mode(),
            tint_color: default_wallpaper_tint_color(),
            tint_opacity: default_wallpaper_tint_opacity(),
            vignette: default_wallpaper_vignette(),
            zoom: default_wallpaper_zoom(),
            pos_x: default_wallpaper_pos_x(),
            pos_y: default_wallpaper_pos_y(),
            clarity: default_wallpaper_clarity(),
            opacity: default_wallpaper_opacity(),
            blur: default_wallpaper_blur(),
            dim: default_wallpaper_dim(),
            brightness: default_wallpaper_brightness(),
            contrast: default_wallpaper_contrast(),
            hue_rotate: default_wallpaper_hue_rotate(),
            grayscale: default_wallpaper_grayscale(),
            sepia: default_wallpaper_sepia(),
            fit: default_wallpaper_fit(),
            saturate: default_wallpaper_saturate(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            python2_path: String::new(),
            python3_path: String::new(),
            memprocfs_path: String::new(),
            mount_drive_letter: "M".to_string(),
            volatility2_path: String::new(),
            volatility2_plugin: String::new(),
            volatility3_path: String::new(),
            output_path: "output".to_string(),
            warning_path: String::new(),
            builtin_warnings_enabled: true,
            disabled_builtin_warning_ids: Vec::new(),
            theme: ThemeSettings::default(),
            language: default_language(),
            wallpaper: WallpaperSettings::default(),
            current_image_path: String::new(),
            custom_tools: Vec::new(),
            volatility2_profile: "Win7SP1x64".to_string(),
            area_icons: HashMap::new(),
            ai_settings: AiSettings::default(),
            ai_providers: Vec::new(),
            current_ai_provider_id: None,
            ai_default_agent: "general".to_string(),
            ai_temperature: 0.7,
            ai_max_tokens: 2000,
            scripts_path: "scripts".to_string(),
            extensions_path: "extensions".to_string(),
            tooltip_rules_path: "tooltip_rules".to_string(),
            script_management: ScriptManagementSettings::default(),
            yara_enabled: false,
            yara_rules_path: String::new(),
            pagefile0_path: String::new(),
            pagefile1_path: String::new(),
            dumpit_path: String::new(),
            watermark_config: WatermarkConfig::default(),
            markdown_save_path: "markdown".to_string(),
            memnixfs_path: String::new(),
            memnixfs_symbols_path: String::new(),
            memnixfs_vmlinux_path: String::new(),
            memnixfs_forensic_mode: default_memnixfs_forensic_mode(),
            memnixfs_auto_fetch: false,
            memnixfs_symbol_cache_path: String::new(),
            memnixfs_proxy: String::new(),
            memprocfs_update_url: default_memprocfs_update_url(),
            vol_cache_enabled: true,
        }
    }
}

/// 文件信息
#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: String,
    pub created: String,
    pub extension: String,
}

/// 图片文件信息
#[derive(Debug, Serialize, Deserialize)]
pub struct ImageFileInfo {
    pub file_name: String,
    pub file_size: u64,
    pub width: u32,
    pub height: u32,
    pub file_path: String,
}

/// 多图片检测结果
#[derive(Debug, Serialize, Deserialize)]
pub struct MultipleImagesResult {
    pub total_count: usize,
    pub images: Vec<DetectedImage>,
}

/// 检测到的图片信息
#[derive(Debug, Serialize, Deserialize)]
pub struct DetectedImage {
    pub index: usize,
    pub format: String,
    pub offset: u64,
    pub size: u64,
    pub width: u32,
    pub height: u32,
    pub base64_data: String,
}

/// 二维码识别结果
#[derive(Debug, Serialize, Deserialize)]
pub struct QrCodeResult {
    pub found: bool,
    pub content: Option<String>,
    pub qr_type: Option<String>,
    pub position: Option<QrCodePosition>,
}

/// 二维码位置信息
#[derive(Debug, Serialize, Deserialize)]
pub struct QrCodePosition {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// 自定义工具
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomTool {
    pub id: String,
    pub name: String,
    pub description: String,
    pub command: String,
    pub arguments: String,
    pub icon: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// CSV插件定义
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CsvPlugin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub command: String,
    pub context_menu_enabled: bool,
    pub hotkey: Option<String>,
    pub icon: String,
    pub output_filename: Option<String>,
    #[serde(default)]
    pub allowed_columns: Option<Vec<String>>,
    #[serde(default)]
    pub allowed_filenames: Option<Vec<String>>,
    #[serde(default)]
    pub input_labels: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    pub open_output_folder: bool,
    /// 命令分类（用于右键菜单二级分组），如"进程内存/可执行程序/文件导出"等；为空归入"其他"
    #[serde(default)]
    pub category: Option<String>,
    /// 是否为内置插件（由内置库加载时置 true；用户配置里恒为默认 false，不落盘）
    #[serde(default)]
    pub builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 文件浏览器插件定义
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileBrowserPlugin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub command_template: String, // 例如: "{tool_1750147208488_f5og63z0n} {file_path}" 或 "{python3_path} script.py {file_path}"
    pub icon: String,
    pub enabled: bool,
    pub file_types: Vec<String>, // 支持的文件类型，如 ["*", "txt", "csv"]
    pub created_at: String,
    pub updated_at: String,
}

impl Default for CsvPlugin {
    fn default() -> Self {
        Self {
            id: format!("plugin_{}", chrono::Utc::now().timestamp()),
            name: "新插件".to_string(),
            description: "".to_string(),
            command: "".to_string(),
            context_menu_enabled: true,
            hotkey: None,
            icon: "⚙️".to_string(),
            output_filename: None,
            allowed_columns: None,
            allowed_filenames: None,
            input_labels: None,
            open_output_folder: false,
            category: None,
            builtin: false,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}

/// Python脚本信息
#[derive(serde::Serialize)]
pub struct PythonScriptInfo {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub icon: String,
    pub file_types: Vec<String>,
    pub file_path: String,
}

/// 插件命令执行上下文
#[derive(Debug, Serialize, Deserialize)]
pub struct PluginCommandContext {
    pub cell_data: Option<serde_json::Value>,
    pub variables: Option<HashMap<String, String>>,
}

/// 插件命令执行结果
#[derive(Debug, Serialize, Deserialize)]
pub struct PluginCommandResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub exit_code: Option<i32>,
    pub execution_time: u64,
}

/// 终端命令执行结果
#[derive(Debug, Serialize, Deserialize)]
pub struct TerminalCommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub execution_time: u64,
    pub command: String,
    pub working_directory: String,
}

/// CSV插件执行结果
#[derive(Debug, Serialize, Deserialize)]
pub struct CsvPluginResult {
    pub success: bool,
    pub output: String,
    pub output_file: Option<String>,
    pub output_file_type: Option<String>,
    pub should_open_file: bool,
    pub executed_command: Option<String>, // 添加实际执行的命令
}

/// CSV插件执行上下文
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CsvPluginContext {
    pub selected_file: String,
    pub selected_row: i32,
    pub selected_cell: String,
    pub selected_column: String,
    pub all_selected_cells: String,
}

fn default_theme_mode() -> String {
    "light".to_string()
}

fn default_volatility2_profile() -> String {
    "Win7SP1x64".to_string()
}

fn default_mount_drive_letter() -> String {
    "M".to_string()
}

fn default_memnixfs_forensic_mode() -> String {
    "smart".to_string()
}

fn default_true() -> bool {
    true
}

fn default_memprocfs_update_url() -> String {
    String::new()
}

fn default_scripts_path() -> String {
    "scripts".to_string()
}

fn default_extensions_path() -> String {
    "extensions".to_string()
}

fn default_tooltip_rules_path() -> String {
    "tooltip_rules".to_string()
}

fn default_markdown_save_path() -> String {
    "markdown".to_string()
}

fn default_ai_agent() -> String {
    "general".to_string()
}

fn default_ai_temperature() -> f32 {
    0.7
}

fn default_ai_max_tokens() -> u32 {
    2000
}

/// SSH主机配置
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshHostConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String, // "password" 或 "key"
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub timeout: u32,
    pub created_at: String,
    pub updated_at: String,
}

impl Default for SshHostConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            host: String::new(),
            port: 22,
            username: String::new(),
            auth_type: "password".to_string(),
            password: None,
            private_key_path: None,
            passphrase: None,
            timeout: 30,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }
}

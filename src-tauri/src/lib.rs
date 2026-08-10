// 模块声明

// debug_mode 必须最先声明，因为它定义了 debug_info! 等宏
#[macro_use]
pub mod debug_mode;

pub mod anti_tamper;
mod loadmem;
mod memnixfs;
mod vol3linux;
mod volatility2;
mod volatility3;

// 新的模块化结构
#[macro_use]
pub mod types;

// 命令模块（从 lib.rs 拆分）
pub mod ai_providers;
pub mod ai_v2;
pub mod builtin_csv_plugins;
pub mod builtin_warnings;
pub mod command_executor;
pub mod embedded_forensic_actions;
pub mod evtx_parser;
pub mod exif_reader;
pub mod file_operations;
pub mod hex_reader;
pub mod image_finder;
pub mod ioc_extractor;
pub mod kernel_version_index;
pub mod log_manager;
pub mod memnixfs_commands;
pub mod memory_commands;
pub mod memprocfs_update;
pub mod network_utils;
pub mod path_utils;
pub mod pe_parser;
pub mod plugin_system;
pub mod process_manager;
pub mod pypykatz_extract;
pub mod python_env_manager;
pub mod registry_browser;
pub mod registry_forensics;
pub mod registry_parser;
pub mod script_commands;
pub mod script_manager;
pub mod settings;
pub mod settings_io;
pub mod settings_validator;
pub mod sqlite_viewer;
pub mod string_search;
pub mod symbol_manager;
pub mod template_commands;
pub mod theme_manager;
pub mod tool_detector;
pub mod toolchain_installer;
pub mod tools_manager;
pub mod tooltip_rules;
pub mod update_manager;
pub mod vol3linux_commands;
pub mod vol_cache;
pub mod volatility2_commands;
pub mod volatility3_commands;
pub mod wallpaper_manager;
pub mod warning_rules;
pub mod window_events;
pub mod window_manager;
pub mod yara_scanner;

pub mod dokan_manager;
pub mod drivers_viewer;
pub mod handles_viewer;
pub mod markdown_manager;
pub mod mcp_manager;
pub mod module_stats;
pub mod modules_viewer;
pub mod net_viewer;
pub mod ntfs_file_tree;
pub mod process_viewer;
pub mod services_viewer;
pub mod super_timeline;
pub mod terminal_shell;
pub mod wechat_decrypt_rs_adapter;
pub mod wechat_key_decrypt;
pub mod winfsp_manager;

// PixelWeaver：原始数据图像可视化（从 LovelyPixelWeaver 合并）
pub mod pixel_weaver;

// 重新导出类型以保持向后兼容性
pub use types::*;

// Tauri Emitter trait 在各模块中按需导入

/// 设置 ARM64 系统的 panic hook，提供更好的错误处理
fn setup_arm64_panic_hook() {
    use std::panic;

    // 检测是否为 ARM64 系统
    let is_arm64 = std::env::consts::ARCH == "aarch64";

    if is_arm64 {
        debug_info!("[*] ARM64 系统检测到，设置兼容性 panic hook");

        // 设置自定义 panic hook
        panic::set_hook(Box::new(|panic_info| {
            let location = panic_info
                .location()
                .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                .unwrap_or_else(|| "unknown location".to_string());
            let message = panic_info
                .payload()
                .downcast_ref::<&str>()
                .unwrap_or(&"unknown panic");

            debug_error!("=== ARM64 兼容性 Panic 处理 ===");
            debug_error!("系统架构: {}", std::env::consts::ARCH);
            debug_error!("Panic 位置: {}", location);
            debug_error!("Panic 消息: {}", message);
            debug_error!("建议: 请检查 ARM64 兼容性或尝试在 x64 系统上运行");
            debug_error!("================================");

            // 在 ARM64 系统上，尝试优雅地处理 panic 而不是直接崩溃
            // 注意：这里不能阻止程序退出，但可以提供更好的错误信息
        }));
    }
}

/// 应用启动时的共享 setup 逻辑
fn setup_app(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[allow(unused_imports)]
    use tauri::Manager;

    // 初始化 debug_mode 的 AppHandle（必须最先执行）
    debug_mode::set_app_handle(app.handle().clone());

    // 记录 .text 段基线哈希（必须在所有代码修改前尽早调用）
    anti_tamper::init_text_hash();
    anti_tamper::init_runtime_guard();
    anti_tamper::start_runtime_guard();

    // 启动时清理旧版本文件（原子更新产生的遗留文件）
    if let Err(e) = update_manager::cleanup_old_version_files() {
        debug_error!("清理旧版本文件失败: {}", e);
    }

    // 设置窗口关闭事件处理
    if let Err(e) = window_events::setup_app_window_events(app) {
        debug_error!("设置窗口事件处理失败: {}", e);
    }

    Ok(())
}

/// 构建 Tauri 应用的宏，将公共命令注册与版本特定命令合并
/// 使用宏是因为 `tauri::generate_handler!` 是编译期过程宏，命令列表必须是字面 token 序列
macro_rules! build_tauri_app {
    ($($extra_commands:path),* $(,)?) => {{
        tauri::Builder::default()
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_fs::init())
            .plugin(tauri_plugin_http::init())
            .manage(terminal_shell::TerminalSession::new())
            .invoke_handler(tauri::generate_handler![
                // ==================== 公共命令 ====================

                // 文件操作 (20)
                file_operations::load_image_file,
                file_operations::load_vm_memory_image,
                file_operations::load_local_memory_command,
                file_operations::load_image_with_pagefile_command,
                file_operations::select_file_path,
                file_operations::select_folder_path,
                file_operations::is_folder_empty,
                file_operations::get_app_icons,
                file_operations::read_output_directory,
                file_operations::read_warning_directory,
                file_operations::open_path,
                file_operations::get_file_list,
                file_operations::open_file_with_default,
                file_operations::open_folder_and_select,
                file_operations::copy_file_to_clipboard,
                file_operations::delete_file,
                file_operations::write_file,
                file_operations::read_file,
                file_operations::read_text_file_smart,
                file_operations::read_csv_file_embedded,
                file_operations::read_ntfs_file_for_viewer,

                // NTFS 文件树恢复 (2)
                ntfs_file_tree::parse_ntfs_timeline_tree,
                ntfs_file_tree::parse_files_csv_tree,

                // Super Timeline (统一取证时间线)
                super_timeline::build_super_timeline,
                super_timeline::query_super_timeline,
                super_timeline::get_timeline_density,
                super_timeline::get_timeline_statistics,
                // 句柄分析视图 (1)
                handles_viewer::parse_handles_csv,
                // 服务分析视图 (1)
                services_viewer::parse_services_csv,
                // 模块分析视图 (1)
                modules_viewer::parse_modules_csv,
                // 驱动分析视图 (1)
                drivers_viewer::parse_drivers_csv,
                // 进程分析视图 (1)
                process_viewer::parse_process_csv,
                // 网络分析视图 (1)
                net_viewer::parse_net_csv,

                // 设置管理 (15)
                settings::save_settings_command,
                settings::load_settings_command,
                settings::get_settings_command,
                settings::get_settings_path_command,
                settings::reload_settings_command,
                settings_io::export_settings_command,
                settings_io::import_settings_command,
                settings_io::reset_tool_paths_command,
                settings_validator::validate_app_settings_command,
                template_commands::validate_settings_on_startup,
                template_commands::get_app_paths,
                tool_detector::smart_detect_app_paths,
                toolchain_installer::install_toolchain_tool,
                python_env_manager::fix_memprocfs_python_env,
                settings::set_current_image_path_command,
                settings::get_current_image_path_command,
                settings::get_app_settings_command,
                settings::set_area_icon_command,
                settings::get_area_icon_command,
                settings::get_all_area_icons_command,

                // 窗口管理 (15)
                window_manager::minimize_window,
                window_manager::toggle_maximize,
                window_manager::close_window,
                window_manager::open_csv_viewer,
                window_manager::get_csv_files_list,
                window_manager::reload_csv_file,
                window_manager::read_process_csv,
                window_manager::read_vol3_pstree_csv,
                window_manager::read_network_csv,
                window_manager::read_threads_csv,
                window_manager::read_timeline_csv,
                window_manager::open_text_viewer,
                window_manager::open_registry_viewer,
                window_manager::open_file_manager,
                window_manager::open_string_search_window,
                window_manager::open_image_finder_window,
                window_manager::open_stegsolve_analyzer_window,
                window_manager::open_bit_plane_overview_window,
                window_manager::open_super_timeline_window,
                window_manager::open_symbol_manager_window,
                symbol_manager::get_symbol_manager_info,
                symbol_manager::list_memprocfs_symbols,
                symbol_manager::delete_symbol_entry,
                symbol_manager::get_pdb_details,
                kernel_version_index::sync_kernel_version_index,
                kernel_version_index::get_kernel_version_index_info,

                // 主题管理 (2)
                theme_manager::get_theme_settings,
                theme_manager::set_current_theme,

                // 壁纸换肤 (4)
                wallpaper_manager::get_wallpaper_settings,
                wallpaper_manager::set_wallpaper_settings,
                wallpaper_manager::import_wallpaper,
                wallpaper_manager::clear_wallpaper,

                // 告警规则 (3)
                warning_rules::load_warning_rules_command,
                warning_rules::save_warning_rules_command,
                warning_rules::evaluate_warnings_command,

                // 内置告警规则库 (4)
                builtin_warnings::get_builtin_warning_rules,
                builtin_warnings::set_builtin_warnings_global_enabled,
                builtin_warnings::set_builtin_warning_enabled,
                builtin_warnings::copy_builtin_warning_to_external,

                // 内嵌表格取证动作（不读取用户目录中的外部配置）
                embedded_forensic_actions::execute_embedded_forensic_action,
                builtin_csv_plugins::get_builtin_csv_plugins,

                // 自定义工具
                plugin_system::load_custom_tools,
                plugin_system::save_custom_tools,
                plugin_system::add_custom_tool,
                plugin_system::update_custom_tool,
                plugin_system::delete_custom_tool,
                plugin_system::execute_custom_tool,

                // AI Providers (9)
                ai_providers::load_ai_providers,
                ai_providers::add_ai_provider,
                ai_providers::update_ai_provider,
                ai_providers::delete_ai_provider,
                ai_providers::set_current_ai_provider,
                ai_providers::get_current_ai_provider,
                ai_providers::toggle_ai_provider,
                ai_providers::test_ai_connection,
                ai_providers::fetch_ai_models,

                // 终端 (4)
                terminal_shell::execute_simple_terminal_command,
                terminal_shell::init_shell,
                terminal_shell::write_to_shell,
                terminal_shell::resize_terminal,

                // 内存镜像加载 (9)
                memory_commands::load_memory_image,
                memory_commands::load_remote_memory_image,
                memory_commands::check_memprocfs_status,
                memory_commands::stop_memprocfs,
                memory_commands::stop_memprocfs_and_clear_output,
                memory_commands::clear_output_directory,
                memory_commands::check_m_drive_available,
                memory_commands::copy_forensic_files_retry,
                process_manager::force_cleanup_and_clear,

                // MemNixFS Linux 内存加载 (5)
                memnixfs_commands::load_linux_memory_image,
                memnixfs_commands::check_memnixfs_status,
                memnixfs_commands::stop_memnixfs,
                memnixfs_commands::stop_memnixfs_and_clear_output,
                memnixfs_commands::export_key_forensic_reports,
                memnixfs_commands::detect_memory_image_os,

                // 进程管理 (2)
                process_manager::get_monitored_processes,
                process_manager::kill_process_by_pid,

                // Volatility2 (7)
                volatility2_commands::execute_volatility2,
                volatility2_commands::get_volatility2_plugins,
                volatility2_commands::get_volatility2_profiles,
                volatility2_commands::json_to_csv_command,
                volatility2_commands::create_volatility2_output_dir,
                volatility2_commands::save_volatility2_profile,
                volatility2_commands::retry_profile_detection,

                // Volatility3 (8)
                volatility3_commands::execute_volatility3,
                volatility3_commands::execute_vol3_dump_hives,
                volatility3_commands::cancel_volatility3,
                volatility3_commands::get_volatility3_plugins,
                volatility3_commands::get_volatility3_version,
                volatility3_commands::check_volatility3_environment,
                volatility3_commands::create_volatility3_output_dir,
                volatility3_commands::dump_files_by_offset,

                // Volatility 插件结果缓存 (2)
                vol_cache::clear_vol_cache,
                vol_cache::get_vol_cache_stats,

                // SQLite 查看器 (3)
                sqlite_viewer::open_sqlite_viewer_window,
                sqlite_viewer::sqlite_list_tables,
                sqlite_viewer::sqlite_query,

                // Hex 查看器 (2)
                hex_reader::read_file_bytes_range,
                hex_reader::open_hex_viewer_window,

                // IOC 提取 (3)
                ioc_extractor::extract_ioc_from_text,
                ioc_extractor::extract_ioc_from_file,
                ioc_extractor::open_ioc_extractor_window,

                // 注册表取证 (2)
                registry_forensics::analyze_registry_csv,
                registry_forensics::open_registry_forensics_window,

                // Vol3Linux (5)
                vol3linux_commands::execute_vol3linux,
                vol3linux_commands::get_vol3linux_plugins,
                vol3linux_commands::get_vol3linux_version,
                vol3linux_commands::check_vol3linux_environment,
                vol3linux_commands::create_vol3linux_output_dir,

                // 网络工具 (2)
                network_utils::check_remote_version,
                network_utils::get_public_ip,

                // Python 包管理 (1)

                // 自动更新 (11)
                update_manager::check_for_updates_command,
                update_manager::download_update_command,
                update_manager::execute_update_command,
                update_manager::cancel_update_command,
                update_manager::rollback_update_command,
                update_manager::cleanup_update_files_command,
                update_manager::get_update_status,
                update_manager::get_update_progress,
                update_manager::get_update_logs,
                update_manager::clear_update_logs,
                update_manager::write_update_error_log_command,
                memprocfs_update::check_and_update_memprocfs_command,

                // 窗口事件 (3)
                window_events::exit_application,
                window_events::restart_application,

                // 工具提示规则 (5)
                tooltip_rules::get_cell_tooltip,
                tooltip_rules::save_tooltip_rules,
                tooltip_rules::delete_tooltip_rules,
                tooltip_rules::get_all_tooltip_rules,
                tooltip_rules::create_example_tooltip_rules,

                // 注册表解析 (3)
                registry_parser::parse_registry_hive,
                registry_parser::init_registry_hive,
                registry_parser::load_registry_key,

                // Registry Browser (7)
                registry_browser::read_registry_directory,
                registry_browser::read_registry_values,
                registry_browser::check_registry_path,
                registry_browser::read_registry_value_detail,
                registry_browser::search_registry,
                registry_browser::search_registry_with_progress,
                registry_browser::cancel_registry_search,

                // 字符串搜索 (6)
                string_search::execute_string_search,
                string_search::execute_string_search_with_progress,
                string_search::stop_string_search,
                string_search::get_default_string_search_config,
                string_search::validate_string_search_config,
                string_search::read_memory_bytes,

                // YARA 扫描 (3)
                yara_scanner::yara_scan,
                yara_scanner::yara_validate_rules,
                yara_scanner::yara_stop_scan,

                // EVTX 解析 (2)
                evtx_parser::parse_evtx_file_command,
                evtx_parser::list_evtx_files,

                // PE 文件解析 (1)
                pe_parser::parse_pe_file_command,

                // EXIF 读取 (5)
                exif_reader::read_exif_data,
                exif_reader::read_file_bytes,
                exif_reader::get_file_info,
                exif_reader::save_text_file,
                exif_reader::save_binary_data,

                // Debug 模式 (3)
                debug_mode::get_debug_mode_status,
                debug_mode::print_debug_info,
                debug_mode::get_debug_log_path,

                // MCP Server (3)
                mcp_manager::start_mcp_server,
                mcp_manager::stop_mcp_server,
                mcp_manager::check_mcp_server_status,

                // 模块统计 (1)
                module_stats::get_module_stats_by_pid,

                // Dokan 环境检测 (1)
                dokan_manager::check_dokan_status,

                // WinFsp 环境检测 (2)
                winfsp_manager::check_winfsp_status,
                winfsp_manager::check_winfsp_environment,

                // 内存图像可视化 - PixelWeaver (7)
                pixel_weaver::commands::process_raw_image,
                pixel_weaver::commands::get_supported_formats,
                pixel_weaver::commands::validate_parameters,
                pixel_weaver::commands::analyze_entropy,
                pixel_weaver::commands::fetch_entropy_page,
                volatility3_commands::dump_process_memory,
                window_manager::open_memory_image_visualizer_window,

                // ==================== 版本特定命令 ====================
                $($extra_commands,)*
            ])
            .setup(|app| setup_app(app))
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }}
}

// ==================== 应用入口点 ====================

/// 应用入口点
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    debug_mode::init_debug_mode();
    setup_arm64_panic_hook();

    build_tauri_app!(
        // === 开发版本额外命令 ===
        // 文件操作（额外 9 个）
        file_operations::get_file_hexdump,
        file_operations::copy_file,
        file_operations::copy_directory_recursive,
        file_operations::calculate_file_hashes,
        file_operations::rename_file,
        file_operations::get_image_info,
        file_operations::read_image_as_base64,
        file_operations::detect_multiple_images,
        file_operations::scan_qr_code,
        // 新版命令执行器
        command_executor::execute_plugin_command,
        command_executor::execute_terminal_command,
        command_executor::execute_python_script,
        command_executor::get_python_scripts,
        // 新版工具管理
        tools_manager::load_tools_json,
        tools_manager::save_tools_json,
        tools_manager::execute_tool_command_tauri,
        template_commands::trigger_main_feature,
        template_commands::get_file_to_feature_mapping,
        template_commands::read_template_directory,
        template_commands::read_template_file,
        // AI V2 (替代旧版 ai_chat)
        ai_v2::get_available_tools_v2,
        ai_v2::get_available_agents,
        ai_v2::execute_tool_v2,
        ai_v2::call_ai_agent_v2,
        ai_v2::cancel_agent_v2,
        ai_v2::call_ai_api_stream_v2,
        ai_v2::save_chat_history_v2,
        ai_v2::load_chat_history_v2,
        ai_v2::list_directory_files_v2,
        ai_v2::read_file_content_v2,
        ai_v2::search_in_file_v2,
        ai_v2::confirm_execute_code,
        // 新版脚本管理
        script_commands::get_scripts,
        script_commands::add_script,
        script_commands::update_script,
        script_commands::delete_script,
        script_commands::execute_script,
        script_commands::get_script_status,
        script_commands::get_all_script_status,
        script_commands::execute_all_enabled_scripts,
        script_commands::get_script_variables,
        // 日志管理
        log_manager::write_frontend_log,
        log_manager::get_log_files,
        log_manager::read_log_file,
        log_manager::clear_log_file,
        log_manager::clear_all_logs,
        // 字符串搜索（额外 2 个）
        string_search::execute_string_search_paginated,
        string_search::read_file_range,
        // Image Finder
        image_finder::start_image_extraction,
        image_finder::get_image_finder_config,
        image_finder::stop_image_extraction,
        // pypykatz 凭据提取
        pypykatz_extract::extract_credentials,
        pypykatz_extract::check_pypykatz_installed,
        pypykatz_extract::repair_pypykatz,
        // Markdown 管理
        markdown_manager::save_markdown_file,
        markdown_manager::read_markdown_file,
        markdown_manager::list_markdown_files,
        markdown_manager::delete_markdown_file,
        markdown_manager::rename_markdown_file,
        markdown_manager::get_markdown_save_path_string,
        markdown_manager::set_markdown_save_path,
        markdown_manager::create_markdown_file,
        markdown_manager::markdown_file_exists,
        markdown_manager::list_directory_entries,
        markdown_manager::create_directory,
        markdown_manager::delete_directory,
        markdown_manager::write_file_directly,
        // 插件系统（文件浏览器插件）
        plugin_system::load_file_browser_plugins,
        plugin_system::save_file_browser_plugins,
        plugin_system::add_file_browser_plugin,
        plugin_system::update_file_browser_plugin,
        plugin_system::delete_file_browser_plugin,
        plugin_system::execute_file_browser_plugin
    );
}

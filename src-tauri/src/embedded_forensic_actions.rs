//! 内嵌的进程 / 文件取证右键动作。
//!
//! 前端只提交动作 ID 和表格上下文。这里按固定 ID 分派参数化操作，
//! 不读取或执行用户目录中的外部命令文本。

use crate::settings;
use crate::types::{AppSettings, CsvPluginContext, CsvPluginResult};
use std::path::{Path, PathBuf};
use std::process::ExitStatus;
use tokio::process::Command;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum EmbeddedAction {
    DumpMemmapVol2,
    DumpMemmapVol3,
    ProcDumpVol2,
    ProcDumpVol3,
    DumpFilesVol3,
    DumpFilesVol2,
    ProcModules,
    ProcAllFiles,
    ProcPrivileges,
    ProcCmdlineVol3,
    ProcEnvarsVol3,
}

impl EmbeddedAction {
    #[cfg(test)]
    const ALL: [Self; 11] = [
        Self::DumpMemmapVol2,
        Self::DumpMemmapVol3,
        Self::ProcDumpVol2,
        Self::ProcDumpVol3,
        Self::DumpFilesVol3,
        Self::DumpFilesVol2,
        Self::ProcModules,
        Self::ProcAllFiles,
        Self::ProcPrivileges,
        Self::ProcCmdlineVol3,
        Self::ProcEnvarsVol3,
    ];

    fn from_id(id: &str) -> Option<Self> {
        match id {
            "builtin_dump_memmap_vol2" => Some(Self::DumpMemmapVol2),
            "builtin_dump_memmap_vol3" => Some(Self::DumpMemmapVol3),
            "builtin_procdump_vol2" => Some(Self::ProcDumpVol2),
            "builtin_procdump_vol3" => Some(Self::ProcDumpVol3),
            "builtin_dumpfiles_vol3" => Some(Self::DumpFilesVol3),
            "builtin_dumpfiles_vol2" => Some(Self::DumpFilesVol2),
            "builtin_proc_dll" => Some(Self::ProcModules),
            "builtin_proc_allfiles" => Some(Self::ProcAllFiles),
            "builtin_proc_privileges" => Some(Self::ProcPrivileges),
            "builtin_proc_cmdline_vol3" => Some(Self::ProcCmdlineVol3),
            "builtin_proc_envars_vol3" => Some(Self::ProcEnvarsVol3),
            _ => None,
        }
    }

    fn id(self) -> &'static str {
        match self {
            Self::DumpMemmapVol2 => "builtin_dump_memmap_vol2",
            Self::DumpMemmapVol3 => "builtin_dump_memmap_vol3",
            Self::ProcDumpVol2 => "builtin_procdump_vol2",
            Self::ProcDumpVol3 => "builtin_procdump_vol3",
            Self::DumpFilesVol3 => "builtin_dumpfiles_vol3",
            Self::DumpFilesVol2 => "builtin_dumpfiles_vol2",
            Self::ProcModules => "builtin_proc_dll",
            Self::ProcAllFiles => "builtin_proc_allfiles",
            Self::ProcPrivileges => "builtin_proc_privileges",
            Self::ProcCmdlineVol3 => "builtin_proc_cmdline_vol3",
            Self::ProcEnvarsVol3 => "builtin_proc_envars_vol3",
        }
    }

    fn accepts_column(self, column: &str) -> bool {
        match self {
            Self::DumpFilesVol3 => column.eq_ignore_ascii_case("Offset"),
            Self::DumpFilesVol2 => column.eq_ignore_ascii_case("Offset(P)"),
            Self::ProcPrivileges => {
                column.eq_ignore_ascii_case("PID") || column.eq_ignore_ascii_case("PPID")
            }
            _ => column.eq_ignore_ascii_case("PID"),
        }
    }

    fn uses_offset(self) -> bool {
        matches!(self, Self::DumpFilesVol2 | Self::DumpFilesVol3)
    }
}

#[derive(Debug, Eq, PartialEq)]
enum ValidatedCell {
    Pid(u32),
    Offset(String),
}

struct ProcessOutput {
    status: ExitStatus,
    stdout: String,
    stderr: String,
}

/// 执行内嵌取证动作。命令和参数由后端固定分派，前端无法传入命令文本。
#[tauri::command]
pub async fn execute_embedded_forensic_action(
    plugin_id: String,
    context: CsvPluginContext,
    app_handle: tauri::AppHandle,
) -> Result<CsvPluginResult, String> {
    let action = EmbeddedAction::from_id(&plugin_id)
        .ok_or_else(|| format!("未知的内嵌取证动作: {}", plugin_id))?;
    let value = validate_context(action, &context)?;
    let app_settings = settings::load_settings()?;
    let output_dir = ensure_output_dir(&app_settings).await?;

    match (action, value) {
        (EmbeddedAction::DumpMemmapVol3, ValidatedCell::Pid(pid)) => {
            run_vol3_memmap(action, pid, &app_settings, &output_dir, app_handle).await
        }
        (EmbeddedAction::DumpFilesVol3, ValidatedCell::Offset(offset)) => {
            run_vol3_dumpfiles(action, offset, &app_settings, &output_dir, app_handle).await
        }
        (
            EmbeddedAction::DumpMemmapVol2
            | EmbeddedAction::ProcDumpVol2
            | EmbeddedAction::DumpFilesVol2,
            value,
        ) => run_vol2(action, value, &app_settings, &output_dir).await,
        (
            EmbeddedAction::ProcDumpVol3
            | EmbeddedAction::ProcCmdlineVol3
            | EmbeddedAction::ProcEnvarsVol3,
            ValidatedCell::Pid(pid),
        ) => run_vol3_process_action(action, pid, &app_settings, &output_dir).await,
        (
            EmbeddedAction::ProcModules
            | EmbeddedAction::ProcAllFiles
            | EmbeddedAction::ProcPrivileges,
            ValidatedCell::Pid(pid),
        ) => run_memprocfs_action(action, pid, &app_settings, &output_dir).await,
        _ => Err("内嵌取证动作与单元格类型不匹配".to_string()),
    }
}

fn validate_context(
    action: EmbeddedAction,
    context: &CsvPluginContext,
) -> Result<ValidatedCell, String> {
    let column = context.selected_column.trim();
    if !action.accepts_column(column) {
        return Err(format!(
            "动作 {} 不适用于列 {}",
            action.id(),
            context.selected_column
        ));
    }

    if action.uses_offset() {
        parse_offset(&context.selected_cell).map(ValidatedCell::Offset)
    } else {
        parse_pid(&context.selected_cell).map(ValidatedCell::Pid)
    }
}

fn parse_pid(raw: &str) -> Result<u32, String> {
    let value = raw.trim();
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("PID/PPID 必须是 0 到 4294967295 之间的十进制整数".to_string());
    }
    value
        .parse::<u32>()
        .map_err(|_| "PID/PPID 必须是 0 到 4294967295 之间的十进制整数".to_string())
}

fn parse_offset(raw: &str) -> Result<String, String> {
    let value = raw.trim();
    let number = if let Some(hex) = value
        .strip_prefix("0x")
        .or_else(|| value.strip_prefix("0X"))
    {
        if hex.is_empty() || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(offset_error());
        }
        u64::from_str_radix(hex, 16).map_err(|_| offset_error())?
    } else {
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(offset_error());
        }
        value.parse::<u64>().map_err(|_| offset_error())?
    };

    Ok(format!("0x{:x}", number))
}

fn offset_error() -> String {
    "文件偏移必须是 u64 范围内的十进制整数或 0x 开头的十六进制整数".to_string()
}

async fn ensure_output_dir(app_settings: &AppSettings) -> Result<PathBuf, String> {
    let raw = required_setting(&app_settings.output_path, "输出目录")?;
    let output_dir = PathBuf::from(raw);
    tokio::fs::create_dir_all(&output_dir)
        .await
        .map_err(|error| format!("创建输出目录失败 {}: {}", output_dir.display(), error))?;
    Ok(output_dir)
}

fn required_setting<'a>(value: &'a str, label: &str) -> Result<&'a str, String> {
    let value = value.trim();
    if value.is_empty() {
        Err(format!("未配置{}", label))
    } else {
        Ok(value)
    }
}

async fn run_vol3_memmap(
    action: EmbeddedAction,
    pid: u32,
    app_settings: &AppSettings,
    output_dir: &Path,
    app_handle: tauri::AppHandle,
) -> Result<CsvPluginResult, String> {
    let config = volatility3_config(app_settings)?;
    let output_dir = output_dir.to_string_lossy().into_owned();
    match crate::volatility3::dump_process_memory_command(
        &config,
        pid,
        false,
        &output_dir,
        Some(app_handle),
    )
    .await
    {
        Ok(path) => Ok(success_result(
            action,
            format!("进程 {} 内存已导出到 {}", pid, path),
            Some(PathBuf::from(path)),
            false,
        )),
        Err(error) => Ok(failure_result(action, error)),
    }
}

async fn run_vol3_dumpfiles(
    action: EmbeddedAction,
    offset: String,
    app_settings: &AppSettings,
    output_dir: &Path,
    app_handle: tauri::AppHandle,
) -> Result<CsvPluginResult, String> {
    let config = volatility3_config(app_settings)?;
    let output_dir = output_dir.to_string_lossy().into_owned();
    match crate::volatility3::dump_files_by_offset_command(
        &config,
        &offset,
        None,
        false,
        &output_dir,
        Some(app_handle),
    )
    .await
    {
        Ok(paths) => {
            let output = format!(
                "偏移 {} 已导出 {} 个文件:\n{}",
                offset,
                paths.len(),
                paths.join("\n")
            );
            Ok(success_result(action, output, None, false))
        }
        Err(error) => Ok(failure_result(action, error)),
    }
}

fn volatility3_config(
    app_settings: &AppSettings,
) -> Result<crate::volatility3::Volatility3Config, String> {
    Ok(crate::volatility3::Volatility3Config {
        python_path: required_setting(&app_settings.python3_path, "Python 3 路径")?.to_string(),
        volatility3_path: required_setting(&app_settings.volatility3_path, "Volatility 3 路径")?
            .to_string(),
        image_path: required_setting(&app_settings.current_image_path, "当前内存镜像路径")?
            .to_string(),
    })
}

async fn run_vol2(
    action: EmbeddedAction,
    value: ValidatedCell,
    app_settings: &AppSettings,
    output_dir: &Path,
) -> Result<CsvPluginResult, String> {
    let python = required_setting(&app_settings.python2_path, "Python 2 路径")?;
    let volatility = required_setting(&app_settings.volatility2_path, "Volatility 2 路径")?;
    let image = required_setting(&app_settings.current_image_path, "当前内存镜像路径")?;
    let profile = required_setting(&app_settings.volatility2_profile, "Volatility 2 Profile")?;
    let output = output_dir.to_string_lossy().into_owned();

    let mut args = vec![
        volatility.to_string(),
        "-f".to_string(),
        image.to_string(),
        format!("--profile={}", profile),
    ];
    match (action, value) {
        (EmbeddedAction::DumpMemmapVol2, ValidatedCell::Pid(pid)) => {
            args.extend([
                "memdump".to_string(),
                "-p".to_string(),
                pid.to_string(),
                format!("--dump-dir={}", output),
            ]);
        }
        (EmbeddedAction::ProcDumpVol2, ValidatedCell::Pid(pid)) => {
            args.extend([
                "procdump".to_string(),
                "-p".to_string(),
                pid.to_string(),
                format!("--dump-dir={}", output),
            ]);
        }
        (EmbeddedAction::DumpFilesVol2, ValidatedCell::Offset(offset)) => {
            args.extend([
                "dumpfiles".to_string(),
                "-Q".to_string(),
                offset,
                "-D".to_string(),
                output,
            ]);
        }
        _ => return Err("Volatility 2 动作参数不匹配".to_string()),
    }

    let process = run_process(python, &args).await?;
    Ok(process_result(action, process, output_dir, false))
}

async fn run_vol3_process_action(
    action: EmbeddedAction,
    pid: u32,
    app_settings: &AppSettings,
    output_dir: &Path,
) -> Result<CsvPluginResult, String> {
    let python = required_setting(&app_settings.python3_path, "Python 3 路径")?;
    let volatility = required_setting(&app_settings.volatility3_path, "Volatility 3 路径")?;
    let image = required_setting(&app_settings.current_image_path, "当前内存镜像路径")?;

    let (plugin, dump) = match action {
        EmbeddedAction::ProcDumpVol3 => ("windows.pslist.PsList", true),
        EmbeddedAction::ProcCmdlineVol3 => ("windows.cmdline.CmdLine", false),
        EmbeddedAction::ProcEnvarsVol3 => ("windows.envars.Envars", false),
        _ => return Err("Volatility 3 动作参数不匹配".to_string()),
    };

    let mut args = vec![
        volatility.to_string(),
        "-f".to_string(),
        image.to_string(),
        "-o".to_string(),
        output_dir.to_string_lossy().into_owned(),
        plugin.to_string(),
        "--pid".to_string(),
        pid.to_string(),
    ];
    if dump {
        args.push("--dump".to_string());
    }

    let process = run_process(python, &args).await?;
    Ok(process_result(action, process, output_dir, false))
}

async fn run_memprocfs_action(
    action: EmbeddedAction,
    pid: u32,
    app_settings: &AppSettings,
    output_dir: &Path,
) -> Result<CsvPluginResult, String> {
    let drive = settings::sanitize_drive_letter(&app_settings.mount_drive_letter);
    let process_root = PathBuf::from(format!("{}:\\", drive))
        .join("pid")
        .join(pid.to_string());

    match action {
        EmbeddedAction::ProcModules => {
            copy_memprocfs_file(
                action,
                &process_root.join("modules").join("modules.txt"),
                &output_dir.join(format!("PID_{}_modules.txt", pid)),
            )
            .await
        }
        EmbeddedAction::ProcPrivileges => {
            copy_memprocfs_file(
                action,
                &process_root.join("token").join("privileges.txt"),
                &output_dir.join(format!("{}_privileges.txt", pid)),
            )
            .await
        }
        EmbeddedAction::ProcAllFiles => {
            let source = process_root.join("files");
            let metadata = tokio::fs::metadata(&source).await.map_err(|error| {
                format!(
                    "MemProcFS 进程文件目录不可用 {}: {}",
                    source.display(),
                    error
                )
            })?;
            if !metadata.is_dir() {
                return Err(format!("MemProcFS 路径不是目录: {}", source.display()));
            }

            let destination = output_dir.join(format!("allfile_{}", pid));
            let args = vec![
                source.to_string_lossy().into_owned(),
                destination.to_string_lossy().into_owned(),
                "/E".to_string(),
                "/NFL".to_string(),
                "/NDL".to_string(),
                "/NJH".to_string(),
                "/NJS".to_string(),
            ];
            let process = run_process("robocopy", &args).await?;
            let succeeded = robocopy_exit_is_success(process.status.code());
            let output = render_process_output(&process, succeeded);
            if succeeded {
                Ok(success_result(
                    action,
                    format!("进程文件已导出到 {}\n{}", destination.display(), output),
                    Some(destination),
                    true,
                ))
            } else {
                Ok(failure_result(action, output))
            }
        }
        _ => Err("MemProcFS 动作参数不匹配".to_string()),
    }
}

async fn copy_memprocfs_file(
    action: EmbeddedAction,
    source: &Path,
    destination: &Path,
) -> Result<CsvPluginResult, String> {
    let metadata = tokio::fs::metadata(source)
        .await
        .map_err(|error| format!("MemProcFS 文件不可用 {}: {}", source.display(), error))?;
    if !metadata.is_file() {
        return Err(format!("MemProcFS 路径不是文件: {}", source.display()));
    }

    let copied = tokio::fs::copy(source, destination)
        .await
        .map_err(|error| format!("复制 {} 失败: {}", source.display(), error))?;
    Ok(success_result(
        action,
        format!("已复制 {} 字节到 {}", copied, destination.display()),
        Some(destination.to_path_buf()),
        true,
    ))
}

async fn run_process(program: &str, args: &[String]) -> Result<ProcessOutput, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .kill_on_drop(true)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1");

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }

    let output = command
        .output()
        .await
        .map_err(|error| format!("启动 {} 失败: {}", program, error))?;
    Ok(ProcessOutput {
        status: output.status,
        stdout: decode_output(&output.stdout),
        stderr: decode_output(&output.stderr),
    })
}

fn decode_output(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => {
            #[cfg(target_os = "windows")]
            {
                let (decoded, _, _) = encoding_rs::GBK.decode(bytes);
                return decoded.into_owned();
            }
            #[cfg(not(target_os = "windows"))]
            {
                String::from_utf8_lossy(bytes).into_owned()
            }
        }
    }
}

fn process_result(
    action: EmbeddedAction,
    process: ProcessOutput,
    output_dir: &Path,
    should_open: bool,
) -> CsvPluginResult {
    let succeeded = process.status.success();
    let output = render_process_output(&process, succeeded);
    if succeeded {
        success_result(
            action,
            format!("输出目录: {}\n{}", output_dir.display(), output),
            None,
            should_open,
        )
    } else {
        failure_result(action, output)
    }
}

fn render_process_output(process: &ProcessOutput, succeeded: bool) -> String {
    let mut parts = Vec::new();
    if !process.stdout.trim().is_empty() {
        parts.push(process.stdout.trim().to_string());
    }
    if !process.stderr.trim().is_empty() {
        parts.push(format!("stderr:\n{}", process.stderr.trim()));
    }
    if parts.is_empty() {
        parts.push(if succeeded {
            "操作执行成功".to_string()
        } else {
            "操作执行失败".to_string()
        });
    }
    if !succeeded {
        parts.insert(
            0,
            format!(
                "进程退出码: {}",
                process
                    .status
                    .code()
                    .map(|code| code.to_string())
                    .unwrap_or_else(|| "不可用".to_string())
            ),
        );
    }
    parts.join("\n")
}

fn success_result(
    action: EmbeddedAction,
    output: String,
    output_file: Option<PathBuf>,
    should_open_file: bool,
) -> CsvPluginResult {
    let output_file_type = output_file.as_ref().and_then(|path| {
        if path.is_dir() {
            Some("directory".to_string())
        } else {
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(|extension| extension.to_ascii_lowercase())
        }
    });
    CsvPluginResult {
        success: true,
        output,
        output_file: output_file.map(|path| path.to_string_lossy().into_owned()),
        output_file_type,
        should_open_file,
        executed_command: Some(format!("embedded:{}", action.id())),
    }
}

fn failure_result(action: EmbeddedAction, output: String) -> CsvPluginResult {
    CsvPluginResult {
        success: false,
        output,
        output_file: None,
        output_file_type: None,
        should_open_file: false,
        executed_command: Some(format!("embedded:{}", action.id())),
    }
}

fn robocopy_exit_is_success(code: Option<i32>) -> bool {
    matches!(code, Some(0..=7))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn context(column: &str, value: &str) -> CsvPluginContext {
        CsvPluginContext {
            selected_file: String::new(),
            selected_row: 0,
            selected_cell: value.to_string(),
            selected_column: column.to_string(),
            all_selected_cells: value.to_string(),
        }
    }

    #[test]
    fn dispatcher_matches_the_eleven_embedded_plugin_ids() {
        let embedded_ids: HashSet<String> = crate::builtin_csv_plugins::all_builtin_csv_plugins()
            .into_iter()
            .map(|plugin| plugin.id)
            .collect();
        let dispatcher_ids: HashSet<String> = EmbeddedAction::ALL
            .into_iter()
            .map(|action| action.id().to_string())
            .collect();

        assert_eq!(dispatcher_ids.len(), 11);
        assert_eq!(dispatcher_ids, embedded_ids);
        assert!(EmbeddedAction::from_id("builtin_unknown").is_none());
    }

    #[test]
    fn pid_validation_is_decimal_and_bounded() {
        let action = EmbeddedAction::ProcDumpVol3;
        assert_eq!(
            validate_context(action, &context("PID", "4294967295")),
            Ok(ValidatedCell::Pid(u32::MAX))
        );

        for invalid in ["", "-1", "+1", "0x10", "4294967296", "12 & whoami"] {
            assert!(
                validate_context(action, &context("PID", invalid)).is_err(),
                "应拒绝 PID: {}",
                invalid
            );
        }
        assert!(validate_context(action, &context("Name", "1234")).is_err());
    }

    #[test]
    fn offset_validation_is_numeric_and_bounded() {
        let vol3 = EmbeddedAction::DumpFilesVol3;
        assert_eq!(
            validate_context(vol3, &context("Offset", "0X00001a2B")),
            Ok(ValidatedCell::Offset("0x1a2b".to_string()))
        );
        assert_eq!(
            validate_context(vol3, &context("Offset", "4096")),
            Ok(ValidatedCell::Offset("0x1000".to_string()))
        );

        for invalid in ["", "0x", "-1", "18446744073709551616", "0x100 | whoami"] {
            assert!(
                validate_context(vol3, &context("Offset", invalid)).is_err(),
                "应拒绝偏移: {}",
                invalid
            );
        }
        assert!(validate_context(vol3, &context("Offset(P)", "4096")).is_err());
        assert!(
            validate_context(EmbeddedAction::DumpFilesVol2, &context("Offset(P)", "4096")).is_ok()
        );
    }

    #[test]
    fn privileges_accepts_pid_and_ppid_only() {
        let action = EmbeddedAction::ProcPrivileges;
        assert!(validate_context(action, &context("PID", "4")).is_ok());
        assert!(validate_context(action, &context("PPID", "4")).is_ok());
        assert!(validate_context(action, &context("Offset", "4")).is_err());
    }

    #[test]
    fn robocopy_codes_zero_through_seven_are_success() {
        for code in 0..=7 {
            assert!(robocopy_exit_is_success(Some(code)));
        }
        assert!(!robocopy_exit_is_success(Some(8)));
        assert!(!robocopy_exit_is_success(Some(16)));
        assert!(!robocopy_exit_is_success(None));
    }
}

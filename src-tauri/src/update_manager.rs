use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri_plugin_http::reqwest;

/// 更新信息结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub version: String,
    pub changelog_url: String,
    pub download_url: String,
    pub file_hash: Option<String>,
    pub file_size: Option<u64>,
    pub release_date: Option<String>,
    pub is_critical: Option<bool>,
}

/// 更新进度信息
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateProgress {
    pub stage: String,         // 当前阶段：checking, downloading, verifying, installing
    pub progress: f64,         // 进度百分比 0-100
    pub message: String,       // 状态消息
    pub downloaded_bytes: u64, // 已下载字节数
    pub total_bytes: u64,      // 总字节数
    pub error: Option<String>, // 错误信息
}

/// 更新调试日志条目
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateLogEntry {
    pub timestamp: String,
    pub level: String, // INFO, WARN, ERROR, DEBUG
    pub event: String,
    pub message: String,
    pub details: Option<String>,
}

/// 更新状态
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum UpdateStatus {
    Idle,                  // 空闲状态
    Checking,              // 检查更新中
    Available(UpdateInfo), // 有可用更新
    Downloading,           // 下载中
    Downloaded,            // 下载完成
    Installing,            // 安装中
    Completed,             // 更新完成
    Failed(String),        // 更新失败
}

/// 全局更新状态
static UPDATE_STATUS: Mutex<UpdateStatus> = Mutex::new(UpdateStatus::Idle);
static UPDATE_PROGRESS: Mutex<Option<UpdateProgress>> = Mutex::new(None);
static UPDATE_LOGS: Mutex<Vec<UpdateLogEntry>> = Mutex::new(Vec::new());

/// 更新管理器
pub struct UpdateManager {
    update_url: String,
}

impl UpdateManager {
    pub fn new(update_url: String) -> Self {
        Self { update_url }
    }

    /// 检查更新
    pub async fn check_for_updates(
        &mut self,
        current_version: &str,
    ) -> Result<Option<UpdateInfo>, String> {
        log_update_event("CHECK_START", &format!("当前版本: {}", current_version));

        // 验证更新URL安全性
        validate_url(&self.update_url)?;

        // 更新状态
        self.set_status(UpdateStatus::Checking);
        self.set_progress(UpdateProgress {
            stage: "checking".to_string(),
            progress: 0.0,
            message: "正在检查更新...".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            error: None,
        });

        // 创建安全的HTTP客户端
        let client = create_secure_client()?;

        // 发送HTTP请求获取更新信息
        let response = client.get(&self.update_url).send().await.map_err(|e| {
            let error = format!("网络请求失败: {}", e);
            log_update_event("CHECK_FAILED", &error);
            write_error_log("检查更新失败", &error);
            error
        })?;

        if !response.status().is_success() {
            let error = format!("HTTP请求失败，状态码: {}", response.status());
            log_update_event("CHECK_FAILED", &error);
            write_error_log("检查更新失败", &error);
            self.set_status(UpdateStatus::Failed(error.clone()));
            return Err(error);
        }

        let content = response
            .text()
            .await
            .map_err(|e| format!("读取响应内容失败: {}", e))?;

        log_update_event(
            "CHECK_RESPONSE",
            &format!("响应长度: {} 字符", content.len()),
        );

        // 解析更新信息
        let update_info: UpdateInfo = serde_json::from_str(&content).map_err(|e| {
            let error = format!("解析更新信息失败: {}", e);
            log_update_event("CHECK_FAILED", &error);
            write_error_log("检查更新失败", &error);
            error
        })?;

        // 验证下载URL安全性
        validate_url(&update_info.download_url)?;

        // 比较版本
        if self.is_newer_version(current_version, &update_info.version) {
            log_update_event(
                "UPDATE_AVAILABLE",
                &format!("{} -> {}", current_version, update_info.version),
            );
            self.set_status(UpdateStatus::Available(update_info.clone()));
            Ok(Some(update_info))
        } else {
            log_update_event("UP_TO_DATE", current_version);
            self.set_status(UpdateStatus::Idle);
            Ok(None)
        }
    }

    /// 下载更新文件
    pub async fn download_update(&mut self, update_info: &UpdateInfo) -> Result<PathBuf, String> {
        log_update_event("DOWNLOAD_START", &update_info.download_url);

        // 验证下载URL安全性
        validate_url(&update_info.download_url)?;

        // 获取软件运行目录
        let app_dir = std::env::current_exe()
            .map_err(|e| format!("获取应用程序路径失败: {}", e))?
            .parent()
            .ok_or("无法获取应用程序目录")?
            .to_path_buf();

        // 在软件运行目录下创建 temp 文件夹
        let temp_base_dir = app_dir.join("temp");
        if !temp_base_dir.exists() {
            std::fs::create_dir_all(&temp_base_dir).map_err(|e| {
                let error = format!("创建临时目录失败: {}", e);
                log_update_event("DOWNLOAD_FAILED", &error);
                write_error_log("下载更新失败", &error);
                error
            })?;
        }

        // 在 temp 目录下创建带时间戳的子目录
        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let temp_dir_path = temp_base_dir.join(format!("update_{}", timestamp));

        std::fs::create_dir_all(&temp_dir_path).map_err(|e| {
            let error = format!("创建更新临时目录失败: {}", e);
            log_update_event("DOWNLOAD_FAILED", &error);
            write_error_log("下载更新失败", &error);
            error
        })?;

        debug_info!("📁 更新文件下载目录: {}", temp_dir_path.display());
        log_update_event("TEMP_DIR_CREATED", &temp_dir_path.to_string_lossy());

        let temp_dir = &temp_dir_path;

        // 检查磁盘空间
        if let Some(file_size) = update_info.file_size {
            check_disk_space(file_size, temp_dir)?;
        }

        // 更新状态
        self.set_status(UpdateStatus::Downloading);

        // 获取文件名
        let filename = update_info
            .download_url
            .split('/')
            .last()
            .unwrap_or("update.exe")
            .to_string();

        let file_path = temp_dir.join(&filename);

        // 创建安全的HTTP客户端
        let client = create_secure_client()?;

        // 发送HTTP请求下载文件
        let response = client
            .get(&update_info.download_url)
            .timeout(std::time::Duration::from_secs(600)) // 10分钟超时
            .send()
            .await
            .map_err(|e| {
                let error = format!("下载请求失败: {}", e);
                log_update_event("DOWNLOAD_FAILED", &error);
                write_error_log("下载更新失败", &error);
                error
            })?;

        if !response.status().is_success() {
            let error = format!("下载失败，状态码: {}", response.status());
            log_update_event("DOWNLOAD_FAILED", &error);
            write_error_log("下载更新失败", &error);
            self.set_status(UpdateStatus::Failed(error.clone()));
            return Err(error);
        }

        // 获取文件大小
        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded = 0u64;

        // 验证文件大小是否与预期一致
        if let Some(expected_size) = update_info.file_size {
            if total_size > 0 && total_size != expected_size {
                let error = format!(
                    "文件大小不匹配。预期: {} bytes，实际: {} bytes",
                    expected_size, total_size
                );
                log_update_event("DOWNLOAD_FAILED", &error);
                write_error_log("下载更新失败", &error);
                return Err(error);
            }
        }

        // 创建文件
        let mut file = fs::File::create(&file_path).map_err(|e| format!("创建文件失败: {}", e))?;

        // 流式下载文件
        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("下载数据失败: {}", e))?;
            file.write_all(&chunk)
                .map_err(|e| format!("写入文件失败: {}", e))?;

            downloaded += chunk.len() as u64;
            let progress = if total_size > 0 {
                (downloaded as f64 / total_size as f64) * 100.0
            } else {
                0.0
            };

            // 更新进度
            self.set_progress(UpdateProgress {
                stage: "downloading".to_string(),
                progress,
                message: format!("正在下载... {:.1}%", progress),
                downloaded_bytes: downloaded,
                total_bytes: total_size,
                error: None,
            });
        }

        log_update_event(
            "DOWNLOAD_COMPLETE",
            &format!("文件: {}, 大小: {} bytes", file_path.display(), downloaded),
        );
        self.set_status(UpdateStatus::Downloaded);

        Ok(file_path)
    }

    /// 验证文件完整性
    pub async fn verify_file(
        &self,
        file_path: &PathBuf,
        expected_hash: Option<&str>,
    ) -> Result<bool, String> {
        if let Some(hash) = expected_hash {
            debug_info!("🔐 验证文件完整性: {}", file_path.display());

            self.set_progress(UpdateProgress {
                stage: "verifying".to_string(),
                progress: 0.0,
                message: "正在验证文件完整性...".to_string(),
                downloaded_bytes: 0,
                total_bytes: 0,
                error: None,
            });

            // 计算文件SHA256哈希
            let file_content = fs::read(file_path).map_err(|e| format!("读取文件失败: {}", e))?;

            let mut hasher = Sha256::new();
            hasher.update(&file_content);
            let result = hasher.finalize();
            let file_hash = hex::encode(result);

            debug_info!("📋 文件哈希: {}", file_hash);
            debug_info!("📋 期望哈希: {}", hash);

            if file_hash.to_lowercase() == hash.to_lowercase() {
                debug_info!("✅ 文件完整性验证通过");
                Ok(true)
            } else {
                let error = "文件完整性验证失败".to_string();
                let details = format!("期望哈希: {}, 实际哈希: {}", hash, file_hash);
                write_error_log(&error, &details);
                self.set_status(UpdateStatus::Failed(error.clone()));
                Err(error)
            }
        } else {
            debug_info!("⚠️ 跳过文件完整性验证（未提供哈希值）");
            Ok(true)
        }
    }

    /// 比较版本号
    fn is_newer_version(&self, current: &str, remote: &str) -> bool {
        // 简单的字符串比较，实际应用中可能需要更复杂的版本比较逻辑
        current.trim() != remote.trim()
    }

    /// 设置更新状态
    fn set_status(&self, status: UpdateStatus) {
        if let Ok(mut global_status) = UPDATE_STATUS.lock() {
            *global_status = status;
        }
    }

    /// 设置更新进度
    fn set_progress(&self, progress: UpdateProgress) {
        if let Ok(mut global_progress) = UPDATE_PROGRESS.lock() {
            *global_progress = Some(progress);
        }
    }
}

/// 获取当前更新状态
#[tauri::command]
pub async fn get_update_status() -> Result<UpdateStatus, String> {
    if let Ok(status) = UPDATE_STATUS.lock() {
        Ok(status.clone())
    } else {
        Err("无效的文件格式".to_string())
    }
}

/// 获取更新进度
#[tauri::command]
pub async fn get_update_progress() -> Result<Option<UpdateProgress>, String> {
    if let Ok(progress) = UPDATE_PROGRESS.lock() {
        Ok(progress.clone())
    } else {
        Err("无效的文件格式".to_string())
    }
}

/// 获取更新日志
#[tauri::command]
pub async fn get_update_logs() -> Result<Vec<UpdateLogEntry>, String> {
    if let Ok(logs) = UPDATE_LOGS.lock() {
        Ok(logs.clone())
    } else {
        Err("无法获取更新日志".to_string())
    }
}

/// 清除更新日志
#[tauri::command]
pub async fn clear_update_logs() -> Result<(), String> {
    if let Ok(mut logs) = UPDATE_LOGS.lock() {
        logs.clear();
        Ok(())
    } else {
        Err("无法清除更新日志".to_string())
    }
}

/// 检查更新命令 - 增强版
#[tauri::command]
pub async fn check_for_updates_command(
    current_version: String,
    update_url: Option<String>,
) -> Result<Option<UpdateInfo>, String> {
    // 清除之前的日志
    if let Ok(mut logs) = UPDATE_LOGS.lock() {
        logs.clear();
    }

    add_update_log(
        "INFO",
        "CHECK_START",
        &format!("开始检查更新，当前版本: {}", current_version),
        None,
    );

    let url = update_url.unwrap_or_default();
    if url.trim().is_empty() {
        return Err("未配置更新地址".to_string());
    }

    add_update_log("DEBUG", "URL", &format!("更新服务器: {}", url), None);

    let mut manager = UpdateManager::new(url);

    match manager.check_for_updates(&current_version).await {
        Ok(result) => {
            if let Some(ref info) = result {
                add_update_log(
                    "INFO",
                    "UPDATE_FOUND",
                    &format!("发现新版本: {}", info.version),
                    Some(&format!("{:?}", info)),
                );
            } else {
                add_update_log("INFO", "UP_TO_DATE", "当前已是最新版本", None);
            }
            Ok(result)
        }
        Err(e) => {
            add_update_log(
                "ERROR",
                "CHECK_FAILED",
                &format!("检查更新失败: {}", e),
                Some(&e),
            );
            Err(e)
        }
    }
}

/// 下载更新命令 - 增强版
#[tauri::command]
pub async fn download_update_command(update_info: UpdateInfo) -> Result<String, String> {
    add_update_log(
        "INFO",
        "DOWNLOAD_START",
        &format!("开始下载: {}", update_info.version),
        Some(&format!("URL: {}", update_info.download_url)),
    );

    let mut manager = UpdateManager::new("".to_string());

    // 下载文件
    match manager.download_update(&update_info).await {
        Ok(file_path) => {
            add_update_log(
                "INFO",
                "DOWNLOAD_COMPLETE",
                &format!("下载完成: {}", file_path.display()),
                None,
            );

            // 验证文件完整性
            match manager
                .verify_file(&file_path, update_info.file_hash.as_deref())
                .await
            {
                Ok(_) => {
                    add_update_log("INFO", "VERIFY_SUCCESS", "文件完整性验证通过", None);
                    Ok(file_path.to_string_lossy().to_string())
                }
                Err(e) => {
                    add_update_log(
                        "ERROR",
                        "VERIFY_FAILED",
                        &format!("文件验证失败: {}", e),
                        Some(&e),
                    );
                    Err(e)
                }
            }
        }
        Err(e) => {
            add_update_log(
                "ERROR",
                "DOWNLOAD_FAILED",
                &format!("下载失败: {}", e),
                Some(&e),
            );
            Err(e)
        }
    }
}

/// 创建更新脚本
fn create_update_script(
    current_exe_path: &str,
    new_exe_path: &str,
    app_name: &str,
) -> Result<PathBuf, String> {
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("LovelymemV2_Update.bat");

    // 获取可执行文件名
    let exe_name = std::path::Path::new(current_exe_path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();

    // 创建更强健的更新脚本，解决各种兼容性问题
    let script_content = format!(
        r#"@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title {app_name} Update

echo ========================================
echo {app_name} Auto Update Program
echo ========================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if errorlevel 1 (
    echo Warning: Running without administrator privileges
    echo Some operations may fail on protected directories
    echo.
)

echo [1/7] Preparing update environment...
timeout /t 2 /nobreak >nul 2>&1

REM 创建日志文件
set "LOG_FILE=%TEMP%\LovelymemV2_Update.log"
echo Update started at %DATE% %TIME% > "%LOG_FILE%"

echo [2/7] Waiting for application to close...
set /a count=0
set "EXE_NAME={exe_name}"

:wait_loop
REM 使用多种方法检测进程
set "PROCESS_FOUND=0"

REM 方法1: 使用tasklist
tasklist /fi "imagename eq %EXE_NAME%" 2>nul | find /i "%EXE_NAME%" >nul 2>&1
if not errorlevel 1 set "PROCESS_FOUND=1"

REM 方法2: 使用wmic (备用)
if !PROCESS_FOUND! equ 0 (
    wmic process where "name='%EXE_NAME%'" get processid 2>nul | find /v "ProcessId" | find /v "" >nul 2>&1
    if not errorlevel 1 set "PROCESS_FOUND=1"
)

REM 方法3: 尝试删除文件来检测是否被锁定
if !PROCESS_FOUND! equ 0 (
    if exist "{current_exe_path}" (
        copy "{current_exe_path}" "{current_exe_path}.test" >nul 2>&1
        if errorlevel 1 (
            set "PROCESS_FOUND=1"
        ) else (
            del "{current_exe_path}.test" >nul 2>&1
        )
    )
)

REM 方法4: 使用handle工具检查文件句柄（如果可用）
if !PROCESS_FOUND! equ 0 (
    where handle >nul 2>&1
    if not errorlevel 1 (
        handle "{current_exe_path}" >nul 2>&1
        if not errorlevel 1 (
            set "PROCESS_FOUND=1"
            echo File handle detected using handle.exe
        )
    )
)

if !PROCESS_FOUND! equ 1 (
    set /a count+=1
    if !count! gtr 60 (
        echo Warning: Application did not close within 60 seconds
        echo Attempting to force close the application...
        echo Forced close attempt at %TIME% >> "%LOG_FILE%"

        REM 尝试强制终止进程
        echo Trying to force close %EXE_NAME%...
        taskkill /F /IM "%EXE_NAME%" >nul 2>&1
        if not errorlevel 1 (
            echo Successfully force closed the application
            echo Force close successful >> "%LOG_FILE%"
            timeout /t 3 /nobreak >nul 2>&1
        ) else (
            echo Failed to force close, attempting forced update anyway...
            echo Force close failed >> "%LOG_FILE%"
        )
        goto force_update
    )
    echo Waiting for application to close... (!count!/60^)
    timeout /t 1 /nobreak >nul 2>&1
    goto wait_loop
)

:force_update
echo [3/7] Creating backup...
set "BACKUP_PATH={current_exe_path}.backup"
set "BACKUP_SUCCESS=0"

REM 删除旧备份
if exist "%BACKUP_PATH%" (
    echo Removing old backup file...
    del "%BACKUP_PATH%" >nul 2>&1
    if errorlevel 1 (
        echo Warning: Cannot remove old backup file
        echo Old backup removal failed >> "%LOG_FILE%"
    )
)

REM 创建新备份
if exist "{current_exe_path}" (
    echo Creating backup...
    copy "{current_exe_path}" "%BACKUP_PATH%" >nul 2>&1
    if not errorlevel 1 (
        set "BACKUP_SUCCESS=1"
        echo Backup created successfully
        echo Backup created >> "%LOG_FILE%"
    ) else (
        echo Warning: Cannot create backup file
        echo Backup creation failed >> "%LOG_FILE%"
    )
) else (
    echo Warning: Current executable not found
    echo Current exe not found >> "%LOG_FILE%"
)

echo [4/7] Verifying new version file...
if not exist "{new_exe_path}" (
    echo Error: New version file not found!
    echo New version file missing >> "%LOG_FILE%"
    goto restore_and_exit
)
REM 检查新版本文件大小
for %%F in ("{new_exe_path}") do set "NEW_SIZE=%%~zF"
if !NEW_SIZE! lss 1000000 (
    echo Warning: New version file seems too small (!NEW_SIZE! bytes^)
    echo Small file size warning >> "%LOG_FILE%"
)

echo [5/7] Installing new version...
set "INSTALL_SUCCESS=0"

REM 尝试多种安装方法，增加重试机制
echo Attempting installation method 1: move command...
for /L %%i in (1,1,3) do (
    if !INSTALL_SUCCESS! equ 0 (
        echo Attempt %%i: Using move command...
        move "{new_exe_path}" "{current_exe_path}" >nul 2>&1
        if not errorlevel 1 (
            set "INSTALL_SUCCESS=1"
            echo Installation successful using move command ^(attempt %%i^)
            echo Move command success on attempt %%i >> "%LOG_FILE%"
        ) else (
            echo Move command failed on attempt %%i
            echo Move attempt %%i failed >> "%LOG_FILE%"
            if %%i lss 3 (
                echo Waiting 2 seconds before retry...
                timeout /t 2 /nobreak >nul 2>&1
            )
        )
    )
)

REM 如果move失败，尝试copy方法
if !INSTALL_SUCCESS! equ 0 (
    echo Move command failed after 3 attempts, trying copy and delete...
    for /L %%i in (1,1,3) do (
        if !INSTALL_SUCCESS! equ 0 (
            echo Attempt %%i: Using copy command...
            copy "{new_exe_path}" "{current_exe_path}" >nul 2>&1
            if not errorlevel 1 (
                echo Copy successful, now deleting source...
                del "{new_exe_path}" >nul 2>&1
                if not errorlevel 1 (
                    set "INSTALL_SUCCESS=1"
                    echo Installation successful using copy command ^(attempt %%i^)
                    echo Copy command success on attempt %%i >> "%LOG_FILE%"
                ) else (
                    echo Warning: Copy successful but failed to delete source file
                    set "INSTALL_SUCCESS=1"
                    echo Copy success but delete failed on attempt %%i >> "%LOG_FILE%"
                )
            ) else (
                echo Copy command failed on attempt %%i
                echo Copy attempt %%i failed >> "%LOG_FILE%"
                if %%i lss 3 (
                    echo Waiting 2 seconds before retry...
                    timeout /t 2 /nobreak >nul 2>&1
                )
            )
        )
    )
)

REM 如果copy也失败，尝试robocopy作为最后手段
if !INSTALL_SUCCESS! equ 0 (
    echo Both move and copy failed, trying robocopy as last resort...
    for %%F in ("{new_exe_path}") do set "NEW_FILE_NAME=%%~nxF"
    for %%F in ("{new_exe_path}") do set "NEW_FILE_DIR=%%~dpF"
    for %%F in ("{current_exe_path}") do set "CURRENT_FILE_DIR=%%~dpF"

    robocopy "%NEW_FILE_DIR%" "%CURRENT_FILE_DIR%" "!NEW_FILE_NAME!" /MOV /R:3 /W:2 >nul 2>&1
    if not errorlevel 8 (
        REM robocopy返回码小于8表示成功
        ren "%CURRENT_FILE_DIR%!NEW_FILE_NAME!" "{exe_name}" >nul 2>&1
        if not errorlevel 1 (
            set "INSTALL_SUCCESS=1"
            echo Installation successful using robocopy
            echo Robocopy command success >> "%LOG_FILE%"
        ) else (
            echo Robocopy copied but rename failed
            echo Robocopy copy success but rename failed >> "%LOG_FILE%"
        )
    ) else (
        echo Robocopy also failed
        echo Robocopy failed >> "%LOG_FILE%"
    )
)

if !INSTALL_SUCCESS! equ 0 (
    echo Error: Cannot install new version!
    echo Installation failed >> "%LOG_FILE%"

    REM 添加详细的错误诊断信息
    echo.
    echo ========================================
    echo DIAGNOSTIC INFORMATION
    echo ========================================
    echo Current executable: {current_exe_path}
    echo New executable: {new_exe_path}
    echo.

    REM 检查文件存在性
    if exist "{current_exe_path}" (
        echo Current exe exists: YES
        for %%F in ("{current_exe_path}") do echo Current exe size: %%~zF bytes
    ) else (
        echo Current exe exists: NO
    )

    if exist "{new_exe_path}" (
        echo New exe exists: YES
        for %%F in ("{new_exe_path}") do echo New exe size: %%~zF bytes
    ) else (
        echo New exe exists: NO
    )

    REM 检查磁盘空间
    echo.
    echo Disk space information:
    for %%F in ("{current_exe_path}") do set "DRIVE=%%~dF"
    dir !DRIVE! | find "bytes free"

    REM 检查文件权限
    echo.
    echo File permissions check:
    icacls "{current_exe_path}" 2>nul | find /i "full control"
    if errorlevel 1 (
        echo WARNING: May not have full control over current executable
    ) else (
        echo Current executable permissions: OK
    )

    REM 检查是否有进程仍在使用文件
    echo.
    echo Process check:
    tasklist /fi "imagename eq {exe_name}" 2>nul | find /i "{exe_name}"
    if not errorlevel 1 (
        echo WARNING: Process {exe_name} is still running!
    ) else (
        echo Process check: OK
    )

    echo ========================================
    echo.

    REM 将诊断信息也写入日志
    echo Diagnostic info written at %TIME% >> "%LOG_FILE%"
    echo Current exe exists check >> "%LOG_FILE%"
    echo New exe exists check >> "%LOG_FILE%"
    echo Disk space and permissions checked >> "%LOG_FILE%"

    goto restore_and_exit
)

echo [6/7] Verifying installation...
if not exist "{current_exe_path}" (
    echo Error: New version installation verification failed!
    echo Verification failed >> "%LOG_FILE%"
    goto restore_and_exit
)

REM 检查安装后的文件大小
for %%F in ("{current_exe_path}") do set "INSTALLED_SIZE=%%~zF"
if !INSTALLED_SIZE! lss 1000000 (
    echo Error: Installed file seems corrupted (size: !INSTALLED_SIZE! bytes^)
    echo Installed file corrupted >> "%LOG_FILE%"
    goto restore_and_exit
)

echo [7/7] Starting new version...
echo Update completed successfully! Starting {app_name}...
echo Update completed at %TIME% >> "%LOG_FILE%"

REM 尝试多种启动方法
echo Attempting to start application...
start "" "{current_exe_path}" >nul 2>&1
if errorlevel 1 (
    echo Method 1 failed, trying alternative startup...
    cmd /c start "" "{current_exe_path}" >nul 2>&1
    if errorlevel 1 (
        echo Warning: Cannot auto-start application
        echo Please manually start: {current_exe_path}
        echo Auto-start failed >> "%LOG_FILE%"
        echo.
        echo Press any key to exit...
        pause >nul
    ) else (
        echo Application started successfully (method 2^)
        echo App started (method 2) >> "%LOG_FILE%"
    )
) else (
    echo Application started successfully
    echo App started >> "%LOG_FILE%"
)

echo Cleaning up temporary files...
timeout /t 2 /nobreak >nul 2>&1

REM 清理下载的临时文件
if exist "{new_exe_path}" (
    del "{new_exe_path}" >nul 2>&1
    echo Cleaned temporary download file
)

REM 延迟删除脚本自身
timeout /t 1 /nobreak >nul 2>&1
(goto) 2>nul & del "%~f0" >nul 2>&1
exit /b 0

:restore_and_exit
echo.
echo ========================================
echo UPDATE FAILED - RESTORING BACKUP
echo ========================================
if !BACKUP_SUCCESS! equ 1 (
    if exist "%BACKUP_PATH%" (
        echo Restoring backup version...
        copy "%BACKUP_PATH%" "{current_exe_path}" >nul 2>&1
        if not errorlevel 1 (
            echo Backup restored successfully
            echo Backup restored >> "%LOG_FILE%"
        ) else (
            echo Error: Cannot restore backup!
            echo Backup restore failed >> "%LOG_FILE%"
        )
    ) else (
        echo Error: Backup file not found!
        echo Backup file missing >> "%LOG_FILE%"
    )
) else (
    echo No backup available to restore
    echo No backup to restore >> "%LOG_FILE%"
)

echo.
echo Update failed. Check log file: %LOG_FILE%
echo Press any key to exit...
pause >nul
exit /b 1
"#,
        app_name = app_name,
        exe_name = exe_name,
        current_exe_path = current_exe_path,
        new_exe_path = new_exe_path
    );

    write_windows_script(&script_path, &script_content)?;

    debug_info!("📝 更新脚本已创建: {}", script_path.display());
    Ok(script_path)
}

/// 创建VBScript更新脚本（备用方案）
fn create_vbs_update_script(
    current_exe_path: &str,
    new_exe_path: &str,
    app_name: &str,
) -> Result<PathBuf, String> {
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("LovelymemV2_Update.vbs");

    let script_content = format!(
        r#"' {app_name} Auto Update Script (Enhanced)
On Error Resume Next

Dim fso, shell, wmi, currentExe, newExe, backupExe, logFile
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
Set wmi = GetObject("winmgmts:")

currentExe = "{current_exe_path}"
newExe = "{new_exe_path}"
backupExe = currentExe & ".backup"
logFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\LovelymemV2_Update_VBS.log"

' 创建日志文件
Dim logFileObj
Set logFileObj = fso.CreateTextFile(logFile, True)
logFileObj.WriteLine "VBScript Update started at " & Now()

WScript.Echo "========================================="
WScript.Echo "{app_name} Auto Update (VBScript)"
WScript.Echo "========================================="

' 函数：检查进程是否运行
Function IsProcessRunning(processName)
    Dim processes, process
    Set processes = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = '" & processName & "'")
    IsProcessRunning = (processes.Count > 0)
End Function

' 函数：写入日志
Sub WriteLog(message)
    On Error Resume Next
    logFileObj.WriteLine Now() & " - " & message
    logFileObj.Flush
End Sub

' 等待应用程序关闭
WScript.Echo "[1/6] Waiting for application to close..."
WriteLog "Waiting for application to close"

Dim count, maxWait
count = 0
maxWait = 60

Do While IsProcessRunning("{exe_name}") And count < maxWait
    WScript.Sleep 1000
    count = count + 1
    If count Mod 10 = 0 Then
        WScript.Echo "Waiting... (" & count & "/" & maxWait & ")"
    End If
Loop

If count >= maxWait Then
    WScript.Echo "Warning: Application did not close within " & maxWait & " seconds"
    WriteLog "Forced update after timeout"
End If

' 备份当前版本
WScript.Echo "[2/6] Creating backup..."
WriteLog "Creating backup"

Dim backupSuccess
backupSuccess = False

If fso.FileExists(currentExe) Then
    ' 删除旧备份
    If fso.FileExists(backupExe) Then
        On Error Resume Next
        fso.DeleteFile backupExe
        If Err.Number <> 0 Then
            WriteLog "Warning: Cannot delete old backup - " & Err.Description
            Err.Clear
        End If
    End If

    ' 创建新备份
    On Error Resume Next
    fso.CopyFile currentExe, backupExe
    If Err.Number = 0 Then
        backupSuccess = True
        WScript.Echo "Backup created successfully"
        WriteLog "Backup created successfully"
    Else
        WScript.Echo "Warning: Cannot create backup - " & Err.Description
        WriteLog "Backup failed - " & Err.Description
        Err.Clear
    End If
Else
    WScript.Echo "Warning: Current executable not found"
    WriteLog "Current executable not found"
End If

' 验证新版本文件
WScript.Echo "[3/6] Verifying new version file..."
If Not fso.FileExists(newExe) Then
    WScript.Echo "Error: New version file not found!"
    WriteLog "New version file not found"
    WScript.Quit 1
End If

Dim newFileSize
newFileSize = fso.GetFile(newExe).Size
If newFileSize < 1000000 Then
    WScript.Echo "Warning: New version file seems too small (" & newFileSize & " bytes)"
    WriteLog "Warning: Small file size - " & newFileSize
End If

' 安装新版本
WScript.Echo "[4/6] Installing new version..."
WriteLog "Installing new version"

Dim installSuccess, maxRetries, i
installSuccess = False
maxRetries = 3

' 尝试移动文件（带重试）
For i = 1 To maxRetries
    If Not installSuccess Then
        On Error Resume Next
        WScript.Echo "Attempt " & i & ": Using move method..."
        fso.MoveFile newExe, currentExe
        If Err.Number = 0 Then
            installSuccess = True
            WScript.Echo "Installation successful using move method (attempt " & i & ")"
            WriteLog "Installation successful using move (attempt " & i & ")"
            Exit For
        Else
            WriteLog "Move attempt " & i & " failed - " & Err.Description
            Err.Clear
            If i < maxRetries Then
                WScript.Echo "Move attempt " & i & " failed, waiting 2 seconds before retry..."
                WScript.Sleep 2000
            End If
        End If
    End If
Next

' 如果移动失败，尝试复制方法（带重试）
If Not installSuccess Then
    WScript.Echo "Move method failed after " & maxRetries & " attempts, trying copy method..."
    For i = 1 To maxRetries
        If Not installSuccess Then
            On Error Resume Next
            WScript.Echo "Attempt " & i & ": Using copy method..."
            fso.CopyFile newExe, currentExe
            If Err.Number = 0 Then
                fso.DeleteFile newExe
                If Err.Number = 0 Then
                    installSuccess = True
                    WScript.Echo "Installation successful using copy method (attempt " & i & ")"
                    WriteLog "Installation successful using copy (attempt " & i & ")"
                Else
                    WScript.Echo "Copy successful but failed to delete source file"
                    WriteLog "Copy successful but delete source failed (attempt " & i & ")"
                    installSuccess = True
                    Err.Clear
                End If
                Exit For
            Else
                WriteLog "Copy attempt " & i & " failed - " & Err.Description
                Err.Clear
                If i < maxRetries Then
                    WScript.Echo "Copy attempt " & i & " failed, waiting 2 seconds before retry..."
                    WScript.Sleep 2000
                End If
            End If
        End If
    Next
End If

' 如果复制也失败，尝试使用shell命令作为最后手段
If Not installSuccess Then
    WScript.Echo "Both move and copy methods failed, trying shell command as last resort..."
    On Error Resume Next
    Dim shellResult
    shellResult = shell.Run("cmd /c move """ & newExe & """ """ & currentExe & """", 0, True)
    If shellResult = 0 Then
        installSuccess = True
        WScript.Echo "Installation successful using shell command"
        WriteLog "Installation successful using shell command"
    Else
        ' 尝试shell copy命令
        shellResult = shell.Run("cmd /c copy """ & newExe & """ """ & currentExe & """ && del """ & newExe & """", 0, True)
        If shellResult = 0 Then
            installSuccess = True
            WScript.Echo "Installation successful using shell copy command"
            WriteLog "Installation successful using shell copy command"
        Else
            WriteLog "Shell commands also failed"
        End If
    End If
End If

If Not installSuccess Then
    WScript.Echo "Error: Cannot install new version!"
    WriteLog "Installation failed"
    GoTo RestoreBackup
End If

' 验证安装
WScript.Echo "[5/6] Verifying installation..."
If Not fso.FileExists(currentExe) Then
    WScript.Echo "Error: Installation verification failed!"
    WriteLog "Installation verification failed"
    GoTo RestoreBackup
End If

Dim installedSize
installedSize = fso.GetFile(currentExe).Size
If installedSize < 1000000 Then
    WScript.Echo "Error: Installed file seems corrupted (size: " & installedSize & ")"
    WriteLog "Installed file corrupted - size: " & installedSize
    GoTo RestoreBackup
End If

' 启动新版本
WScript.Echo "[6/6] Starting new version..."
WriteLog "Starting new version"

On Error Resume Next
shell.Run """" & currentExe & """", 1, False
If Err.Number <> 0 Then
    WriteLog "Start failed - " & Err.Description
    WScript.Echo "Warning: Cannot auto-start application"
    WScript.Echo "Please manually start: " & currentExe
Else
    WScript.Echo "Application started successfully"
    WriteLog "Application started successfully"
End If

' 清理
WScript.Echo "Cleaning up..."
WScript.Sleep 2000

If fso.FileExists(newExe) Then
    fso.DeleteFile newExe
End If

WriteLog "Update completed successfully"
logFileObj.Close
WScript.Echo "Update completed successfully!"
WScript.Quit 0

RestoreBackup:
WScript.Echo "========================================="
WScript.Echo "UPDATE FAILED - RESTORING BACKUP"
WScript.Echo "========================================="
WriteLog "Update failed, attempting restore"

If backupSuccess And fso.FileExists(backupExe) Then
    On Error Resume Next
    fso.CopyFile backupExe, currentExe
    If Err.Number = 0 Then
        WScript.Echo "Backup restored successfully"
        WriteLog "Backup restored successfully"
    Else
        WScript.Echo "Error: Cannot restore backup - " & Err.Description
        WriteLog "Backup restore failed - " & Err.Description
    End If
Else
    WScript.Echo "No backup available to restore"
    WriteLog "No backup available"
End If

WriteLog "Update failed"
logFileObj.Close
WScript.Echo "Update failed. Check log: " & logFile
WScript.Quit 1

Function IsProcessRunning(processName)
    Dim objWMIService, colProcesses, objProcess
    Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
    Set colProcesses = objWMIService.ExecQuery("SELECT * FROM Win32_Process WHERE Name = '" & processName & "'")
    IsProcessRunning = (colProcesses.Count > 0)
End Function
"#,
        app_name = app_name,
        current_exe_path = current_exe_path,
        new_exe_path = new_exe_path,
        exe_name = std::path::Path::new(current_exe_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
    );

    write_windows_script(&script_path, &script_content)?;

    debug_info!("📝 VBS更新脚本已创建: {}", script_path.display());
    Ok(script_path)
}

/// 创建PowerShell更新脚本（最优方案）
fn create_powershell_update_script(
    current_exe_path: &str,
    new_exe_path: &str,
    app_name: &str,
) -> Result<PathBuf, String> {
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("LovelymemV2_Update.ps1");

    let script_content = format!(
        r#"# {app_name} Auto Update Script (PowerShell)
# Enhanced version with better error handling and compatibility

param(
    [string]$CurrentExePath = "{current_exe_path}",
    [string]$NewExePath = "{new_exe_path}",
    [string]$AppName = "{app_name}"
)

# 设置错误处理
$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

# 创建日志文件
$LogFile = Join-Path $env:TEMP "LovelymemV2_Update_PS.log"
$StartTime = Get-Date

function Write-Log {{
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $LogEntry = "$Timestamp - $Message"
    Add-Content -Path $LogFile -Value $LogEntry -ErrorAction SilentlyContinue
    Write-Host $LogEntry
}}

function Test-ProcessRunning {{
    param([string]$ProcessName)
    try {{
        $processes = Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($ProcessName)) -ErrorAction SilentlyContinue
        return ($processes.Count -gt 0)
    }} catch {{
        return $false
    }}
}}

function Test-FileLocked {{
    param([string]$FilePath)
    try {{
        if (-not (Test-Path $FilePath)) {{ return $false }}
        $file = [System.IO.File]::Open($FilePath, 'Open', 'Write')
        $file.Close()
        return $false
    }} catch {{
        return $true
    }}
}}

Write-Log "PowerShell update script started"
Write-Host "========================================="
Write-Host "$AppName Auto Update (PowerShell)"
Write-Host "========================================="

# 检查PowerShell版本
Write-Log "PowerShell version: $($PSVersionTable.PSVersion)"

# [1/7] 等待应用程序关闭
Write-Host "[1/7] Waiting for application to close..."
Write-Log "Waiting for application to close"

$ExeName = [System.IO.Path]::GetFileName($CurrentExePath)
$MaxWait = 60
$Count = 0

do {{
    $ProcessRunning = Test-ProcessRunning -ProcessName $ExeName
    $FileLocked = Test-FileLocked -FilePath $CurrentExePath

    if ($ProcessRunning -or $FileLocked) {{
        $Count++
        if ($Count -gt $MaxWait) {{
            Write-Host "Warning: Application did not close within $MaxWait seconds"
            Write-Log "Forced update after timeout"
            break
        }}
        if ($Count % 10 -eq 0) {{
            Write-Host "Waiting for application to close... ($Count/$MaxWait)"
        }}
        Start-Sleep -Seconds 1
    }}
}} while (($ProcessRunning -or $FileLocked) -and ($Count -le $MaxWait))

# [2/7] 创建备份
Write-Host "[2/7] Creating backup..."
Write-Log "Creating backup"

$BackupPath = "$CurrentExePath.backup"
$BackupSuccess = $false

try {{
    if (Test-Path $BackupPath) {{
        Remove-Item $BackupPath -Force -ErrorAction SilentlyContinue
        Write-Log "Removed old backup file"
    }}

    if (Test-Path $CurrentExePath) {{
        Copy-Item $CurrentExePath $BackupPath -Force
        $BackupSuccess = $true
        Write-Host "Backup created successfully"
        Write-Log "Backup created successfully"
    }} else {{
        Write-Host "Warning: Current executable not found"
        Write-Log "Current executable not found"
    }}
}} catch {{
    Write-Host "Warning: Cannot create backup - $($_.Exception.Message)"
    Write-Log "Backup failed - $($_.Exception.Message)"
}}

# [3/7] 验证新版本文件
Write-Host "[3/7] Verifying new version file..."
if (-not (Test-Path $NewExePath)) {{
    Write-Host "Error: New version file not found!"
    Write-Log "New version file not found"
    exit 1
}}

$NewFileSize = (Get-Item $NewExePath).Length
if ($NewFileSize -lt 1000000) {{
    Write-Host "Warning: New version file seems too small ($NewFileSize bytes)"
    Write-Log "Warning: Small file size - $NewFileSize"
}}

# [4/7] 安装新版本
Write-Host "[4/7] Installing new version..."
Write-Log "Installing new version"

$InstallSuccess = $false
$MaxRetries = 3

# 尝试移动文件（带重试）
for ($i = 1; $i -le $MaxRetries; $i++) {{
    if (-not $InstallSuccess) {{
        try {{
            Write-Host "Attempt $i`: Using move method..."
            Move-Item $NewExePath $CurrentExePath -Force -ErrorAction Stop
            $InstallSuccess = $true
            Write-Host "Installation successful using move method (attempt $i)"
            Write-Log "Installation successful using move (attempt $i)"
            break
        }} catch {{
            Write-Log "Move attempt $i failed - $($_.Exception.Message)"
            if ($i -lt $MaxRetries) {{
                Write-Host "Move attempt $i failed, waiting 2 seconds before retry..."
                Start-Sleep -Seconds 2
            }}
        }}
    }}
}}

# 如果移动失败，尝试复制方法（带重试）
if (-not $InstallSuccess) {{
    Write-Host "Move method failed after $MaxRetries attempts, trying copy method..."
    for ($i = 1; $i -le $MaxRetries; $i++) {{
        if (-not $InstallSuccess) {{
            try {{
                Write-Host "Attempt $i`: Using copy method..."
                Copy-Item $NewExePath $CurrentExePath -Force -ErrorAction Stop
                try {{
                    Remove-Item $NewExePath -Force -ErrorAction Stop
                    Write-Host "Installation successful using copy method (attempt $i)"
                    Write-Log "Installation successful using copy (attempt $i)"
                }} catch {{
                    Write-Host "Copy successful but failed to delete source file"
                    Write-Log "Copy successful but delete source failed (attempt $i)"
                }}
                $InstallSuccess = $true
                break
            }} catch {{
                Write-Log "Copy attempt $i failed - $($_.Exception.Message)"
                if ($i -lt $MaxRetries) {{
                    Write-Host "Copy attempt $i failed, waiting 2 seconds before retry..."
                    Start-Sleep -Seconds 2
                }}
            }}
        }}
    }}
}}

# 如果复制也失败，尝试使用Robocopy作为最后手段
if (-not $InstallSuccess) {{
    Write-Host "Both move and copy methods failed, trying Robocopy as last resort..."
    try {{
        $NewFileDir = Split-Path $NewExePath -Parent
        $CurrentFileDir = Split-Path $CurrentExePath -Parent
        $NewFileName = Split-Path $NewExePath -Leaf
        $CurrentFileName = Split-Path $CurrentExePath -Leaf

        # 使用Robocopy移动文件
        $RobocopyResult = & robocopy $NewFileDir $CurrentFileDir $NewFileName /MOV /R:3 /W:2 /NP /NDL /NJH /NJS
        $RobocopyExitCode = $LASTEXITCODE

        # Robocopy退出码小于8表示成功
        if ($RobocopyExitCode -lt 8) {{
            # 如果文件名不同，需要重命名
            $CopiedFile = Join-Path $CurrentFileDir $NewFileName
            if ($NewFileName -ne $CurrentFileName -and (Test-Path $CopiedFile)) {{
                Move-Item $CopiedFile $CurrentExePath -Force -ErrorAction Stop
            }}
            $InstallSuccess = $true
            Write-Host "Installation successful using Robocopy"
            Write-Log "Installation successful using Robocopy"
        }} else {{
            Write-Log "Robocopy also failed with exit code $RobocopyExitCode"
        }}
    }} catch {{
        Write-Log "Robocopy method failed - $($_.Exception.Message)"
    }}
}}

if (-not $InstallSuccess) {{
    Write-Host "Error: Cannot install new version!"
    Write-Log "Installation failed"

    # 恢复备份
    if ($BackupSuccess -and (Test-Path $BackupPath)) {{
        try {{
            Copy-Item $BackupPath $CurrentExePath -Force
            Write-Host "Backup restored successfully"
            Write-Log "Backup restored successfully"
        }} catch {{
            Write-Host "Error: Cannot restore backup - $($_.Exception.Message)"
            Write-Log "Backup restore failed - $($_.Exception.Message)"
        }}
    }}

    Write-Log "Update failed"
    exit 1
}}

# [5/7] 验证安装
Write-Host "[5/7] Verifying installation..."
if (-not (Test-Path $CurrentExePath)) {{
    Write-Host "Error: Installation verification failed!"
    Write-Log "Installation verification failed"
    exit 1
}}

$InstalledSize = (Get-Item $CurrentExePath).Length
if ($InstalledSize -lt 1000000) {{
    Write-Host "Error: Installed file seems corrupted (size: $InstalledSize bytes)"
    Write-Log "Installed file corrupted - size: $InstalledSize"
    exit 1
}}

# [6/7] 启动新版本
Write-Host "[6/7] Starting new version..."
Write-Log "Starting new version"

try {{
    Start-Process -FilePath $CurrentExePath -ErrorAction Stop
    Write-Host "Application started successfully"
    Write-Log "Application started successfully"
}} catch {{
    Write-Host "Warning: Cannot auto-start application - $($_.Exception.Message)"
    Write-Host "Please manually start: $CurrentExePath"
    Write-Log "Auto-start failed - $($_.Exception.Message)"
}}

# [7/7] 清理
Write-Host "[7/7] Cleaning up..."
Write-Log "Cleaning up"

Start-Sleep -Seconds 2

if (Test-Path $NewExePath) {{
    Remove-Item $NewExePath -Force -ErrorAction SilentlyContinue
    Write-Log "Cleaned temporary download file"
}}

$EndTime = Get-Date
$Duration = $EndTime - $StartTime
Write-Log "Update completed successfully in $($Duration.TotalSeconds) seconds"
Write-Host "Update completed successfully!"

# 延迟删除脚本自身
Start-Sleep -Seconds 1
Remove-Item $PSCommandPath -Force -ErrorAction SilentlyContinue
"#,
        current_exe_path = current_exe_path,
        new_exe_path = new_exe_path,
        app_name = app_name
    );

    write_windows_script(&script_path, &script_content)?;
    debug_info!("📝 PowerShell更新脚本已创建: {}", script_path.display());
    Ok(script_path)
}

/// 验证更新文件
fn validate_update_file(file_path: &PathBuf) -> Result<(), String> {
    debug_info!("🔍 开始验证更新文件: {}", file_path.display());

    // 检查文件是否存在
    debug_info!("📁 检查文件是否存在...");
    if !file_path.exists() {
        let error = format!("更新文件不存在: {}", file_path.display());
        write_error_log("文件验证失败", &error);
        return Err(error);
    }
    debug_info!("✅ 文件存在");

    // 检查文件大小
    debug_info!("📏 检查文件大小...");
    let metadata = fs::metadata(file_path).map_err(|e| {
        let error = format!("无法读取文件信息: {}", e);
        write_error_log("文件验证失败", &error);
        error
    })?;

    if metadata.len() == 0 {
        let error = "更新文件大小为0，文件可能损坏".to_string();
        write_error_log("文件验证失败", &error);
        return Err(error);
    }

    // 检查文件大小是否合理（至少1MB）
    if metadata.len() < 1_000_000 {
        let error = format!("更新文件大小异常: {} bytes，可能文件不完整", metadata.len());
        write_error_log("文件验证失败", &error);
        return Err(error);
    }
    debug_info!("✅ 文件大小: {} bytes", metadata.len());

    // 检查文件是否为可执行文件（Windows）
    #[cfg(windows)]
    {
        debug_info!("🔧 检查文件类型...");
        let file_name = file_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();

        if !file_name.ends_with(".exe") {
            let error = format!("文件类型错误: {}，期望.exe文件", file_name);
            write_error_log("文件验证失败", &error);
            return Err(error);
        }
        debug_info!("✅ 文件类型正确: .exe");
    }

    // 尝试读取文件头部，验证是否为有效的PE文件（Windows）
    #[cfg(windows)]
    {
        debug_info!("🔍 验证PE文件头...");
        match validate_pe_header(file_path) {
            Ok(_) => {
                debug_info!("✅ PE文件头验证通过");
            }
            Err(e) => {
                let error = format!("PE文件头验证失败: {}", e);
                write_error_log("文件验证失败", &error);
                return Err(error);
            }
        }
    }

    debug_info!(
        "✅ 更新文件验证通过: {} ({} bytes)",
        file_path.display(),
        metadata.len()
    );

    Ok(())
}

/// 验证PE文件头（Windows可执行文件）
#[cfg(windows)]
fn validate_pe_header(file_path: &PathBuf) -> Result<(), String> {
    use std::io::Read;

    let mut file = fs::File::open(file_path).map_err(|e| format!("无法打开文件: {}", e))?;

    // 读取DOS头部（前64字节）
    let mut dos_header = [0u8; 64];
    file.read_exact(&mut dos_header)
        .map_err(|e| format!("无法读取DOS头部: {}", e))?;

    // 检查DOS签名 "MZ"
    if dos_header[0] != 0x4D || dos_header[1] != 0x5A {
        return Err("无效的DOS签名，不是有效的PE文件".to_string());
    }

    // 获取PE头偏移
    let pe_offset = u32::from_le_bytes([
        dos_header[60],
        dos_header[61],
        dos_header[62],
        dos_header[63],
    ]) as u64;

    // 检查PE偏移是否合理
    if pe_offset > 1024 || pe_offset < 64 {
        return Err("PE头偏移异常".to_string());
    }

    // 读取PE签名
    use std::io::Seek;
    file.seek(std::io::SeekFrom::Start(pe_offset))
        .map_err(|e| format!("无法定位到PE头: {}", e))?;

    let mut pe_signature = [0u8; 4];
    file.read_exact(&mut pe_signature)
        .map_err(|e| format!("无法读取PE签名: {}", e))?;

    // 检查PE签名 "PE\0\0"
    if pe_signature != [0x50, 0x45, 0x00, 0x00] {
        return Err("无效的PE签名".to_string());
    }

    Ok(())
}

/// 验证URL安全性。允许用户自托管 HTTPS 服务，但拒绝本机和私有 IP 地址。
pub fn validate_url(url: &str) -> Result<(), String> {
    // 检查URL格式
    let parsed_url = url::Url::parse(url).map_err(|_| "无效的URL格式".to_string())?;

    // 检查协议（仅允许HTTPS）
    if parsed_url.scheme() != "https" {
        return Err("仅支持HTTPS协议的更新URL".to_string());
    }

    let host = parsed_url
        .host_str()
        .ok_or_else(|| "URL中缺少主机名".to_string())?;
    if host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost") {
        return Err("不允许使用本机更新地址".to_string());
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        let unsafe_ip = match ip {
            std::net::IpAddr::V4(ip) => {
                ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified()
            }
            std::net::IpAddr::V6(ip) => {
                ip.is_loopback() || ip.is_unspecified() || ip.is_unique_local()
            }
        };
        if unsafe_ip {
            return Err("不允许使用本机或私有网络更新地址".to_string());
        }
    }

    Ok(())
}

/// 添加更新日志条目
fn add_update_log(level: &str, event: &str, message: &str, details: Option<&str>) {
    let timestamp = chrono::Local::now()
        .format("%Y-%m-%d %H:%M:%S%.3f")
        .to_string();

    let entry = UpdateLogEntry {
        timestamp: timestamp.clone(),
        level: level.to_string(),
        event: event.to_string(),
        message: message.to_string(),
        details: details.map(|s| s.to_string()),
    };

    // 添加到全局日志
    if let Ok(mut logs) = UPDATE_LOGS.lock() {
        logs.push(entry.clone());
        // 限制日志数量，防止内存溢出
        if logs.len() > 500 {
            logs.remove(0);
        }
    }

    // 同时打印到控制台
    let details_str = details.map(|d| format!(" | {}", d)).unwrap_or_default();
    match level {
        "ERROR" => {
            debug_error!("❌ [{}] {}: {}{}", timestamp, event, message, details_str);
        }
        "WARN" => {
            debug_info!("⚠️ [{}] {}: {}{}", timestamp, event, message, details_str);
        }
        "DEBUG" => {
            debug_info!("🔍 [{}] {}: {}{}", timestamp, event, message, details_str);
        }
        _ => {
            debug_info!("ℹ️ [{}] {}: {}{}", timestamp, event, message, details_str);
        }
    }

    // 使用debug_info宏
    debug_info!("[UPDATE-{}] {}: {}", level, event, message);
}

/// 创建安全的HTTP客户端（30s 超时、强制 HTTPS）。供其他更新模块复用。
pub fn create_secure_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("LovelymemV2-UpdateClient/1.0")
        .https_only(true)
        .build()
        .map_err(|e| format!("创建HTTP客户端失败: {}", e))
}

/// 检查磁盘空间
fn check_disk_space(file_size: u64, target_dir: &PathBuf) -> Result<(), String> {
    // 获取目标目录所在的磁盘空间信息
    // 这里简化实现，实际应用中可以使用更精确的磁盘空间检查
    let required_space = file_size * 2; // 需要额外空间用于备份

    // Windows平台的磁盘空间检查
    #[cfg(windows)]
    {
        use std::ffi::CString;
        use std::ptr;
        use winapi::shared::minwindef::BOOL;
        use winapi::um::winnt::ULARGE_INTEGER;

        let path_cstr = CString::new(target_dir.to_string_lossy().as_bytes())
            .map_err(|_| "路径转换失败".to_string())?;

        let mut free_bytes: ULARGE_INTEGER = unsafe { std::mem::zeroed() };
        let mut total_bytes: ULARGE_INTEGER = unsafe { std::mem::zeroed() };

        unsafe {
            let result: BOOL = winapi::um::fileapi::GetDiskFreeSpaceExA(
                path_cstr.as_ptr(),
                &mut free_bytes,
                &mut total_bytes,
                ptr::null_mut(),
            );

            if result == 0 {
                return Err("无法获取磁盘空间信息".to_string());
            }

            let free_space = *free_bytes.QuadPart() as u64;

            if free_space < required_space {
                return Err(format!(
                    "磁盘空间不足。需要: {} MB，可用: {} MB",
                    required_space / 1024 / 1024,
                    free_space / 1024 / 1024
                ));
            }
        }
    }

    #[cfg(not(windows))]
    {
        // 非Windows平台的简化检查
        debug_info!("⚠️ 跳过磁盘空间检查（非Windows平台）");
    }

    Ok(())
}

/// 记录更新日志
fn log_update_event(event: &str, details: &str) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    debug_info!("[UPDATE-{}] {}: {}", timestamp, event, details);

    // 可以在这里添加更详细的日志记录到文件
}

/// 检查文件是否被锁定或正在使用
fn is_file_locked(file_path: &str) -> bool {
    use std::fs::OpenOptions;

    // 尝试以写入模式打开文件，但不截断
    match OpenOptions::new()
        .write(true)
        .truncate(false)
        .open(file_path)
    {
        Ok(file) => {
            // 文件可以打开，但还需要检查是否可以获得独占锁
            drop(file); // 立即关闭文件

            // 再次尝试以独占模式打开
            match OpenOptions::new().write(true).create(false).open(file_path) {
                Ok(_) => {
                    debug_info!("🔓 文件可以正常访问: {}", file_path);
                    false // 文件没有被锁定
                }
                Err(e) => {
                    debug_info!("🔒 文件被锁定: {} - {}", file_path, e);
                    true // 文件被锁定
                }
            }
        }
        Err(e) => {
            debug_info!("🔒 文件无法打开: {} - {}", file_path, e);
            true // 文件无法打开，可能被锁定
        }
    }
}

/// 等待文件解锁
#[allow(dead_code)]
fn wait_for_file_unlock(file_path: &str, max_wait_seconds: u64) -> bool {
    use std::thread;
    use std::time::Duration;

    debug_info!("⏳ 等待文件解锁: {}", file_path);
    debug_info!("💡 提示: 请确保没有其他程序正在使用此文件");

    let mut waited = 0;
    while waited < max_wait_seconds {
        if !is_file_locked(file_path) {
            debug_info!("✅ 文件已解锁，等待了 {} 秒", waited);
            return true;
        }

        // 每5秒输出一次进度
        if waited % 5 == 0 {
            debug_info!("⏳ 等待文件解锁中... ({}/{} 秒)", waited, max_wait_seconds);

            // 检查是否有相关进程仍在运行
            check_related_processes();
        }

        thread::sleep(Duration::from_secs(1));
        waited += 1;
    }

    debug_info!("❌ 等待文件解锁超时 ({} 秒)", max_wait_seconds);
    false
}

/// 检查相关进程是否仍在运行
#[allow(dead_code)]
fn check_related_processes() {
    #[cfg(windows)]
    {
        use std::process::Command;

        // 获取当前进程名
        if let Ok(current_exe) = std::env::current_exe() {
            if let Some(exe_name) = current_exe.file_name() {
                let exe_name_str = exe_name.to_string_lossy();

                debug_info!("🔍 检查进程: {}", exe_name_str);

                // 使用tasklist检查进程
                match Command::new("tasklist")
                    .args(&["/FI", &format!("IMAGENAME eq {}", exe_name_str)])
                    .output()
                {
                    Ok(output) => {
                        let output_str = String::from_utf8_lossy(&output.stdout);
                        if output_str.contains(&exe_name_str.to_string()) {
                            debug_info!("⚠️ 发现相关进程仍在运行: {}", exe_name_str);

                            // 尝试获取进程详细信息
                            match Command::new("wmic")
                                .args(&[
                                    "process",
                                    "where",
                                    &format!("name='{}'", exe_name_str),
                                    "get",
                                    "ProcessId,CommandLine",
                                ])
                                .output()
                            {
                                Ok(wmic_output) => {
                                    let wmic_str = String::from_utf8_lossy(&wmic_output.stdout);
                                    debug_info!("📋 进程详情:\n{}", wmic_str);
                                }
                                Err(e) => {
                                    debug_info!("⚠️ 无法获取进程详情: {}", e);
                                }
                            }
                        } else {
                            debug_info!("✅ 未发现相关进程运行");
                        }
                    }
                    Err(e) => {
                        debug_info!("⚠️ 无法检查进程: {}", e);
                    }
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        debug_info!("ℹ️ 非Windows系统，跳过进程检查");
    }
}

/// 写入错误日志到软件运行目录
fn write_error_log(error_message: &str, error_details: &str) {
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 获取软件运行目录
    let app_dir = match std::env::current_exe() {
        Ok(exe_path) => match exe_path.parent() {
            Some(dir) => dir.to_path_buf(),
            None => {
                debug_error!("❌ 无法获取软件运行目录");
                return;
            }
        },
        Err(e) => {
            debug_error!("❌ 获取当前可执行文件路径失败: {}", e);
            return;
        }
    };

    let error_log_path = app_dir.join("error.log");

    // 构建错误日志内容
    let log_content = format!(
        "========================================\n\
         更新错误日志\n\
         ========================================\n\
         时间: {}\n\
         错误: {}\n\
         详情: {}\n\
         软件目录: {}\n\
         ========================================\n\n",
        timestamp,
        error_message,
        error_details,
        app_dir.display()
    );

    // 尝试写入错误日志文件
    match fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&error_log_path)
    {
        Ok(mut file) => {
            if let Err(e) = file.write_all(log_content.as_bytes()) {
                debug_error!("❌ 写入错误日志失败: {}", e);
            } else {
                debug_info!("📝 错误日志已写入: {}", error_log_path.display());
            }
        }
        Err(e) => {
            debug_error!("❌ 创建错误日志文件失败: {}", e);
        }
    }
}

/// 清理更新临时目录
fn cleanup_update_temp_dir() {
    // 获取软件运行目录下的 temp 文件夹
    if let Ok(app_dir) = std::env::current_exe().and_then(|exe| {
        exe.parent()
            .map(|p| p.to_path_buf())
            .ok_or(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "无法获取应用程序目录",
            ))
    }) {
        let temp_base_dir = app_dir.join("temp");
        if temp_base_dir.exists() {
            // 清理 temp 目录下的所有更新文件夹
            if let Ok(entries) = fs::read_dir(&temp_base_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir()
                        && path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .map(|n| n.starts_with("update_"))
                            .unwrap_or(false)
                    {
                        let _ = fs::remove_dir_all(&path);
                        log_update_event(
                            "CLEANUP_TEMP",
                            &format!("清理临时目录: {}", path.display()),
                        );
                    }
                }
            }
        }
    }
}

/// 写入Windows脚本文件（确保使用CRLF行结束符）
fn write_windows_script(path: &PathBuf, content: &str) -> Result<(), String> {
    // 将LF转换为CRLF以确保Windows兼容性
    let content_crlf = content.replace("\n", "\r\n");

    // 直接写入ASCII内容，避免编码问题
    fs::write(path, content_crlf.as_bytes())
        .map_err(|e| format!("Failed to write script file: {}", e))?;

    Ok(())
}

/// 执行更新
#[tauri::command]
pub async fn execute_update_command(
    downloaded_file_path: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    debug_info!("🚀 开始执行更新...");

    let file_path = PathBuf::from(&downloaded_file_path);

    // 更新状态
    if let Ok(mut status) = UPDATE_STATUS.lock() {
        *status = UpdateStatus::Installing;
    }

    // 尝试使用"重命名并替换"策略（Atomic Update）
    // 这种方法不需要外部脚本等待进程退出，更可靠
    #[cfg(windows)]
    {
        debug_info!("🚀 尝试使用原子更新策略 (Rename & Replace)...");
        match perform_atomic_update(&file_path, &app_handle) {
            Ok(_) => {
                debug_info!("✅ 原子更新成功，应用程序正在重启...");
                return Ok(());
            }
            Err(e) => {
                debug_info!("⚠️ 原子更新失败: {}，回退到脚本更新模式", e);
                write_error_log("原子更新失败，回退到脚本模式", &e);
            }
        }
    }

    if let Ok(mut progress) = UPDATE_PROGRESS.lock() {
        *progress = Some(UpdateProgress {
            stage: "installing".to_string(),
            progress: 0.0,
            message: "正在验证更新文件...".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            error: None,
        });
    }

    debug_info!("🔍 开始验证更新文件...");

    // 使用超时机制验证更新文件
    let validation_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(30),
        tokio::task::spawn_blocking({
            let file_path = file_path.clone();
            move || validate_update_file(&file_path)
        }),
    )
    .await;

    match validation_result {
        Ok(Ok(result)) => match result {
            Ok(_) => {
                debug_info!("✅ 文件验证完成");
            }
            Err(e) => {
                write_error_log("执行更新失败", &format!("文件验证失败: {}", e));
                return Err(e);
            }
        },
        Ok(Err(e)) => {
            let error = format!("文件验证任务失败: {}", e);
            write_error_log("执行更新失败", &error);
            return Err(error);
        }
        Err(_) => {
            let error = "文件验证超时（30秒），可能文件过大或系统繁忙".to_string();
            write_error_log("执行更新失败", &error);
            return Err(error);
        }
    }

    // 获取当前可执行文件路径
    let current_exe =
        std::env::current_exe().map_err(|e| format!("获取当前可执行文件路径失败: {}", e))?;

    let current_exe_path = current_exe.to_string_lossy().to_string();

    // 检查当前可执行文件是否被锁定
    debug_info!("🔍 检查当前可执行文件锁定状态...");
    if is_file_locked(&current_exe_path) {
        debug_info!("⚠️ 当前可执行文件被锁定，这是正常现象（程序正在运行）");
        debug_info!("💡 更新脚本将在程序退出后自动处理文件替换");

        // 更新进度，告知用户当前状态
        if let Ok(mut progress) = UPDATE_PROGRESS.lock() {
            *progress = Some(UpdateProgress {
                stage: "installing".to_string(),
                progress: 15.0,
                message: "文件被锁定是正常现象，更新脚本将处理...".to_string(),
                downloaded_bytes: 0,
                total_bytes: 0,
                error: None,
            });
        }

        // 不需要等待解锁，因为更新脚本会在程序退出后处理
        debug_info!("✅ 继续创建更新脚本...");
    } else {
        debug_info!("✅ 当前可执行文件未被锁定");
    }

    // 更新进度
    if let Ok(mut progress) = UPDATE_PROGRESS.lock() {
        *progress = Some(UpdateProgress {
            stage: "installing".to_string(),
            progress: 25.0,
            message: "正在创建更新脚本...".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            error: None,
        });
    }

    // 尝试多种脚本类型，按优先级顺序
    let script_path = match create_powershell_update_script(
        &current_exe_path,
        &downloaded_file_path,
        "Lovelymem V2",
    ) {
        Ok(path) => {
            debug_info!("✅ PowerShell更新脚本创建成功");
            path
        }
        Err(_) => {
            debug_info!("⚠️ PowerShell脚本创建失败，尝试批处理脚本...");
            match create_update_script(&current_exe_path, &downloaded_file_path, "Lovelymem V2") {
                Ok(path) => {
                    debug_info!("✅ 批处理更新脚本创建成功");
                    path
                }
                Err(_) => {
                    debug_info!("⚠️ 批处理脚本创建失败，尝试VBScript...");
                    create_vbs_update_script(
                        &current_exe_path,
                        &downloaded_file_path,
                        "Lovelymem V2",
                    )?
                }
            }
        }
    };

    // 更新进度
    if let Ok(mut progress) = UPDATE_PROGRESS.lock() {
        *progress = Some(UpdateProgress {
            stage: "installing".to_string(),
            progress: 50.0,
            message: "正在执行更新脚本...".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            error: None,
        });
    }

    // 执行更新脚本
    #[cfg(windows)]
    {
        use std::process::Command;

        let script_extension = script_path
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();

        let result = match script_extension.as_str() {
            "ps1" => {
                // 执行PowerShell脚本（优先使用pwsh，回退到powershell）
                debug_info!("🔧 执行PowerShell更新脚本...");

                // 首先尝试PowerShell Core (pwsh)
                let mut cmd = Command::new("pwsh");
                cmd.args(&[
                    "-ExecutionPolicy",
                    "Bypass",
                    "-NoProfile",
                    "-WindowStyle",
                    "Normal",
                    "-File",
                    &script_path.to_string_lossy(),
                ]);

                match cmd.spawn() {
                    Ok(child) => Ok(child),
                    Err(_) => {
                        // 回退到Windows PowerShell
                        debug_info!("⚠️ PowerShell Core不可用，使用Windows PowerShell...");
                        Command::new("powershell")
                            .args(&[
                                "-ExecutionPolicy",
                                "Bypass",
                                "-NoProfile",
                                "-WindowStyle",
                                "Normal",
                                "-File",
                                &script_path.to_string_lossy(),
                            ])
                            .spawn()
                    }
                }
            }
            "bat" => {
                // 执行批处理脚本
                debug_info!("🔧 执行批处理更新脚本...");
                Command::new("cmd")
                    .args(&["/C", &script_path.to_string_lossy()])
                    .spawn()
            }
            "vbs" => {
                // 执行VBScript
                debug_info!("🔧 执行VBScript更新脚本...");
                Command::new("wscript")
                    .arg(script_path.to_string_lossy().to_string())
                    .spawn()
            }
            _ => {
                return Err(format!("不支持的脚本类型: {}", script_extension));
            }
        };

        result.map_err(|e| {
            let error = format!("执行更新脚本失败: {}", e);
            write_error_log("执行更新失败", &error);
            error
        })?;
    }

    #[cfg(not(windows))]
    {
        return Err("当前仅支持Windows平台的自动更新".to_string());
    }

    // 更新进度
    if let Ok(mut progress) = UPDATE_PROGRESS.lock() {
        *progress = Some(UpdateProgress {
            stage: "installing".to_string(),
            progress: 75.0,
            message: "更新脚本已启动...".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            error: None,
        });
    }

    // 等待一小段时间确保脚本开始执行
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // 更新状态为完成
    if let Ok(mut status) = UPDATE_STATUS.lock() {
        *status = UpdateStatus::Completed;
    }

    if let Ok(mut progress) = UPDATE_PROGRESS.lock() {
        *progress = Some(UpdateProgress {
            stage: "installing".to_string(),
            progress: 100.0,
            message: "更新即将完成，应用程序将重新启动...".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            error: None,
        });
    }

    // 延迟关闭应用程序，给用户时间看到消息和脚本启动
    tokio::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
        debug_info!("🔄 应用程序即将退出以完成更新...");
        app_handle.exit(0);
    });

    Ok(())
}

/// 执行原子更新（重命名当前文件，移动新文件，重启）
#[cfg(windows)]
fn perform_atomic_update(
    new_file_path: &PathBuf,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let current_exe =
        std::env::current_exe().map_err(|e| format!("获取当前可执行文件路径失败: {}", e))?;

    let _current_dir = current_exe.parent().ok_or("无法获取应用程序目录")?;

    // 1. 准备旧文件路径 (AppName.exe.old)
    let mut old_exe_path = current_exe.clone();
    // 使用 .old 扩展名，或者添加 .old 后缀
    // 注意：直接 set_extension 会替换 .exe，这里我们想要 .exe.old
    if let Some(file_name) = current_exe.file_name() {
        let mut new_name = file_name.to_os_string();
        new_name.push(".old");
        old_exe_path.set_file_name(new_name);
    } else {
        return Err("无法获取文件名".to_string());
    }

    // 如果旧文件已存在，先删除
    if old_exe_path.exists() {
        if let Err(e) = fs::remove_file(&old_exe_path) {
            debug_info!("⚠️ 无法删除已存在的旧版本文件: {}", e);
            // 尝试使用临时名称
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            old_exe_path.set_extension(format!("old.{}", timestamp));
        }
    }

    debug_info!(
        "📝 重命名当前文件: {} -> {}",
        current_exe.display(),
        old_exe_path.display()
    );

    // 2. 重命名当前正在运行的可执行文件
    // Windows允许重命名正在运行的可执行文件
    fs::rename(&current_exe, &old_exe_path)
        .map_err(|e| format!("重命名当前文件失败 (可能权限不足): {}", e))?;

    // 3. 将新文件移动到当前位置
    debug_info!(
        "📝 移动新文件: {} -> {}",
        new_file_path.display(),
        current_exe.display()
    );
    if let Err(e) = fs::rename(new_file_path, &current_exe) {
        // 如果移动失败，尝试恢复旧文件
        debug_info!("❌ 移动新文件失败: {}，尝试回滚...", e);
        if let Err(restore_err) = fs::rename(&old_exe_path, &current_exe) {
            return Err(format!(
                "移动新文件失败: {}，且无法回滚: {}",
                e, restore_err
            ));
        }
        return Err(format!("移动新文件失败: {}", e));
    }

    // 4. 启动新版本
    debug_info!("🚀 启动新版本...");
    let status = std::process::Command::new(&current_exe)
        .spawn()
        .map_err(|e| format!("无法启动新版本: {}", e))?;

    debug_info!("✅ 新版本已启动 (PID: {})", status.id());

    // 5. 退出当前进程
    app_handle.exit(0);

    Ok(())
}

/// 启动时清理旧版本文件
pub fn cleanup_old_version_files() -> Result<(), String> {
    let current_exe =
        std::env::current_exe().map_err(|e| format!("获取当前可执行文件路径失败: {}", e))?;

    let current_dir = current_exe.parent().ok_or("无法获取应用程序目录")?;

    // 查找 .exe.old 文件
    if let Ok(entries) = fs::read_dir(current_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.ends_with(".exe.old") || name.contains(".exe.old.") {
                    debug_info!("🧹 发现旧版本文件，尝试清理: {}", path.display());
                    // 尝试删除，如果失败（可能被占用）则忽略
                    if let Err(e) = fs::remove_file(&path) {
                        debug_info!("⚠️ 清理旧文件失败 (可能稍后清理): {}", e);
                    } else {
                        debug_info!("✅ 旧文件清理成功");
                    }
                }
            }
        }
    }

    Ok(())
}

/// 取消更新
#[tauri::command]
pub async fn cancel_update_command() -> Result<(), String> {
    log_update_event("UPDATE_CANCELLED", "用户取消更新");

    if let Ok(mut status) = UPDATE_STATUS.lock() {
        *status = UpdateStatus::Idle;
    }

    if let Ok(mut progress) = UPDATE_PROGRESS.lock() {
        *progress = None;
    }

    // 清理临时目录
    cleanup_update_temp_dir();

    Ok(())
}

/// 回滚到备份版本
#[tauri::command]
pub async fn rollback_update_command() -> Result<(), String> {
    log_update_event("ROLLBACK_START", "开始回滚更新");

    // 获取当前可执行文件路径
    let current_exe =
        std::env::current_exe().map_err(|e| format!("获取当前可执行文件路径失败: {}", e))?;

    let current_exe_path = current_exe.to_string_lossy().to_string();
    let backup_path = format!("{}.backup", current_exe_path);

    // 检查备份文件是否存在
    if !std::path::Path::new(&backup_path).exists() {
        let error = "备份文件不存在，无法回滚".to_string();
        log_update_event("ROLLBACK_FAILED", &error);
        write_error_log("回滚更新失败", &error);
        return Err(error);
    }

    // 创建回滚脚本
    let temp_dir = std::env::temp_dir();
    let script_path = temp_dir.join("LovelymemV2_Rollback.bat");

    let script_content = format!(
        r#"@echo off
title Lovelymem V2 Rollback

echo ========================================
echo Lovelymem V2 Version Rollback Program
echo ========================================
echo.

echo [1/4] Waiting for application to close...
timeout /t 3 /nobreak >nul

echo [2/4] Removing current version...
if exist "{current_exe_path}" (
    del "{current_exe_path}" 2>nul
    if errorlevel 1 (
        echo Error: Cannot remove current version file
        pause
        exit /b 1
    )
)

echo [3/4] Restoring backup version...
move "{backup_path}" "{current_exe_path}"
if errorlevel 1 (
    echo Error: Cannot restore backup version
    pause
    exit /b 1
)

echo [4/4] Starting restored version...
start "" "{current_exe_path}"

echo Version rollback completed!
timeout /t 2 /nobreak >nul

del "%~f0" 2>nul
"#,
        current_exe_path = current_exe_path,
        backup_path = backup_path
    );

    write_windows_script(&script_path, &script_content)?;

    // 执行回滚脚本
    #[cfg(windows)]
    {
        use std::process::Command;

        Command::new("cmd")
            .args(&["/C", &script_path.to_string_lossy()])
            .spawn()
            .map_err(|e| {
                let error = format!("执行回滚脚本失败: {}", e);
                write_error_log("回滚更新失败", &error);
                error
            })?;
    }

    #[cfg(not(windows))]
    {
        return Err("当前仅支持Windows平台的回滚功能".to_string());
    }

    log_update_event("ROLLBACK_INITIATED", "回滚脚本已启动");
    Ok(())
}

/// 写入错误日志命令（供前端调用）
#[tauri::command]
pub async fn write_update_error_log_command(
    error_message: String,
    error_details: String,
) -> Result<(), String> {
    write_error_log(&error_message, &error_details);
    Ok(())
}

/// 清理更新相关文件
#[tauri::command]
pub async fn cleanup_update_files_command() -> Result<(), String> {
    log_update_event("CLEANUP_START", "开始清理更新文件");

    let current_exe =
        std::env::current_exe().map_err(|e| format!("获取当前可执行文件路径失败: {}", e))?;

    let current_exe_path = current_exe.to_string_lossy().to_string();
    let backup_path = format!("{}.backup", current_exe_path);

    // 删除备份文件
    if std::path::Path::new(&backup_path).exists() {
        fs::remove_file(&backup_path).map_err(|e| format!("删除备份文件失败: {}", e))?;
        log_update_event("CLEANUP_BACKUP", "备份文件已删除");
    }

    // 清理临时目录中的更新脚本
    let temp_dir = std::env::temp_dir();
    let script_patterns = [
        "LovelymemV2_Update.bat",
        "LovelymemV2_Update.vbs",
        "LovelymemV2_Rollback.bat",
    ];

    for pattern in &script_patterns {
        let script_path = temp_dir.join(pattern);
        if script_path.exists() {
            let _ = fs::remove_file(&script_path);
        }
    }

    // 清理更新临时目录
    cleanup_update_temp_dir();

    log_update_event("CLEANUP_COMPLETE", "更新文件清理完成");
    Ok(())
}

//! MemNixFS 文件操作模块
//!
//! 把 MemNixFS 挂载盘上的取证产物复制到 output 目录，保留相对结构，供 V2 内嵌面板读取与离线留存：
//! - `M:\forensic\`（timeline csv/txt + snapshot + summary）→ `output\forensic\`
//! - `M:\sys\`（根文件 + findevil/net/processes/crash/journal/pagecache 子目录 + modules.txt）→ `output\sys\`
//! - `M:\fs\` 下的 Linux 日常取证文件（etc 账户/ssh、var/log、bash 历史、crontab 等）→ `output\fs\`
//!
//! 逐文件 emit `memnixfs-copy-progress` 事件，结束 emit `memnixfs-copy-done`，供前端显示进度条。

use crate::AppSettings;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::fs;

// 复用 loadmem 已有的输出目录清理逻辑
pub use crate::loadmem::file_ops::clear_output_directory;

/// 防止后台复制与手动导出并发写 output 造成冲突
static COPY_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// RAII 守卫：离开作用域自动复位 COPY_IN_PROGRESS（含早返回/错误/panic）
struct CopyGuard;
impl Drop for CopyGuard {
    fn drop(&mut self) {
        COPY_IN_PROGRESS.store(false, Ordering::SeqCst);
    }
}

/// 递归收集 src 下所有文件的 (源, 目标) 对（目标保留相对结构）
fn collect_recursive(src: &Path, dst: &Path, jobs: &mut Vec<(PathBuf, PathBuf)>) {
    if let Ok(rd) = std::fs::read_dir(src) {
        for entry in rd.flatten() {
            let p = entry.path();
            let target = dst.join(entry.file_name());
            if p.is_dir() {
                collect_recursive(&p, &target, jobs);
            } else if p.is_file() {
                jobs.push((p, target));
            }
        }
    }
}

/// 收集目录下的直接文件（非递归）
fn collect_files_flat(src: &Path, dst: &Path, jobs: &mut Vec<(PathBuf, PathBuf)>) {
    if let Ok(rd) = std::fs::read_dir(src) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_file() {
                jobs.push((p, dst.join(entry.file_name())));
            }
        }
    }
}

/// Linux 日常取证常见文件清单（相对 /，正斜杠书写）
const FS_TARGETS: &[&str] = &[
    // 账户与系统标识
    "etc/passwd",
    "etc/shadow",
    "etc/group",
    "etc/gshadow",
    "etc/sudoers",
    "etc/hostname",
    "etc/hosts",
    "etc/os-release",
    "etc/issue",
    "etc/machine-id",
    "etc/timezone",
    "etc/fstab",
    "etc/resolv.conf",
    "etc/crontab",
    "etc/ssh/sshd_config",
    "etc/ssh/ssh_config",
    // root 用户痕迹
    "root/.bash_history",
    "root/.zsh_history",
    "root/.mysql_history",
    "root/.viminfo",
    "root/.ssh/authorized_keys",
    "root/.ssh/known_hosts",
    "root/.ssh/id_rsa",
    "root/.ssh/id_rsa.pub",
    "root/.ssh/config",
    // 系统日志
    "var/log/auth.log",
    "var/log/syslog",
    "var/log/kern.log",
    "var/log/messages",
    "var/log/secure",
    "var/log/cron",
    "var/log/dmesg",
    "var/log/dpkg.log",
    "var/log/apport.log",
    "var/log/cloud-init.log",
    "var/log/faillog",
    "var/log/wtmp",
    "var/log/btmp",
    "var/log/lastlog",
    "var/log/audit/audit.log",
    // 应急响应：持久化 / 后门 / 篡改常见单文件
    "etc/rc.local",
    "etc/ld.so.preload",
    "etc/ld.so.conf",
    "etc/profile",
    "etc/bash.bashrc",
    "etc/environment",
    "etc/modules",
    "etc/hosts.allow",
    "etc/hosts.deny",
    "etc/nsswitch.conf",
    "etc/pam.d/sshd",
    "etc/pam.d/common-auth",
    "etc/pam.d/common-password",
    "etc/pam.d/su",
    "etc/pam.d/sudo",
    "root/.bashrc",
    "root/.profile",
    "root/.bash_profile",
    "root/.bash_logout",
];

/// 应急响应：持久化常涉及的多文件目录，整目录递归复制
const FS_DIRS: &[&str] = &[
    "etc/cron.d",
    "etc/cron.daily",
    "etc/cron.hourly",
    "etc/cron.weekly",
    "etc/cron.monthly",
    "etc/profile.d",
    "etc/sudoers.d",
    "etc/ld.so.conf.d",
    "etc/modprobe.d",
    "etc/modules-load.d",
    "etc/update-motd.d",
    "etc/init.d",
    "etc/systemd/system",
    "etc/ssh/sshd_config.d",
    "var/spool/cron",
    "var/spool/at",
];

/// 把 MemNixFS 挂载盘上的取证产物复制到 output 目录（保留结构，带进度事件）
pub async fn export_key_forensic_reports(
    settings: &AppSettings,
    app: Option<AppHandle>,
) -> Result<String, String> {
    // 防止并发复制（后台复制 + 手动导出）写冲突；已有任务在跑则跳过本次
    if COPY_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        debug_info!("[MemNixFS] 已有取证复制任务在进行中，跳过本次");
        return Ok("已有取证复制任务在进行中，已跳过本次".to_string());
    }
    let _copy_guard = CopyGuard;

    let out = Path::new(&settings.output_path);
    fs::create_dir_all(out)
        .await
        .map_err(|e| format!("创建输出目录失败: {}", e))?;

    let root = crate::settings::mount_root(); // 形如 "M:\\"
    let mut jobs: Vec<(PathBuf, PathBuf)> = Vec::new();

    // 1. forensic 整目录（timeline csv/txt + snapshot + summary）
    collect_recursive(
        &PathBuf::from(format!("{}forensic", root)),
        &out.join("forensic"),
        &mut jobs,
    );

    // 2. sys：根文件 + 关键子目录递归 + modules.txt（跳过 modules 下逐模块目录，避免海量小文件）
    let sys_src = format!("{}sys", root);
    let sys_dst = out.join("sys");
    collect_files_flat(&PathBuf::from(&sys_src), &sys_dst, &mut jobs);
    for sub in [
        "findevil",
        "net",
        "processes",
        "crash",
        "journal",
        "pagecache",
    ] {
        collect_recursive(
            &PathBuf::from(format!("{}\\{}", sys_src, sub)),
            &sys_dst.join(sub),
            &mut jobs,
        );
    }
    {
        let modules_txt = PathBuf::from(format!("{}\\modules\\modules.txt", sys_src));
        if modules_txt.is_file() {
            jobs.push((modules_txt, sys_dst.join("modules").join("modules.txt")));
        }
    }

    // 3. fs 日常取证（精选）+ 枚举 home/*
    let fs_root = format!("{}fs", root);
    let out_fs = out.join("fs");
    for &rel in FS_TARGETS {
        let rel_win = rel.replace('/', "\\");
        let src = PathBuf::from(format!("{}\\{}", fs_root, rel_win));
        if src.is_file() {
            jobs.push((src, out_fs.join(&rel_win)));
        }
    }
    // 应急响应：持久化目录整目录递归复制
    for &dir in FS_DIRS {
        let dir_win = dir.replace('/', "\\");
        let src = PathBuf::from(format!("{}\\{}", fs_root, dir_win));
        if src.is_dir() {
            collect_recursive(&src, &out_fs.join(&dir_win), &mut jobs);
        }
    }
    if let Ok(rd) = std::fs::read_dir(format!("{}\\home", fs_root)) {
        for entry in rd.flatten() {
            if entry.path().is_dir() {
                if let Some(user) = entry.file_name().to_str() {
                    for sub in [
                        ".bash_history",
                        ".zsh_history",
                        ".mysql_history",
                        ".viminfo",
                        ".ssh/authorized_keys",
                        ".ssh/known_hosts",
                        ".ssh/id_rsa",
                    ] {
                        let rel_win = format!("home\\{}\\{}", user, sub.replace('/', "\\"));
                        let src = PathBuf::from(format!("{}\\{}", fs_root, rel_win));
                        if src.is_file() {
                            jobs.push((src, out_fs.join(&rel_win)));
                        }
                    }
                }
            }
        }
    }

    // 4. 并发复制（8 路并行）+ 进度事件
    let total = jobs.len();
    let copied_count = Arc::new(AtomicUsize::new(0));
    const CONCURRENCY: usize = 8;
    let mut processed = 0usize;

    for chunk in jobs.chunks(CONCURRENCY) {
        let mut handles = Vec::with_capacity(chunk.len());
        for (src, dst) in chunk {
            let src = src.clone();
            let dst = dst.clone();
            let cc = copied_count.clone();
            handles.push(tokio::spawn(async move {
                if let Some(parent) = dst.parent() {
                    let _ = fs::create_dir_all(parent).await;
                }
                if fs::copy(&src, &dst).await.is_ok() {
                    cc.fetch_add(1, Ordering::Relaxed);
                }
            }));
        }
        for h in handles {
            let _ = h.await;
        }
        processed += chunk.len();
        if let Some(app) = &app {
            let last_name = chunk
                .last()
                .and_then(|(_, dst)| dst.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            let _ = app.emit(
                "memnixfs-copy-progress",
                serde_json::json!({ "current": processed, "total": total, "file": last_name }),
            );
        }
    }

    let copied = copied_count.load(Ordering::Relaxed);

    if let Some(app) = &app {
        let _ = app.emit(
            "memnixfs-copy-done",
            serde_json::json!({ "total": total, "copied": copied }),
        );
    }

    debug_info!("[MemNixFS] 取证复制完成: {} / {}", copied, total);
    Ok(format!(
        "已复制 {} / {} 个取证文件到 output 目录",
        copied, total
    ))
}

/// 前端请求复制取证文件（自行加载设置）
pub async fn export_key_forensic_reports_retry(app: Option<AppHandle>) -> Result<String, String> {
    let settings = crate::settings::load_settings_command()
        .await
        .map_err(|e| format!("加载设置失败: {}", e))?;
    export_key_forensic_reports(&settings, app).await
}

//! pypykatz 凭据提取 Tauri 命令
//!
//! 复用已配置的 Python(settings.python3_path)以 `python -m pypykatz ...` 方式离线提取凭据：
//! - LSASS:从 MemProcFS 暴露的进程 minidump(`<挂载盘>:\pid\<pid>\minidump\minidump.dmp`)解析
//!   NT/LM hash、WDIGEST、Kerberos、MSV/credman、以及 LSASS 中的 DPAPI 主密钥
//! - 注册表:从 MemProcFS 暴露的 SAM/SYSTEM/SECURITY 配置单元解析 SAM 哈希、LSA secrets、DCC2
//! - DPAPI:blob/vault 离线解密需收集 masterkey/blob 文件,首版以 LSASS 中的 DPAPI 主密钥为准
//!
//! pypykatz 需要由用户在配置的 Python 环境中自行安装。
//!
//! 解析层对 pypykatz JSON 做「版本容错」:成功解析则原样回传 JSON 给前端渲染,
//! 解析失败则回传原始输出与错误,不在后端做脆弱的字段映射。

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::process::Command;

/// extract_credentials 入参
#[derive(Debug, Deserialize)]
pub struct ExtractArgs {
    /// 目标进程 PID(通常为 lsass.exe)
    pub pid: String,
    /// 需要执行的模式:lsa / registry / dpapi。为空则全部执行。
    #[serde(default)]
    pub modes: Vec<String>,
}

/// 单个模式的提取结果
#[derive(Debug, Serialize)]
pub struct ModeResult {
    pub mode: String,
    pub ok: bool,
    /// 使用的输入来源(文件路径等),便于前端展示与排错
    pub source: Option<String>,
    /// pypykatz 的 JSON 输出(成功解析时)
    pub json: Option<Value>,
    /// 原始输出(JSON 解析失败时的兜底)
    pub raw: Option<String>,
    pub error: Option<String>,
}

/// 聚合结果
#[derive(Debug, Serialize)]
pub struct CredentialResult {
    pub pid: String,
    pub python: String,
    pub results: Vec<ModeResult>,
}

/// 统一配置子进程编码 / 隐藏控制台(与 volatility3.rs::configure_command_encoding 一致)
fn configure_cmd(cmd: &mut Command) {
    cmd.env("PYTHONUNBUFFERED", "1");
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        cmd.env("PYTHONIOENCODING", "utf-8");
        cmd.env("PYTHONUTF8", "1");
    }
}

/// 取已配置的 Python3 路径
fn get_python() -> Result<String, String> {
    let settings = crate::settings::load_settings()?;
    if settings.python3_path.trim().is_empty() {
        return Err("未配置 Python3 路径，请在设置中配置 Python3 路径".to_string());
    }
    Ok(settings.python3_path)
}

/// 运行命令并捕获 (success, stdout, stderr)
async fn run_capture(python: &str, args: &[&str]) -> Result<(bool, String, String), String> {
    let mut cmd = Command::new(python);
    cmd.args(args);
    configure_cmd(&mut cmd);
    let out = cmd
        .output()
        .await
        .map_err(|e| format!("执行命令失败(检查 Python3 路径是否正确): {}", e))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    Ok((out.status.success(), stdout, stderr))
}

/// 在「配置的 Python」内引导运行 pypykatz 的代码。
///
/// 为什么不用 `pypykatz.exe` / `python -m pypykatz`:
/// - `pypykatz.exe` 启动器内嵌的解释器路径可能已失效(换过 Python 目录后报
///   “Fatal error in launcher: Unable to create process”);
/// - 老版本 pypykatz 没有 `__main__.py`，`python -m pypykatz` 会报
///   “'pypykatz' is a package and cannot be directly executed”。
///
/// 这里改用 importlib.metadata 找到 pypykatz 的 console_scripts 入口函数并调用，
/// 兼容各版本，且始终用配置的 Python(已通过 pip show 确认装有 pypykatz)。
const PYPYKATZ_LOADER: &str = "try:\n    import importlib.metadata as M\nexcept ImportError:\n    import importlib_metadata as M\nimport sys\ntry:\n    eps = list(M.entry_points(group='console_scripts'))\nexcept TypeError:\n    eps = list(M.entry_points().get('console_scripts', []))\nfn = None\nfor e in eps:\n    if e.name == 'pypykatz':\n        try:\n            fn = e.load()\n        except Exception:\n            fn = None\n        break\nif fn is None:\n    try:\n        from pypykatz.pypykatz import main as fn\n    except Exception:\n        from pypykatz.__main__ import main as fn\nsys.argv = ['pypykatz'] + sys.argv[1:]\nrc = fn()\nsys.exit(rc if isinstance(rc, int) else 0)";

/// 仅校验 pypykatz 命令行入口是否「真的可加载」(exit 0 可用 / 非 0 不可用)。
/// 用于识别「pip show 显示已装、但实际损坏(缺 __main__ 等)」的环境。
const PYPYKATZ_CHECK: &str = "try:\n    import importlib.metadata as M\nexcept ImportError:\n    import importlib_metadata as M\nimport sys\ntry:\n    eps = list(M.entry_points(group='console_scripts'))\nexcept TypeError:\n    eps = list(M.entry_points().get('console_scripts', []))\nfn = None\nfor e in eps:\n    if e.name == 'pypykatz':\n        try:\n            fn = e.load()\n        except Exception:\n            fn = None\n        break\nif fn is None:\n    try:\n        from pypykatz.pypykatz import main as fn\n    except Exception:\n        try:\n            from pypykatz.__main__ import main as fn\n        except Exception:\n            fn = None\nsys.exit(0 if fn is not None else 3)";

/// 运行 pypykatz 子命令(用配置的 Python 经入口点引导执行，绕过损坏的 .exe 与缺失的 __main__)，
/// 捕获 (success, stdout, stderr)
async fn run_pypykatz(python: &str, sub_args: &[&str]) -> Result<(bool, String, String), String> {
    let mut full: Vec<String> = vec!["-c".to_string(), PYPYKATZ_LOADER.to_string()];
    full.extend(sub_args.iter().map(|s| s.to_string()));
    let mut cmd = Command::new(python);
    cmd.args(&full);
    configure_cmd(&mut cmd);
    let out = cmd
        .output()
        .await
        .map_err(|e| format!("执行 pypykatz 失败: {}", e))?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).to_string(),
        String::from_utf8_lossy(&out.stderr).to_string(),
    ))
}

fn first_nonempty_line(s: &str) -> String {
    s.lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty())
        .unwrap_or("未知错误")
        .to_string()
}

/// 把一次 pypykatz 调用的 stdout 解析成 ModeResult(版本容错)
fn parse_mode(
    mode: &str,
    source: Option<String>,
    success: bool,
    stdout: String,
    stderr: String,
) -> ModeResult {
    let trimmed = stdout.trim();
    if !trimmed.is_empty() {
        if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
            // 拿到有效 JSON 即视为成功,即便退出码非 0(pypykatz 有时会带告警退出)
            return ModeResult {
                mode: mode.to_string(),
                ok: true,
                source,
                json: Some(v),
                raw: None,
                error: if success {
                    None
                } else {
                    Some(first_nonempty_line(&stderr))
                },
            };
        }
    }
    ModeResult {
        mode: mode.to_string(),
        ok: false,
        source,
        json: None,
        raw: if trimmed.is_empty() {
            None
        } else {
            Some(stdout)
        },
        error: Some(if !stderr.trim().is_empty() {
            first_nonempty_line(&stderr)
        } else {
            "pypykatz 未返回有效 JSON 输出".to_string()
        }),
    }
}

/// 在 MemProcFS 暴露的注册表配置单元目录中定位 SAM / SYSTEM / SECURITY 三个 hive
fn find_registry_hives() -> Option<(String, String, String)> {
    // MemProcFS forensic 模式下原始 hive 文件目录
    let root = crate::settings::mount_root();
    let candidates = [
        format!("{}registry\\hive_files", root),
        format!("{}forensic\\registry\\hive_files", root),
    ];
    for base in &candidates {
        let dir = std::path::Path::new(base);
        if !dir.is_dir() {
            continue;
        }
        let (mut sam, mut system, mut security) = (None, None, None);
        if let Ok(rd) = std::fs::read_dir(dir) {
            for entry in rd.flatten() {
                let name = entry.file_name().to_string_lossy().to_uppercase();
                let path = entry.path().to_string_lossy().to_string();
                if name.contains("SECURITY") && security.is_none() {
                    security = Some(path);
                } else if name.contains("SYSTEM") && system.is_none() {
                    system = Some(path);
                } else if name.contains("SAM") && sam.is_none() {
                    sam = Some(path);
                }
            }
        }
        if let (Some(a), Some(b), Some(c)) = (sam, system, security) {
            return Some((a, b, c));
        }
    }
    None
}

/// 校验是否为有效的 Windows minidump(存在且以 MDMP magic 开头)
fn is_valid_minidump(path: &str) -> bool {
    use std::io::Read;
    let p = std::path::Path::new(path);
    if !p.exists() {
        return false;
    }
    match std::fs::File::open(p) {
        Ok(mut f) => {
            let mut magic = [0u8; 4];
            f.read_exact(&mut magic)
                .map(|_| &magic == b"MDMP")
                .unwrap_or(false)
        }
        Err(_) => false,
    }
}

/// MemProcFS 无法导出有效 LSASS minidump 时的兜底。
///
/// 注意:vol3 `windows.memmap --dump` 产出的是**裸内存** dump(非标准 MDMP minidump),
/// pypykatz 解析器读取 4 字节 Signature 时会直接报 UnicodeDecodeError,根本无法解析。
/// 因此这里不再喂 dump 给 pypykatz,而是直接用 Volatility3 自带的凭据插件在整镜像上提取:
///   - windows.hashdump  → 本地账户 SAM 的 NT/LM 哈希
///   - windows.lsadump   → LSA secrets
///   - windows.cachedump → 域缓存凭据 DCC2
/// 返回 { "vol3": { 标签: 文本输出, ... } }。
async fn vol3_credentials_fallback() -> Result<Value, String> {
    let settings = crate::settings::load_settings()?;
    let python = settings.python3_path.trim().to_string();
    let vol3 = settings.volatility3_path.trim().to_string();
    let image = settings.current_image_path.trim().to_string();
    if python.is_empty() {
        return Err("未配置 Python3 路径".to_string());
    }
    if vol3.is_empty() {
        return Err("未配置 Volatility3 路径(vol.py)".to_string());
    }
    if image.is_empty() {
        return Err("未检测到已加载的内存镜像路径(current_image_path)".to_string());
    }
    if !std::path::Path::new(&image).exists() {
        return Err(format!("内存镜像文件不存在: {}", image));
    }

    let plugins: [(&str, &str); 3] = [
        ("SAM 哈希 (hashdump)", "windows.hashdump.Hashdump"),
        ("LSA Secrets (lsadump)", "windows.lsadump.Lsadump"),
        ("域缓存凭据 DCC2 (cachedump)", "windows.cachedump.Cachedump"),
    ];

    let mut out = serde_json::Map::new();
    let mut any_ok = false;
    let mut errors: Vec<String> = Vec::new();

    for (label, plugin) in plugins {
        let mut cmd = Command::new(&python);
        cmd.args([vol3.as_str(), "-f", image.as_str(), plugin]);
        configure_cmd(&mut cmd);
        match cmd.output().await {
            Ok(o) => {
                let so = String::from_utf8_lossy(&o.stdout).to_string();
                let se = String::from_utf8_lossy(&o.stderr).to_string();
                if o.status.success() && !so.trim().is_empty() {
                    any_ok = true;
                    out.insert(label.to_string(), Value::String(so));
                } else {
                    let msg = if !se.trim().is_empty() {
                        first_nonempty_line(&se)
                    } else {
                        "无输出".to_string()
                    };
                    errors.push(format!("{}: {}", label, msg));
                    out.insert(
                        label.to_string(),
                        Value::String(format!("(无结果/失败: {})", msg)),
                    );
                }
            }
            Err(e) => {
                errors.push(format!("{}: {}", label, e));
                out.insert(
                    label.to_string(),
                    Value::String(format!("(执行失败: {})", e)),
                );
            }
        }
    }

    if !any_ok {
        return Err(format!(
            "Volatility3 凭据插件均未产出结果: {}",
            errors.join("; ")
        ));
    }

    let mut root = serde_json::Map::new();
    root.insert("vol3".to_string(), Value::Object(out));
    Ok(Value::Object(root))
}

/// 检查 pypykatz 是否已安装
#[tauri::command]
pub async fn check_pypykatz_installed() -> Result<bool, String> {
    let python = get_python()?;
    // 不只看 pip show，而是实际尝试加载 pypykatz 命令行入口，
    // 这样「装了但损坏(缺 __main__ / 启动器失效)」也会被判为不可用，从而引导修复。
    let (ok, _so, _se) = run_capture(&python, &["-c", PYPYKATZ_CHECK]).await?;
    Ok(ok)
}

/// 强制重装 pypykatz，修复「已安装但损坏」的环境(缺 __main__、.exe 启动器内嵌解释器失效等)。
#[tauri::command]
pub async fn repair_pypykatz() -> Result<String, String> {
    let python = get_python()?;
    let (ok, _so, se) = run_capture(
        &python,
        &[
            "-m",
            "pip",
            "install",
            "--force-reinstall",
            "--no-cache-dir",
            "pypykatz",
            "-i",
            "https://pypi.tuna.tsinghua.edu.cn/simple",
        ],
    )
    .await?;
    if !ok {
        return Err(format!("pypykatz 重装失败: {}", first_nonempty_line(&se)));
    }
    // 重装后再次校验可加载
    let (loadable, _, _) = run_capture(&python, &["-c", PYPYKATZ_CHECK]).await?;
    if loadable {
        Ok("pypykatz 已重装并可正常调用".to_string())
    } else {
        Err("pypykatz 重装完成，但仍无法加载其命令行入口，请检查该 Python 环境".to_string())
    }
}

/// 从已加载内存镜像中提取凭据
#[tauri::command]
pub async fn extract_credentials(args: ExtractArgs) -> Result<CredentialResult, String> {
    let python = get_python()?;

    let modes = if args.modes.is_empty() {
        vec![
            "lsa".to_string(),
            "registry".to_string(),
            "dpapi".to_string(),
        ]
    } else {
        args.modes.clone()
    };

    let mut results: Vec<ModeResult> = Vec::new();

    for mode in &modes {
        match mode.as_str() {
            "lsa" => {
                let minidump = format!(
                    "{}pid\\{}\\minidump\\minidump.dmp",
                    crate::settings::mount_root(),
                    args.pid
                );
                if is_valid_minidump(&minidump) {
                    // 有有效 MemProcFS minidump → pypykatz 解析 LSASS
                    let (ok, so, se) =
                        run_pypykatz(&python, &["lsa", "minidump", &minidump, "--json"]).await?;
                    results.push(parse_mode(
                        "lsa",
                        Some(format!("MemProcFS minidump: {}", minidump)),
                        ok,
                        so,
                        se,
                    ));
                } else {
                    // MemProcFS minidump 不可用 → 改用 Volatility3 凭据插件(整镜像)兜底
                    match vol3_credentials_fallback().await {
                        Ok(json) => results.push(ModeResult {
                            mode: "lsa".to_string(),
                            ok: true,
                            source: Some(
                                "MemProcFS minidump 不可用，已改用 Volatility3 凭据插件(hashdump/lsadump/cachedump)"
                                    .to_string(),
                            ),
                            json: Some(json),
                            raw: None,
                            error: None,
                        }),
                        Err(e) => results.push(ModeResult {
                            mode: "lsa".to_string(),
                            ok: false,
                            source: Some(minidump.clone()),
                            json: None,
                            raw: None,
                            error: Some(format!(
                                "MemProcFS 未提供有效 LSASS minidump，Volatility3 凭据插件兜底也失败: {}",
                                e
                            )),
                        }),
                    }
                }
            }
            "registry" => match find_registry_hives() {
                Some((sam, system, security)) => {
                    let (ok, so, se) = run_pypykatz(
                        &python,
                        &[
                            "registry",
                            "--sam",
                            &sam,
                            "--security",
                            &security,
                            &system,
                            "--json",
                        ],
                    )
                    .await?;
                    let src = format!("SAM={} | SYSTEM={} | SECURITY={}", sam, system, security);
                    results.push(parse_mode("registry", Some(src), ok, so, se));
                }
                None => {
                    results.push(ModeResult {
                        mode: "registry".to_string(),
                        ok: false,
                        source: None,
                        json: None,
                        raw: None,
                        error: Some(format!(
                            "未在 MemProcFS 注册表目录({}registry\\hive_files)找到 SAM/SYSTEM/SECURITY 配置单元",
                            crate::settings::mount_root()
                        )),
                    });
                }
            },
            "dpapi" => {
                // DPAPI blob/vault 的离线解密需要收集 masterkey/blob/vault 文件并以 LSASS/注册表产物为输入,
                // 流程复杂且依赖具体镜像。首版:LSASS 结果(dpapi_creds)已给出 DPAPI 主密钥,
                // 此处给出明确说明,blob 解密留待后续按实际镜像补全。
                results.push(ModeResult {
                    mode: "dpapi".to_string(),
                    ok: false,
                    source: None,
                    json: None,
                    raw: None,
                    error: Some(
                        "DPAPI 主密钥已在 LSASS 结果(dpapi_creds)中提取；blob/vault 的离线解密需收集 masterkey/blob 文件，将按实际镜像后续补全"
                            .to_string(),
                    ),
                });
            }
            other => {
                results.push(ModeResult {
                    mode: other.to_string(),
                    ok: false,
                    source: None,
                    json: None,
                    raw: None,
                    error: Some(format!("不支持的提取模式: {}", other)),
                });
            }
        }
    }

    Ok(CredentialResult {
        pid: args.pid,
        python,
        results,
    })
}

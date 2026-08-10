//! 官方工具链一键下载与安装。
//!
//! 所有工具均安装到应用数据目录下的 `tools/<tool_id>`。下载地址来自本模块内
//! 固定的官方目录，重定向也只能落到明确允许的官方域名；压缩包先在同盘暂存
//! 目录中校验、解压和探测，成功后才替换现有受管目录。

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use walkdir::WalkDir;

const MAX_DOWNLOAD_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ARCHIVE_FILES: usize = 100_000;
const MAX_EXTRACTED_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_METADATA_BYTES: u64 = 2 * 1024 * 1024;

const PYTHON3_VERSION: &str = "3.12.10";
const PYTHON3_URL: &str = "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe";
const PYTHON3_SHA256: &str = "67b5635e80ea51072b87941312d00ec8927c4db9ba18938f7ad2d27b328b95fb";

const PYTHON2_VERSION: &str = "2.7.18";
const PYTHON2_URL: &str = "https://www.python.org/ftp/python/2.7.18/python-2.7.18.amd64.msi";
const PYTHON2_SHA256: &str = "b74a3afa1e0bf2a6fc566a7b70d15c9bfabba3756fb077797d16fffa27800c05";

const VOL2_RELEASE_API: &str =
    "https://api.github.com/repos/volatilityfoundation/volatility/releases/latest";
const VOL3_RELEASE_API: &str =
    "https://api.github.com/repos/volatilityfoundation/volatility3/releases/latest";
const MEMPROCFS_RELEASE_API: &str = "https://api.github.com/repos/ufrisk/MemProcFS/releases/latest";
const MEMNIXFS_RELEASE_API: &str = "https://api.github.com/repos/MemNixFS/MemNixFS/releases/latest";
const PEFILE_PYPI_API: &str = "https://pypi.org/pypi/pefile/2024.8.26/json";

const ALLOWED_DOWNLOAD_HOSTS: &[&str] = &[
    "www.python.org",
    "api.github.com",
    "github.com",
    "codeload.github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "pypi.org",
    "files.pythonhosted.org",
];

static INSTALL_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

fn install_lock() -> &'static tokio::sync::Mutex<()> {
    INSTALL_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolchainInstallResult {
    pub tool_id: String,
    pub setting_key: String,
    pub path: String,
    pub version: String,
    pub source_url: String,
    pub related_paths: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ToolchainDownloadProgress {
    pub tool_id: String,
    pub stage: String,
    pub downloaded: u64,
    pub total: u64,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ToolId {
    Python3,
    Python2,
    MemProcFs,
    Volatility2,
    Volatility3,
    MemNixFs,
}

impl ToolId {
    fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "python3" => Ok(Self::Python3),
            "python2" => Ok(Self::Python2),
            "memprocfs" => Ok(Self::MemProcFs),
            "volatility2" => Ok(Self::Volatility2),
            "volatility3" => Ok(Self::Volatility3),
            "memnixfs" => Ok(Self::MemNixFs),
            _ => Err(format!("不支持的工具 ID: {}", value)),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Python3 => "python3",
            Self::Python2 => "python2",
            Self::MemProcFs => "memprocfs",
            Self::Volatility2 => "volatility2",
            Self::Volatility3 => "volatility3",
            Self::MemNixFs => "memnixfs",
        }
    }

    fn setting_key(self) -> &'static str {
        match self {
            Self::Python3 => "python3_path",
            Self::Python2 => "python2_path",
            Self::MemProcFs => "memprocfs_path",
            Self::Volatility2 => "volatility2_path",
            Self::Volatility3 => "volatility3_path",
            Self::MemNixFs => "memnixfs_path",
        }
    }
}

#[derive(Debug, Clone)]
struct DownloadDescriptor {
    version: String,
    url: String,
    filename: String,
    expected_sha256: Option<String>,
    expected_size: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    digest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PyPiProject {
    #[serde(default)]
    urls: Vec<PyPiFile>,
}

#[derive(Debug, Deserialize)]
struct PyPiFile {
    filename: String,
    url: String,
    packagetype: String,
    size: u64,
    digests: PyPiDigests,
}

#[derive(Debug, Deserialize)]
struct PyPiDigests {
    sha256: String,
}

fn emit_progress(
    app: &AppHandle,
    tool: ToolId,
    stage: &str,
    downloaded: u64,
    total: u64,
    message: impl Into<String>,
) {
    let _ = app.emit(
        "toolchain-download-progress",
        ToolchainDownloadProgress {
            tool_id: tool.as_str().to_string(),
            stage: stage.to_string(),
            downloaded,
            total,
            message: message.into(),
        },
    );
}

fn validate_catalog_url(raw_url: &str) -> Result<(), String> {
    let url = url::Url::parse(raw_url).map_err(|e| format!("下载地址无效: {}", e))?;
    if url.scheme() != "https" {
        return Err("工具链下载只允许 HTTPS".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("下载地址不得包含用户凭据".to_string());
    }
    if url.port().is_some_and(|port| port != 443) {
        return Err("下载地址不得使用非标准端口".to_string());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "下载地址缺少域名".to_string())?
        .to_ascii_lowercase();
    if !ALLOWED_DOWNLOAD_HOSTS
        .iter()
        .any(|allowed| host == *allowed)
    {
        return Err(format!("下载域名不在官方目录中: {}", host));
    }
    Ok(())
}

fn create_client() -> Result<reqwest::Client, String> {
    let redirect_policy = reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 10 {
            return attempt.error(std::io::Error::other("下载重定向次数过多"));
        }
        match validate_catalog_url(attempt.url().as_str()) {
            Ok(()) => attempt.follow(),
            Err(error) => attempt.error(std::io::Error::other(error)),
        }
    });

    reqwest::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(30 * 60))
        .redirect(redirect_policy)
        .user_agent("LovelymemV2-ToolchainInstaller/1.0")
        .build()
        .map_err(|e| format!("创建下载客户端失败: {}", e))
}

async fn bounded_response_bytes(
    client: &reqwest::Client,
    url: &str,
    limit: u64,
) -> Result<Vec<u8>, String> {
    validate_catalog_url(url)?;
    let response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("请求官方元数据失败: {}", e))?;
    if !response.status().is_success() {
        return Err(format!("请求官方元数据失败，HTTP {}", response.status()));
    }
    validate_catalog_url(response.url().as_str())?;
    if response.content_length().is_some_and(|size| size > limit) {
        return Err("官方元数据响应超过大小限制".to_string());
    }

    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取官方元数据失败: {}", e))?;
        if bytes.len() as u64 + chunk.len() as u64 > limit {
            return Err("官方元数据响应超过大小限制".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

async fn fetch_json<T: for<'de> Deserialize<'de>>(
    client: &reqwest::Client,
    url: &str,
) -> Result<T, String> {
    let bytes = bounded_response_bytes(client, url, MAX_METADATA_BYTES).await?;
    serde_json::from_slice(&bytes).map_err(|e| format!("解析官方元数据失败: {}", e))
}

fn github_digest(asset: &GitHubAsset) -> Result<Option<String>, String> {
    let Some(digest) = asset
        .digest
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    else {
        return Ok(None);
    };
    let hash = digest
        .strip_prefix("sha256:")
        .ok_or_else(|| format!("{} 使用了不支持的摘要格式", asset.name))?;
    validate_sha256(hash)?;
    Ok(Some(hash.to_ascii_lowercase()))
}

fn validate_sha256(hash: &str) -> Result<(), String> {
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("SHA-256 摘要格式无效".to_string());
    }
    Ok(())
}

fn validate_download_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty()
        || filename.len() > 255
        || filename == "."
        || filename == ".."
        || filename
            .bytes()
            .any(|byte| !(byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-')))
    {
        return Err("下载文件名包含不安全字符".to_string());
    }
    Ok(())
}

async fn resolve_download(
    client: &reqwest::Client,
    tool: ToolId,
) -> Result<DownloadDescriptor, String> {
    match tool {
        ToolId::Python3 => Ok(DownloadDescriptor {
            version: PYTHON3_VERSION.to_string(),
            url: PYTHON3_URL.to_string(),
            filename: "python-3.12.10-amd64.exe".to_string(),
            expected_sha256: Some(PYTHON3_SHA256.to_string()),
            expected_size: None,
        }),
        ToolId::Python2 => Ok(DownloadDescriptor {
            version: PYTHON2_VERSION.to_string(),
            url: PYTHON2_URL.to_string(),
            filename: "python-2.7.18.amd64.msi".to_string(),
            expected_sha256: Some(PYTHON2_SHA256.to_string()),
            expected_size: None,
        }),
        ToolId::MemProcFs => {
            let release: GitHubRelease = fetch_json(client, MEMPROCFS_RELEASE_API).await?;
            let asset = release
                .assets
                .iter()
                .filter(|asset| {
                    let name = asset.name.to_ascii_lowercase();
                    name.ends_with(".zip") && name.contains("win_x64") && !name.contains("symbol")
                })
                .max_by_key(|asset| {
                    let name = asset.name.to_ascii_lowercase();
                    (
                        u8::from(!name.contains("latest")),
                        u8::from(name.contains("memprocfs")),
                    )
                })
                .ok_or_else(|| "MemProcFS 最新版本没有 Windows x64 ZIP".to_string())?;
            let descriptor = descriptor_from_asset(&release.tag_name, asset)?;
            require_github_digest(descriptor, "MemProcFS")
        }
        ToolId::Volatility2 => resolve_volatility2(client).await,
        ToolId::Volatility3 => {
            let release: GitHubRelease = fetch_json(client, VOL3_RELEASE_API).await?;
            let asset = release
                .assets
                .iter()
                .find(|asset| {
                    let name = asset.name.to_ascii_lowercase();
                    name.starts_with("volatility3-") && name.ends_with("-py3-none-any.whl")
                })
                .ok_or_else(|| "Volatility 3 最新版本没有官方 Python wheel".to_string())?;
            let descriptor = descriptor_from_asset(&release.tag_name, asset)?;
            if descriptor.expected_sha256.is_none() {
                return Err("Volatility 3 官方 wheel 未提供 SHA-256，已拒绝安装".to_string());
            }
            Ok(descriptor)
        }
        ToolId::MemNixFs => {
            let release: GitHubRelease = fetch_json(client, MEMNIXFS_RELEASE_API).await?;
            let asset = release
                .assets
                .iter()
                .find(|asset| {
                    let name = asset.name.to_ascii_lowercase();
                    name.ends_with("win64.zip")
                })
                .ok_or_else(|| "MemNixFS 最新版本没有 Windows x64 ZIP".to_string())?;
            let descriptor = descriptor_from_asset(&release.tag_name, asset)?;
            require_github_digest(descriptor, "MemNixFS")
        }
    }
}

fn require_github_digest(
    descriptor: DownloadDescriptor,
    tool_name: &str,
) -> Result<DownloadDescriptor, String> {
    if descriptor.expected_sha256.is_none() {
        return Err(format!(
            "{} 官方发布资产未提供 SHA-256，已拒绝自动安装",
            tool_name
        ));
    }
    Ok(descriptor)
}

fn descriptor_from_asset(version: &str, asset: &GitHubAsset) -> Result<DownloadDescriptor, String> {
    validate_catalog_url(&asset.browser_download_url)?;
    validate_download_filename(&asset.name)?;
    if asset.size > MAX_DOWNLOAD_BYTES {
        return Err(format!("{} 超过 1 GiB 下载限制", asset.name));
    }
    Ok(DownloadDescriptor {
        version: version.to_string(),
        url: asset.browser_download_url.clone(),
        filename: asset.name.clone(),
        expected_sha256: github_digest(asset)?,
        expected_size: (asset.size > 0).then_some(asset.size),
    })
}

async fn resolve_volatility2(client: &reqwest::Client) -> Result<DownloadDescriptor, String> {
    let release: GitHubRelease = fetch_json(client, VOL2_RELEASE_API).await?;
    let archive = release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case("volatility-2.6.zip"))
        .ok_or_else(|| "Volatility 2 最新版本没有 volatility-2.6.zip 源码包".to_string())?;
    let hashes_asset = release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case("hashes.txt"))
        .ok_or_else(|| "Volatility 2 最新版本没有 hashes.txt".to_string())?;

    let hashes =
        bounded_response_bytes(client, &hashes_asset.browser_download_url, 64 * 1024).await?;
    let hashes_text = String::from_utf8(hashes)
        .map_err(|_| "Volatility 2 hashes.txt 不是有效 UTF-8".to_string())?;
    let matching_hashes: Vec<String> = hashes_text
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            let hash = fields.next()?;
            let filename = fields.next()?;
            (hash.len() == 64 && filename.eq_ignore_ascii_case(&archive.name))
                .then(|| hash.to_ascii_lowercase())
        })
        .collect();
    if matching_hashes.len() != 1 {
        return Err("Volatility 2 hashes.txt 中的源码包 SHA-256 缺失或不唯一".to_string());
    }
    let expected_sha256 = matching_hashes[0].clone();
    validate_sha256(&expected_sha256)?;

    let mut descriptor = descriptor_from_asset(&release.tag_name, archive)?;
    descriptor.expected_sha256 = Some(expected_sha256);
    Ok(descriptor)
}

async fn resolve_pefile(client: &reqwest::Client) -> Result<DownloadDescriptor, String> {
    let project: PyPiProject = fetch_json(client, PEFILE_PYPI_API).await?;
    let file = project
        .urls
        .iter()
        .find(|file| {
            file.packagetype == "bdist_wheel"
                && file
                    .filename
                    .to_ascii_lowercase()
                    .ends_with("-py3-none-any.whl")
        })
        .ok_or_else(|| "PyPI 未提供 pefile 2024.8.26 通用 wheel".to_string())?;
    validate_catalog_url(&file.url)?;
    validate_download_filename(&file.filename)?;
    validate_sha256(&file.digests.sha256)?;
    if file.size > MAX_DOWNLOAD_BYTES {
        return Err("pefile wheel 超过下载限制".to_string());
    }
    Ok(DownloadDescriptor {
        version: "2024.8.26".to_string(),
        url: file.url.clone(),
        filename: file.filename.clone(),
        expected_sha256: Some(file.digests.sha256.to_ascii_lowercase()),
        expected_size: Some(file.size),
    })
}

async fn download_to_file(
    app: &AppHandle,
    client: &reqwest::Client,
    tool: ToolId,
    descriptor: &DownloadDescriptor,
    destination: &Path,
) -> Result<(), String> {
    validate_catalog_url(&descriptor.url)?;
    validate_download_filename(&descriptor.filename)?;
    let expected_hash = descriptor
        .expected_sha256
        .as_deref()
        .ok_or_else(|| format!("{} 缺少可信 SHA-256，已拒绝安装", descriptor.filename))?;
    validate_sha256(expected_hash)?;
    if descriptor
        .expected_size
        .is_some_and(|size| size > MAX_DOWNLOAD_BYTES)
    {
        return Err("下载文件超过 1 GiB 限制".to_string());
    }

    let response = client
        .get(&descriptor.url)
        .send()
        .await
        .map_err(|e| format!("下载 {} 失败: {}", descriptor.filename, e))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 {} 失败，HTTP {}",
            descriptor.filename,
            response.status()
        ));
    }
    validate_catalog_url(response.url().as_str())?;

    let content_length = response.content_length().unwrap_or(0);
    if content_length > MAX_DOWNLOAD_BYTES {
        return Err("服务器返回的文件超过 1 GiB 限制".to_string());
    }
    let total = descriptor.expected_size.unwrap_or(content_length);
    emit_progress(app, tool, "downloading", 0, total, "正在下载官方安装包");

    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|e| format!("创建临时下载文件失败: {}", e))?;
    let mut stream = response.bytes_stream();
    let mut downloaded = 0_u64;
    let mut last_emitted = 0_u64;
    let mut hasher = Sha256::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取下载内容失败: {}", e))?;
        downloaded = downloaded
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| "下载大小溢出".to_string())?;
        if downloaded > MAX_DOWNLOAD_BYTES {
            return Err("下载文件超过 1 GiB 限制".to_string());
        }
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| format!("写入临时下载文件失败: {}", e))?;
        hasher.update(&chunk);

        if downloaded.saturating_sub(last_emitted) >= 512 * 1024 || downloaded == total {
            emit_progress(
                app,
                tool,
                "downloading",
                downloaded,
                total,
                "正在下载官方安装包",
            );
            last_emitted = downloaded;
        }
    }
    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(|e| format!("刷新临时下载文件失败: {}", e))?;

    if let Some(expected_size) = descriptor.expected_size {
        if downloaded != expected_size {
            return Err(format!(
                "下载大小不匹配：期望 {} 字节，实际 {} 字节",
                expected_size, downloaded
            ));
        }
    }

    emit_progress(
        app,
        tool,
        "verifying",
        downloaded,
        total,
        "正在校验 SHA-256",
    );
    let actual_hash = hex::encode(hasher.finalize());
    if !actual_hash.eq_ignore_ascii_case(expected_hash) {
        return Err(format!(
            "{} SHA-256 校验失败，已拒绝安装",
            descriptor.filename
        ));
    }
    Ok(())
}

fn extract_zip(archive_path: &Path, destination: &Path) -> Result<(), String> {
    let archive_file = std::fs::File::open(archive_path)
        .map_err(|e| format!("打开压缩包失败 {}: {}", archive_path.display(), e))?;
    let mut archive =
        zip::ZipArchive::new(archive_file).map_err(|e| format!("读取 ZIP 失败: {}", e))?;
    if archive.len() > MAX_ARCHIVE_FILES {
        return Err(format!("ZIP 文件数超过 {} 个限制", MAX_ARCHIVE_FILES));
    }

    std::fs::create_dir_all(destination).map_err(|e| format!("创建解压目录失败: {}", e))?;
    let mut extracted_bytes = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        let relative = entry
            .enclosed_name()
            .ok_or_else(|| format!("ZIP 包含不安全路径: {}", entry.name()))?;
        let output_path = destination.join(relative);
        if !output_path.starts_with(destination) {
            return Err("ZIP 条目越过解压目录".to_string());
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&output_path)
                .map_err(|e| format!("创建 ZIP 目录失败: {}", e))?;
            continue;
        }
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建 ZIP 父目录失败: {}", e))?;
        }

        let remaining = MAX_EXTRACTED_BYTES.saturating_sub(extracted_bytes);
        if remaining == 0 || entry.size() > remaining {
            return Err("ZIP 解压后总大小超过 4 GiB 限制".to_string());
        }
        let mut output =
            std::fs::File::create(&output_path).map_err(|e| format!("创建解压文件失败: {}", e))?;
        let mut limited = entry.by_ref().take(remaining + 1);
        let copied =
            std::io::copy(&mut limited, &mut output).map_err(|e| format!("解压文件失败: {}", e))?;
        if copied > remaining {
            return Err("ZIP 解压后总大小超过 4 GiB 限制".to_string());
        }
        output
            .flush()
            .map_err(|e| format!("写入解压文件失败: {}", e))?;
        extracted_bytes += copied;
    }
    Ok(())
}

fn find_entry(root: &Path, names: &[&str]) -> Result<PathBuf, String> {
    let root_canonical =
        std::fs::canonicalize(root).map_err(|e| format!("规范化安装暂存目录失败: {}", e))?;
    let mut matches: Vec<PathBuf> = WalkDir::new(root)
        .max_depth(10)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter(|entry| {
            entry.file_name().to_str().is_some_and(|name| {
                names
                    .iter()
                    .any(|expected| name.eq_ignore_ascii_case(expected))
            })
        })
        .map(|entry| entry.into_path())
        .collect();
    matches.sort_by_key(|path| path.components().count());

    let path = matches
        .into_iter()
        .next()
        .ok_or_else(|| format!("安装包内未找到入口文件: {}", names.join(" / ")))?;
    let canonical =
        std::fs::canonicalize(&path).map_err(|e| format!("规范化工具入口失败: {}", e))?;
    if !canonical.starts_with(&root_canonical) {
        return Err("工具入口越过安装暂存目录".to_string());
    }
    Ok(path)
}

fn ensure_managed_root() -> Result<PathBuf, String> {
    let root = crate::settings::get_app_data_dir()?.join("tools");
    if root.exists() {
        let metadata =
            std::fs::symlink_metadata(&root).map_err(|e| format!("读取工具安装目录失败: {}", e))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("工具安装根目录不是受支持的普通目录".to_string());
        }
    } else {
        std::fs::create_dir_all(&root).map_err(|e| format!("创建工具安装根目录失败: {}", e))?;
    }
    Ok(root)
}

fn commit_staged_install(
    staged_payload: &Path,
    staged_entry: &Path,
    managed_root: &Path,
    tool: ToolId,
) -> Result<PathBuf, String> {
    let relative_entry = staged_entry
        .strip_prefix(staged_payload)
        .map_err(|_| "工具入口不在安装暂存目录内".to_string())?
        .to_path_buf();
    let destination = managed_root.join(tool.as_str());
    let backup = managed_root.join(format!(
        ".{}-backup-{}",
        tool.as_str(),
        uuid::Uuid::new_v4()
    ));

    if destination.exists() {
        let metadata = std::fs::symlink_metadata(&destination)
            .map_err(|e| format!("读取旧工具目录失败: {}", e))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("已有工具路径不是受支持的普通目录，未进行覆盖".to_string());
        }
        std::fs::rename(&destination, &backup).map_err(|e| format!("备份旧工具目录失败: {}", e))?;
    }

    if let Err(install_error) = std::fs::rename(staged_payload, &destination) {
        let restore_error = if backup.exists() {
            std::fs::rename(&backup, &destination).err()
        } else {
            None
        };
        return match restore_error {
            Some(error) => Err(format!(
                "写入新工具目录失败: {}；恢复旧目录也失败: {}",
                install_error, error
            )),
            None => Err(format!("写入新工具目录失败: {}", install_error)),
        };
    }

    if backup.exists() {
        let _ = std::fs::remove_dir_all(&backup);
    }
    let installed_entry = destination.join(relative_entry);
    if !installed_entry.is_file() {
        return Err("安装完成后入口文件不存在".to_string());
    }
    Ok(installed_entry)
}

async fn run_command_checked(
    mut command: Command,
    description: &str,
    timeout: Duration,
) -> Result<String, String> {
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command.kill_on_drop(true);

    let output = tokio::time::timeout(timeout, command.output())
        .await
        .map_err(|_| format!("{}超时", description))?
        .map_err(|e| format!("{}启动失败: {}", description, e))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        let detail = if stderr.is_empty() { stdout } else { stderr };
        return Err(format!(
            "{}失败（{}）: {}",
            description, output.status, detail
        ));
    }
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

async fn probe_python(path: &Path, expected_major: u8) -> Result<(), String> {
    let mut command = Command::new(path);
    command.arg("--version");
    let version = run_command_checked(command, "检查 Python 版本", Duration::from_secs(20)).await?;
    let number = version
        .strip_prefix("Python ")
        .ok_or_else(|| format!("无法识别 Python 版本输出: {}", version))?;
    let mut components = number.split('.');
    let major = components
        .next()
        .and_then(|value| value.parse::<u8>().ok())
        .ok_or_else(|| format!("无法解析 Python 主版本: {}", version))?;
    let minor = components
        .next()
        .and_then(|value| value.parse::<u8>().ok())
        .ok_or_else(|| format!("无法解析 Python 次版本: {}", version))?;
    let minimum_minor = if expected_major == 3 { 8 } else { 7 };
    if major != expected_major || minor < minimum_minor {
        return Err(format!(
            "Python 版本不满足要求：至少需要 {}.{}, 实际 {}",
            expected_major, minimum_minor, version
        ));
    }
    Ok(())
}

async fn probe_volatility(
    python_path: &Path,
    script_path: &Path,
    tool: ToolId,
) -> Result<(), String> {
    let mut command = Command::new(python_path);
    command.current_dir(
        script_path
            .parent()
            .ok_or_else(|| "Volatility 入口缺少父目录".to_string())?,
    );
    command.arg(script_path);
    match tool {
        ToolId::Volatility2 => {
            command.arg("--info");
        }
        ToolId::Volatility3 => {
            command.arg("--version");
        }
        _ => return Err("内部错误：非 Volatility 工具执行探针".to_string()),
    }
    run_command_checked(command, "验证 Volatility 可用性", Duration::from_secs(90)).await?;
    Ok(())
}

fn configured_python_path(tool: ToolId, managed_root: &Path) -> Option<PathBuf> {
    let configured = crate::settings::load_settings()
        .ok()
        .and_then(|settings| match tool {
            ToolId::Python3 if !settings.python3_path.trim().is_empty() => {
                Some(PathBuf::from(settings.python3_path))
            }
            ToolId::Python2 if !settings.python2_path.trim().is_empty() => {
                Some(PathBuf::from(settings.python2_path))
            }
            _ => None,
        });
    configured.filter(|path| path.is_file()).or_else(|| {
        let managed = managed_root.join(tool.as_str()).join("python.exe");
        managed.is_file().then_some(managed)
    })
}

fn persist_python_path(tool: ToolId, path: &Path) -> Result<(), String> {
    let value = path.to_string_lossy().to_string();
    crate::settings::update_settings(|settings| match tool {
        ToolId::Python3 => settings.python3_path = value,
        ToolId::Python2 => settings.python2_path = value,
        _ => {}
    })
}

fn rollback_python_install(destination: &Path, backup: Option<&Path>) -> Result<(), String> {
    if destination.exists() {
        let metadata = std::fs::symlink_metadata(destination)
            .map_err(|e| format!("读取未完成的 Python 安装目录失败: {}", e))?;
        if metadata.file_type().is_symlink() {
            return Err("未完成的 Python 安装路径意外变成符号链接，已停止自动清理".to_string());
        }
        if metadata.is_dir() {
            std::fs::remove_dir_all(destination)
                .map_err(|e| format!("清理未完成的 Python 安装目录失败: {}", e))?;
        } else {
            std::fs::remove_file(destination)
                .map_err(|e| format!("清理未完成的 Python 安装文件失败: {}", e))?;
        }
    }
    if let Some(backup) = backup.filter(|path| path.exists()) {
        std::fs::rename(backup, destination)
            .map_err(|e| format!("恢复旧 Python 安装目录失败: {}", e))?;
    }
    Ok(())
}

async fn install_python(
    app: &AppHandle,
    client: &reqwest::Client,
    managed_root: &Path,
    tool: ToolId,
) -> Result<ToolchainInstallResult, String> {
    let descriptor = resolve_download(client, tool).await?;
    let staging = tempfile::Builder::new()
        .prefix(&format!(".{}-staging-", tool.as_str()))
        .tempdir_in(managed_root)
        .map_err(|e| format!("创建安装暂存目录失败: {}", e))?;
    let download_path = staging.path().join(&descriptor.filename);
    let destination = managed_root.join(tool.as_str());
    let backup = if destination.exists() {
        let metadata = std::fs::symlink_metadata(&destination)
            .map_err(|e| format!("读取 Python 安装目录失败: {}", e))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("Python 安装路径不是受支持的普通目录".to_string());
        }
        Some(managed_root.join(format!(
            ".{}-backup-{}",
            tool.as_str(),
            uuid::Uuid::new_v4()
        )))
    } else {
        None
    };
    download_to_file(app, client, tool, &descriptor, &download_path).await?;

    if let Some(backup) = backup.as_deref() {
        std::fs::rename(&destination, backup)
            .map_err(|e| format!("备份旧 Python 安装目录失败: {}", e))?;
    }

    emit_progress(app, tool, "installing", 0, 0, "正在静默安装 Python");
    let install_result = async {
        match tool {
            ToolId::Python3 => {
                let mut command = Command::new(&download_path);
                command.args([
                    "/quiet",
                    "InstallAllUsers=0",
                    "Include_launcher=0",
                    "InstallLauncherAllUsers=0",
                    "Include_test=0",
                    "PrependPath=0",
                    "Shortcuts=0",
                ]);
                command.arg(format!("TargetDir={}", destination.display()));
                run_command_checked(command, "静默安装 Python 3", Duration::from_secs(10 * 60))
                    .await?;
            }
            ToolId::Python2 => {
                let mut command = Command::new("msiexec.exe");
                command
                    .arg("/i")
                    .arg(&download_path)
                    .args(["/qn", "/norestart"]);
                command.arg(format!("TARGETDIR={}", destination.display()));
                command.args(["ALLUSERS=2", "MSIINSTALLPERUSER=1"]);
                run_command_checked(command, "静默安装 Python 2", Duration::from_secs(10 * 60))
                    .await?;
            }
            _ => return Err("内部错误：非 Python 工具进入 Python 安装流程".to_string()),
        }

        let entry = find_entry(&destination, &["python.exe"])?;
        probe_python(&entry, if tool == ToolId::Python3 { 3 } else { 2 }).await?;
        Ok(entry)
    }
    .await;

    let entry = match install_result {
        Ok(entry) => entry,
        Err(install_error) => {
            return match rollback_python_install(&destination, backup.as_deref()) {
                Ok(()) => Err(install_error),
                Err(rollback_error) => Err(format!(
                    "{}；同时无法完整回滚旧 Python 环境: {}",
                    install_error, rollback_error
                )),
            };
        }
    };
    if let Some(backup) = backup.as_deref().filter(|path| path.exists()) {
        let _ = std::fs::remove_dir_all(backup);
    }
    Ok(ToolchainInstallResult {
        tool_id: tool.as_str().to_string(),
        setting_key: tool.setting_key().to_string(),
        path: entry.to_string_lossy().to_string(),
        version: descriptor.version,
        source_url: descriptor.url,
        related_paths: HashMap::new(),
    })
}

async fn ensure_python(
    app: &AppHandle,
    client: &reqwest::Client,
    managed_root: &Path,
    tool: ToolId,
) -> Result<PathBuf, String> {
    let expected_major = match tool {
        ToolId::Python3 => 3,
        ToolId::Python2 => 2,
        _ => return Err("内部错误：Volatility 依赖不是 Python".to_string()),
    };
    if let Some(path) = configured_python_path(tool, managed_root) {
        if probe_python(&path, expected_major).await.is_ok() {
            persist_python_path(tool, &path)?;
            return Ok(path);
        }
    }

    emit_progress(
        app,
        tool,
        "resolving",
        0,
        0,
        "未找到可用 Python，正在自动安装依赖",
    );
    let result = install_python(app, client, managed_root, tool).await?;
    let path = PathBuf::from(result.path);
    persist_python_path(tool, &path)?;
    Ok(path)
}

async fn extract_zip_async(archive: PathBuf, destination: PathBuf) -> Result<(), String> {
    tokio::task::spawn_blocking(move || extract_zip(&archive, &destination))
        .await
        .map_err(|e| format!("ZIP 解压任务失败: {}", e))?
}

async fn install_archive_tool(
    app: &AppHandle,
    client: &reqwest::Client,
    managed_root: &Path,
    tool: ToolId,
) -> Result<ToolchainInstallResult, String> {
    let mut related_paths = HashMap::new();
    let python_path = match tool {
        ToolId::MemProcFs => {
            // MemProcFS 的设置校验要求同目录存在 Python 子环境。先确保受管
            // Python 3 可用，前端保存 related_paths 后会复用现有修复命令复制环境。
            let path = ensure_python(app, client, managed_root, ToolId::Python3).await?;
            related_paths.insert(
                ToolId::Python3.setting_key().to_string(),
                path.to_string_lossy().to_string(),
            );
            None
        }
        ToolId::Volatility2 => {
            let path = ensure_python(app, client, managed_root, ToolId::Python2).await?;
            related_paths.insert(
                ToolId::Python2.setting_key().to_string(),
                path.to_string_lossy().to_string(),
            );
            Some(path)
        }
        ToolId::Volatility3 => {
            let path = ensure_python(app, client, managed_root, ToolId::Python3).await?;
            related_paths.insert(
                ToolId::Python3.setting_key().to_string(),
                path.to_string_lossy().to_string(),
            );
            Some(path)
        }
        _ => None,
    };

    emit_progress(app, tool, "resolving", 0, 0, "正在解析官方最新版本");
    let descriptor = resolve_download(client, tool).await?;
    let staging = tempfile::Builder::new()
        .prefix(&format!(".{}-staging-", tool.as_str()))
        .tempdir_in(managed_root)
        .map_err(|e| format!("创建安装暂存目录失败: {}", e))?;
    let download_path = staging.path().join(&descriptor.filename);
    let payload = staging.path().join("payload");
    tokio::fs::create_dir_all(&payload)
        .await
        .map_err(|e| format!("创建解压暂存目录失败: {}", e))?;
    download_to_file(app, client, tool, &descriptor, &download_path).await?;

    emit_progress(app, tool, "extracting", 0, 0, "正在安全解压官方安装包");
    extract_zip_async(download_path.clone(), payload.clone()).await?;

    if tool == ToolId::Volatility3 {
        let pefile = resolve_pefile(client).await?;
        let pefile_path = staging.path().join(&pefile.filename);
        emit_progress(
            app,
            tool,
            "configuring",
            0,
            pefile.expected_size.unwrap_or(0),
            "正在下载固定版本 pefile 2024.8.26",
        );
        download_to_file(app, client, tool, &pefile, &pefile_path).await?;
        extract_zip_async(pefile_path, payload.clone()).await?;
        tokio::fs::write(
            payload.join("vol.py"),
            b"#!/usr/bin/env python3\nimport volatility3.cli\n\nif __name__ == \"__main__\":\n    volatility3.cli.main()\n",
        )
        .await
        .map_err(|e| format!("创建 Volatility 3 官方入口包装脚本失败: {}", e))?;
    }

    let entry_names: &[&str] = match tool {
        ToolId::MemProcFs => &["memprocfs.exe"],
        ToolId::Volatility2 | ToolId::Volatility3 => &["vol.py"],
        ToolId::MemNixFs => &["memnixfs.exe"],
        _ => return Err("内部错误：非压缩包工具进入解压流程".to_string()),
    };
    let entry = find_entry(&payload, entry_names)?;

    if let Some(python) = python_path.as_deref() {
        emit_progress(app, tool, "validating", 0, 0, "正在验证 Volatility 可用性");
        probe_volatility(python, &entry, tool).await?;
    }

    let volatility2_plugin_dir = if tool == ToolId::Volatility2 {
        let plugin_dir = managed_root.join("volatility2_plugin");
        if plugin_dir.exists() {
            let metadata = std::fs::symlink_metadata(&plugin_dir)
                .map_err(|e| format!("读取 Volatility 2 插件目录失败: {}", e))?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err("Volatility 2 插件路径不是受支持的普通目录".to_string());
            }
        } else {
            std::fs::create_dir_all(&plugin_dir)
                .map_err(|e| format!("创建 Volatility 2 插件目录失败: {}", e))?;
        }
        Some(plugin_dir)
    } else {
        None
    };

    // 整个官方包被移动，包内 LICENSE 等许可文件保持原样；此处不代替用户接受许可。
    let installed_entry = commit_staged_install(&payload, &entry, managed_root, tool)?;
    if let Some(plugin_dir) = volatility2_plugin_dir {
        related_paths.insert(
            "volatility2_plugin".to_string(),
            plugin_dir.to_string_lossy().to_string(),
        );
    }
    Ok(ToolchainInstallResult {
        tool_id: tool.as_str().to_string(),
        setting_key: tool.setting_key().to_string(),
        path: installed_entry.to_string_lossy().to_string(),
        version: descriptor.version,
        source_url: descriptor.url,
        related_paths,
    })
}

async fn install_tool_inner(
    app: &AppHandle,
    tool: ToolId,
) -> Result<ToolchainInstallResult, String> {
    let managed_root = ensure_managed_root()?;
    let client = create_client()?;
    match tool {
        ToolId::Python3 | ToolId::Python2 => {
            install_python(app, &client, &managed_root, tool).await
        }
        ToolId::MemProcFs | ToolId::Volatility2 | ToolId::Volatility3 | ToolId::MemNixFs => {
            install_archive_tool(app, &client, &managed_root, tool).await
        }
    }
}

/// 下载并安装工具链配置中的一个官方工具。
#[tauri::command]
pub async fn install_toolchain_tool(
    app: AppHandle,
    window: tauri::WebviewWindow,
    tool_id: String,
) -> Result<ToolchainInstallResult, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        let _ = window;
        let _ = tool_id;
        return Err("一键下载工具链当前仅支持 Windows x64".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        if !matches!(window.label(), "main" | "settings") {
            return Err("当前窗口无权安装工具链".to_string());
        }
        let tool = ToolId::parse(&tool_id)?;
        let _install_guard = install_lock().lock().await;
        emit_progress(&app, tool, "resolving", 0, 0, "正在准备官方工具下载");
        match install_tool_inner(&app, tool).await {
            Ok(result) => {
                emit_progress(&app, tool, "completed", 0, 0, "工具安装完成");
                Ok(result)
            }
            Err(error) => {
                emit_progress(&app, tool, "error", 0, 0, error.clone());
                Err(error)
            }
        }
    }
}

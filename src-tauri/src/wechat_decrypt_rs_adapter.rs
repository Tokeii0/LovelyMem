//! 微信数据库解密适配器
//!
//! 实现 SQLCipher 兼容的解密逻辑，用于解密微信加密的 SQLite 数据库。
//! 微信使用 SQLCipher 加密方案：
//!   - 页面大小: 4096 字节
//!   - 保留区域: 48 字节 (16 IV + 20 HMAC-SHA1 + 12 padding)
//!   - KDF: PBKDF2-HMAC-SHA1, 64000 次迭代
//!   - 加密: AES-256-CBC
//!   - 第1页前16字节为 salt（明文）

use std::fs;
use std::io::Write;
use std::path::Path;

use aes::Aes256;
use cbc::cipher::{BlockDecryptMut, KeyIvInit};
use hmac::Hmac;
use sha1::Sha1;

type Aes256CbcDec = cbc::Decryptor<Aes256>;
type HmacSha1 = Hmac<Sha1>;

/// SQLCipher 参数常量
const PAGE_SIZE: usize = 4096;
const RESERVE_SIZE: usize = 48; // 16 (IV) + 20 (HMAC) + 12 (padding)
const SALT_SIZE: usize = 16;
const IV_SIZE: usize = 16;
#[allow(dead_code)]
const HMAC_SIZE: usize = 20;
const KEY_SIZE: usize = 32;
const KDF_ITERATIONS: u32 = 64000;

/// 从原始密钥和 salt 派生加密密钥和 HMAC 密钥
fn derive_keys(raw_key: &[u8], salt: &[u8]) -> Result<([u8; KEY_SIZE], [u8; KEY_SIZE]), String> {
    // 派生加密密钥
    let mut enc_key = [0u8; KEY_SIZE];
    pbkdf2::pbkdf2::<HmacSha1>(raw_key, salt, KDF_ITERATIONS, &mut enc_key)
        .map_err(|e| format!("PBKDF2 加密密钥派生失败: {}", e))?;

    // 派生 HMAC 密钥 (使用加密密钥作为密码, salt 异或 0x3a)
    let hmac_salt: Vec<u8> = salt.iter().map(|b| b ^ 0x3a).collect();
    let mut hmac_key = [0u8; KEY_SIZE];
    pbkdf2::pbkdf2::<HmacSha1>(&enc_key, &hmac_salt, 2, &mut hmac_key)
        .map_err(|e| format!("PBKDF2 HMAC密钥派生失败: {}", e))?;

    Ok((enc_key, hmac_key))
}

/// 解密单个数据库页面
fn decrypt_page(
    page_data: &[u8],
    enc_key: &[u8; KEY_SIZE],
    _hmac_key: &[u8; KEY_SIZE],
    is_first_page: bool,
) -> Result<Vec<u8>, String> {
    if page_data.len() != PAGE_SIZE {
        return Err(format!(
            "页面大小错误: 期望 {}, 实际 {}",
            PAGE_SIZE,
            page_data.len()
        ));
    }

    let content_size = PAGE_SIZE - RESERVE_SIZE;

    if is_first_page {
        // 第1页: 前16字节是 salt（明文），从第16字节开始是加密数据
        let encrypted_start = SALT_SIZE;
        let encrypted_end = content_size;
        let iv_start = content_size;
        let iv = &page_data[iv_start..iv_start + IV_SIZE];
        let encrypted = &page_data[encrypted_start..encrypted_end];

        let mut buf = encrypted.to_vec();
        let decryptor = Aes256CbcDec::new(enc_key.into(), iv.into());
        decryptor
            .decrypt_padded_mut::<aes::cipher::block_padding::NoPadding>(&mut buf)
            .map_err(|_| "AES-CBC 解密首页失败".to_string())?;

        // 构建解密后的页面: SQLite 头 + 解密数据
        let mut result = Vec::with_capacity(PAGE_SIZE);
        result.extend_from_slice(b"SQLite format 3\0");
        result.extend_from_slice(&buf);
        // 填充至 PAGE_SIZE
        result.resize(PAGE_SIZE, 0);
        Ok(result)
    } else {
        // 后续页面: 全部是加密数据 + 保留区域
        let encrypted = &page_data[..content_size];
        let iv_start = content_size;
        let iv = &page_data[iv_start..iv_start + IV_SIZE];

        let mut buf = encrypted.to_vec();
        let decryptor = Aes256CbcDec::new(enc_key.into(), iv.into());
        decryptor
            .decrypt_padded_mut::<aes::cipher::block_padding::NoPadding>(&mut buf)
            .map_err(|_| "AES-CBC 解密页面失败".to_string())?;

        let mut result = Vec::with_capacity(PAGE_SIZE);
        result.extend_from_slice(&buf);
        result.resize(PAGE_SIZE, 0);
        Ok(result)
    }
}

/// 验证解密后的 SQLite 文件头是否有效
fn is_valid_sqlite_header(data: &[u8]) -> bool {
    data.len() >= 16 && &data[..16] == b"SQLite format 3\0"
}

/// 尝试使用指定密钥解密整个数据库文件
fn try_decrypt_db(db_data: &[u8], raw_key: &[u8]) -> Result<Vec<u8>, String> {
    if db_data.len() < PAGE_SIZE {
        return Err("数据库文件太小，不是有效的加密数据库".to_string());
    }

    // 第1页的前16字节是 salt
    let salt = &db_data[..SALT_SIZE];

    // 派生密钥
    let (enc_key, hmac_key) = derive_keys(raw_key, salt)?;

    let num_pages = db_data.len() / PAGE_SIZE;
    let mut output = Vec::with_capacity(db_data.len());

    for page_idx in 0..num_pages {
        let start = page_idx * PAGE_SIZE;
        let end = start + PAGE_SIZE;
        let page_data = &db_data[start..end];

        let decrypted = decrypt_page(page_data, &enc_key, &hmac_key, page_idx == 0)?;
        output.extend_from_slice(&decrypted);
    }

    // 验证解密结果
    if !is_valid_sqlite_header(&output) {
        return Err("解密后的文件头不是有效的 SQLite 格式，密钥可能不正确".to_string());
    }

    Ok(output)
}

/// 解析密钥 JSON 文件，提取 hex 编码的密钥列表
fn parse_keys_file(keys_file: &Path) -> Result<Vec<Vec<u8>>, String> {
    let content = fs::read_to_string(keys_file).map_err(|e| format!("读取密钥文件失败: {}", e))?;

    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("解析密钥 JSON 失败: {}", e))?;

    let mut keys = Vec::new();

    // 支持两种格式:
    // 1. 数组格式: [{"enc_key": "hex..."}, ...]
    // 2. 对象格式: {"keys": ["hex1", "hex2", ...]}
    if let Some(arr) = json.as_array() {
        for item in arr {
            if let Some(key_hex) = item.get("enc_key").and_then(|v| v.as_str()) {
                if let Ok(key_bytes) = hex::decode(key_hex) {
                    if key_bytes.len() == KEY_SIZE {
                        keys.push(key_bytes);
                    }
                }
            } else if let Some(key_hex) = item.as_str() {
                if let Ok(key_bytes) = hex::decode(key_hex) {
                    if key_bytes.len() == KEY_SIZE {
                        keys.push(key_bytes);
                    }
                }
            }
        }
    } else if let Some(keys_arr) = json.get("keys").and_then(|v| v.as_array()) {
        for item in keys_arr {
            if let Some(key_hex) = item.as_str() {
                if let Ok(key_bytes) = hex::decode(key_hex) {
                    if key_bytes.len() == KEY_SIZE {
                        keys.push(key_bytes);
                    }
                }
            }
        }
    }

    if keys.is_empty() {
        return Err("未从密钥文件中提取到有效的 32 字节密钥".to_string());
    }

    Ok(keys)
}

/// 微信数据库解密入口
///
/// 1. 从 keys_file 解析候选密钥
/// 2. 遍历 db_dir 下的 .db 文件
/// 3. 依次尝试每个密钥解密
/// 4. 解密成功的文件写入 output_dir
/// 返回 (成功解密文件数, 失败文件数)
pub fn cmd_decrypt(
    keys_file: &Path,
    db_dir: &Path,
    output_dir: &Path,
) -> Result<(usize, usize), String> {
    // 解析密钥
    let keys = parse_keys_file(keys_file)?;

    // 确保输出目录存在
    fs::create_dir_all(output_dir).map_err(|e| format!("创建输出目录失败: {}", e))?;

    // 遍历数据库目录
    let mut success_count = 0;
    let mut fail_count = 0;

    let entries: Vec<_> = fs::read_dir(db_dir)
        .map_err(|e| format!("读取数据库目录失败: {}", e))?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().extension().map_or(false, |ext| {
                ext == "db" || ext == "sqlite" || ext == "db-wal" || ext == "db-shm"
            })
        })
        .collect();

    if entries.is_empty() {
        return Err(format!("在 {} 中未找到 .db/.sqlite 文件", db_dir.display()));
    }

    for entry in &entries {
        let db_path = entry.path();
        let file_name = db_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // 跳过 WAL 和 SHM 文件
        if file_name.ends_with("-wal") || file_name.ends_with("-shm") {
            continue;
        }

        let db_data = match fs::read(&db_path) {
            Ok(data) => data,
            Err(_) => {
                fail_count += 1;
                continue;
            }
        };

        // 如果已经是明文 SQLite，直接复制
        if is_valid_sqlite_header(&db_data) {
            let output_path = output_dir.join(&file_name);
            if fs::write(&output_path, &db_data).is_ok() {
                success_count += 1;
            }
            continue;
        }

        // 尝试每个密钥
        let mut decrypted = false;
        for key in &keys {
            match try_decrypt_db(&db_data, key) {
                Ok(plaintext) => {
                    let output_path = output_dir.join(&file_name);
                    let mut file = fs::File::create(&output_path)
                        .map_err(|e| format!("创建输出文件失败: {}", e))?;
                    file.write_all(&plaintext)
                        .map_err(|e| format!("写入解密数据失败: {}", e))?;
                    success_count += 1;
                    decrypted = true;
                    break;
                }
                Err(_) => continue,
            }
        }

        if !decrypted {
            fail_count += 1;
        }
    }

    if success_count == 0 {
        return Err(format!(
            "所有数据库解密失败 ({} 个文件)。可能密钥不匹配或数据库格式不支持。",
            fail_count
        ));
    }

    Ok((success_count, fail_count))
}

//! 微信数据库解密 Tauri 命令
// 使用项目内置的 SQLCipher 解密适配器。
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
pub struct WechatDecryptArgs {
    pub keys_json: String,  // 密钥 JSON 内容
    pub db_dir: String,     // db_storage 目录
    pub output_dir: String, // 输出目录
}

#[tauri::command]
pub async fn decrypt_wechat_db(args: WechatDecryptArgs) -> Result<String, String> {
    // 1. 保存 keys_json 到临时文件
    let tmp_keys_path = std::env::temp_dir().join("wechat_keys.json");
    std::fs::write(&tmp_keys_path, &args.keys_json)
        .map_err(|e| format!("写入临时密钥文件失败: {}", e))?;

    // 2. 调用内置数据库解密逻辑
    let db_dir = Path::new(&args.db_dir);
    let output_dir = Path::new(&args.output_dir);
    if !db_dir.is_dir() {
        return Err(format!("db_dir 不是有效目录: {}", args.db_dir));
    }
    std::fs::create_dir_all(&output_dir).map_err(|e| format!("创建输出目录失败: {}", e))?;

    // 复用项目内置的解密适配器
    match super::wechat_decrypt_rs_adapter::cmd_decrypt(&tmp_keys_path, db_dir, output_dir) {
        Ok((success, fail)) => Ok(format!(
            "解密完成：成功 {} 个，失败 {} 个，已输出到 {}",
            success, fail, args.output_dir
        )),
        Err(e) => Err(format!("解密失败: {}", e)),
    }
}

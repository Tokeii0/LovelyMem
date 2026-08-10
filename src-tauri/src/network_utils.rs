//! 网络工具模块
//!
//! 提供网络相关的实用功能，如版本检查和获取公网IP

lazy_static::lazy_static! {
    /// 全局共享 HTTP 客户端 - 复用连接池和 TLS 会话，避免每次请求重建连接
    static ref HTTP_CLIENT: reqwest::Client = reqwest::Client::new();
}

/// 获取全局共享的 HTTP 客户端引用
pub fn http_client() -> &'static reqwest::Client {
    &HTTP_CLIENT
}

/// 检查远程版本
#[tauri::command]
pub async fn check_remote_version(url: String) -> Result<String, String> {
    let client = http_client();
    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP请求失败，状态码: {}", response.status()));
    }

    let content = response
        .text()
        .await
        .map_err(|e| format!("读取响应内容失败: {}", e))?;

    Ok(content.trim().to_string())
}

/// 获取公网IP地址
#[tauri::command]
pub async fn get_public_ip() -> Result<String, String> {
    let client = http_client();
    let response = client
        .get("https://api.ipify.org")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("获取IP地址失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP请求失败，状态码: {}", response.status()));
    }

    let ip = response
        .text()
        .await
        .map_err(|e| format!("读取IP地址失败: {}", e))?;

    let ip = ip.trim().to_string();

    Ok(ip)
}

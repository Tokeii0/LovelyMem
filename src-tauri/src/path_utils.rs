//! 路径处理工具模块
//!
//! 该模块提供了统一的路径处理功能，用于解决路径包含空格导致的命令执行失败问题。
//!
//! # 功能特性
//!
//! - 自动检测路径是否包含空格
//! - 为包含空格的路径添加引号保护
//! - 跨平台路径转义处理
//! - 命令行参数安全构建
//!
//! # 使用示例
//!
//! ```rust
//! use crate::path_utils::{quote_path_if_needed, escape_path_for_shell, build_safe_command_args};
//!
//! // 为路径添加引号保护
//! let safe_path = quote_path_if_needed("C:\\Program Files\\tool.exe");
//! // 结果: "C:\\Program Files\\tool.exe"
//!
//! // 构建安全的命令参数
//! let args = build_safe_command_args(&[
//!     "python",
//!     "C:\\Program Files\\script.py",
//!     "C:\\Users\\User Name\\file.txt"
//! ]);
//! ```

/// 检查路径是否包含空格或其他需要引号保护的字符
pub fn needs_quoting(path: &str) -> bool {
    // 检查是否包含空格、制表符或其他特殊字符
    path.contains(' ')
        || path.contains('\t')
        || path.contains('&')
        || path.contains('|')
        || path.contains('<')
        || path.contains('>')
        || path.contains('^')
        || path.contains('(')
        || path.contains(')')
        || path.contains('%')
}

/// 为路径添加引号保护（如果需要）
pub fn quote_path_if_needed(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }

    // 如果路径已经被引号包围，直接返回
    if (path.starts_with('"') && path.ends_with('"'))
        || (path.starts_with('\'') && path.ends_with('\''))
    {
        return path.to_string();
    }

    // 如果需要引号保护，添加双引号
    if needs_quoting(path) {
        format!("\"{}\"", path.replace('"', "\\\""))
    } else {
        path.to_string()
    }
}

/// 为Shell命令转义路径
pub fn escape_path_for_shell(path: &str) -> String {
    if path.is_empty() {
        return String::new();
    }

    #[cfg(target_os = "windows")]
    {
        // Windows下使用双引号包装
        quote_path_if_needed(path)
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix系统下转义特殊字符
        if needs_quoting(path) {
            // 使用单引号包装，并转义内部的单引号
            format!("'{}'", path.replace('\'', "'\"'\"'"))
        } else {
            path.to_string()
        }
    }
}

/// 构建安全的命令参数列表
pub fn build_safe_command_args(args: &[&str]) -> Vec<String> {
    args.iter().map(|arg| quote_path_if_needed(arg)).collect()
}

/// 构建安全的命令字符串（用于传递给shell）
pub fn build_safe_command_string(program: &str, args: &[&str]) -> String {
    let safe_program = escape_path_for_shell(program);
    let safe_args: Vec<String> = args.iter().map(|arg| escape_path_for_shell(arg)).collect();

    if safe_args.is_empty() {
        safe_program
    } else {
        format!("{} {}", safe_program, safe_args.join(" "))
    }
}

/// 替换字符串中的路径变量，并确保路径安全
pub fn replace_path_variables_safely(
    template: &str,
    variables: &std::collections::HashMap<String, String>,
) -> String {
    let mut result = template.to_string();

    for (key, value) in variables {
        let placeholder = format!("{{{}}}", key);
        if result.contains(&placeholder) {
            // 检查这个变量是否可能是路径
            // 注意：需要排除 "profile" 这类包含 "file" 子串但并非路径的变量
            let is_path_variable = key.contains("path")
                || key.contains("dir")
                || key.contains("directory")
                || (key.contains("file") && !key.contains("profile"))
                || value.contains('\\')
                || value.contains('/');

            if is_path_variable {
                // 检查占位符周围是否已经有引号
                let placeholder_with_quotes = format!("\"{}\"", placeholder);
                if result.contains(&placeholder_with_quotes) {
                    // 如果已经有引号包围，直接替换，不添加额外引号
                    result = result.replace(&placeholder_with_quotes, &format!("\"{}\"", value));
                } else {
                    // 否则检查是否需要添加引号保护
                    let safe_value = quote_path_if_needed(value);
                    result = result.replace(&placeholder, &safe_value);
                }
            } else {
                // 非路径变量直接替换
                result = result.replace(&placeholder, value);
            }
        }
    }

    result
}

/// 为Volatility命令构建参数列表
pub fn build_volatility_args(
    python_path: &str,
    volatility_path: &str,
    image_path: &str,
    additional_args: &[&str],
) -> Vec<String> {
    let mut args = vec![
        python_path.to_string(),
        volatility_path.to_string(),
        "-f".to_string(),
        image_path.to_string(),
    ];

    // 添加其他参数
    for arg in additional_args {
        args.push(arg.to_string());
    }

    args
}

/// 为Python脚本执行构建参数列表
pub fn build_python_script_args(
    _python_path: &str,
    script_path: &str,
    file_path: &str,
    output_dir: &str,
    additional_args: &[String],
) -> Vec<String> {
    let mut args = vec![
        script_path.to_string(),
        file_path.to_string(),
        output_dir.to_string(),
    ];

    // 添加其他参数
    for arg in additional_args {
        args.push(arg.clone());
    }

    args
}

/// 检查并修复命令字符串中的路径问题
pub fn fix_command_paths(command: &str) -> String {
    // 如果命令已经包含引号，很可能路径已经被正确处理了
    // 直接返回原命令，避免重复添加引号
    if command.contains('"') || command.contains('\'') {
        return command.to_string();
    }

    // 简单的方法：分割命令并检查每个部分
    let parts: Vec<&str> = command.split_whitespace().collect();
    let mut result_parts = Vec::new();

    for part in parts {
        // 检查是否是Windows路径格式且包含空格
        if part.len() > 3
            && part.chars().nth(1) == Some(':')
            && part.chars().nth(2) == Some('\\')
            && part.contains(' ')
        {
            // 这是一个包含空格的Windows路径，添加引号
            result_parts.push(format!("\"{}\"", part));
        } else if part.starts_with('.')
            && (part.contains('/') || part.contains('\\'))
            && part.contains(' ')
        {
            // 这是一个包含空格的相对路径，添加引号
            result_parts.push(format!("\"{}\"", part));
        } else {
            // 其他情况保持原样
            result_parts.push(part.to_string());
        }
    }

    result_parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_needs_quoting() {
        assert!(needs_quoting("C:\\Program Files\\tool.exe"));
        assert!(needs_quoting("path with spaces"));
        assert!(needs_quoting("path\twith\ttabs"));
        assert!(!needs_quoting("C:\\ProgramFiles\\tool.exe"));
        assert!(!needs_quoting("simple_path"));
    }

    #[test]
    fn test_quote_path_if_needed() {
        assert_eq!(
            quote_path_if_needed("C:\\Program Files\\tool.exe"),
            "\"C:\\Program Files\\tool.exe\""
        );
        assert_eq!(
            quote_path_if_needed("C:\\ProgramFiles\\tool.exe"),
            "C:\\ProgramFiles\\tool.exe"
        );
        assert_eq!(
            quote_path_if_needed("\"already quoted\""),
            "\"already quoted\""
        );
        assert_eq!(quote_path_if_needed(""), "");
    }

    #[test]
    fn test_build_safe_command_args() {
        let args = build_safe_command_args(&[
            "python",
            "C:\\Program Files\\script.py",
            "C:\\Users\\User Name\\file.txt",
            "simple_arg",
        ]);

        assert_eq!(args[0], "python");
        assert_eq!(args[1], "\"C:\\Program Files\\script.py\"");
        assert_eq!(args[2], "\"C:\\Users\\User Name\\file.txt\"");
        assert_eq!(args[3], "simple_arg");
    }

    #[test]
    fn test_replace_path_variables_safely() {
        let mut variables = HashMap::new();
        variables.insert(
            "file_path".to_string(),
            "C:\\Program Files\\file.txt".to_string(),
        );
        variables.insert("simple_var".to_string(), "value".to_string());

        let template = "command {file_path} --option {simple_var}";
        let result = replace_path_variables_safely(template, &variables);

        assert_eq!(
            result,
            "command \"C:\\Program Files\\file.txt\" --option value"
        );
    }
}

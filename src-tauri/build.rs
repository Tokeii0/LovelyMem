fn main() {
    // Windows: 增加主线程栈大小到 8MB，防止 stack overflow 闪退
    // 默认 1MB 栈在注册 150+ Tauri 命令 + 大型 async 状态机时可能溢出
    #[cfg(target_os = "windows")]
    {
        println!("cargo:rustc-link-arg=/STACK:8388608");
    }

    tauri_build::build()
}

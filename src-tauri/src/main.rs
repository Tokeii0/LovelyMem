// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// 注释掉下面这行来启用控制台窗口进行调试
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lovelymem_v2_lib::run()
}

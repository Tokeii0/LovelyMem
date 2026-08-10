use crate::settings;
use portable_pty::{CommandBuilder, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, State};

pub struct TerminalSession {
    pub writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    pub master: Arc<Mutex<Option<Box<dyn MasterPty + Send>>>>,
}

impl TerminalSession {
    pub fn new() -> Self {
        Self {
            writer: Arc::new(Mutex::new(None)),
            master: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub async fn init_shell(
    app: AppHandle,
    state: State<'_, TerminalSession>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut writer_guard = state.writer.lock().map_err(|e| e.to_string())?;

    let pty_system = NativePtySystem::default();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let cmd = CommandBuilder::new("powershell");
    #[cfg(not(target_os = "windows"))]
    let cmd = CommandBuilder::new("bash");

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Inject aliases
    if let Ok(settings) = settings::load_settings() {
        let mut setup_commands = String::new();
        #[cfg(target_os = "windows")]
        {
            // 检查是否有加载的镜像
            let image_flag = if !settings.current_image_path.is_empty() {
                format!("-f \"{}\"", settings.current_image_path)
            } else {
                String::new()
            };

            if !settings.python2_path.is_empty() && !settings.volatility2_path.is_empty() {
                if !image_flag.is_empty() {
                    setup_commands.push_str(&format!(
                        "function vol2 {{ & \"{}\" \"{}\" {} $args }}\n",
                        settings.python2_path, settings.volatility2_path, image_flag
                    ));
                } else {
                    setup_commands.push_str(&format!(
                        "function vol2 {{ & \"{}\" \"{}\" $args }}\n",
                        settings.python2_path, settings.volatility2_path
                    ));
                }
            }

            if !settings.python3_path.is_empty() && !settings.volatility3_path.is_empty() {
                if !image_flag.is_empty() {
                    setup_commands.push_str(&format!(
                        "function vol3 {{ & \"{}\" \"{}\" {} $args }}\n",
                        settings.python3_path, settings.volatility3_path, image_flag
                    ));
                } else {
                    setup_commands.push_str(&format!(
                        "function vol3 {{ & \"{}\" \"{}\" $args }}\n",
                        settings.python3_path, settings.volatility3_path
                    ));
                }
            }

            if !settings.python2_path.is_empty() {
                setup_commands.push_str(&format!(
                    "function python2 {{ & \"{}\" $args }}\n",
                    settings.python2_path
                ));
            }

            if !settings.python3_path.is_empty() {
                setup_commands.push_str(&format!(
                    "function python3 {{ & \"{}\" $args }}\n",
                    settings.python3_path
                ));
            }

            setup_commands.push_str("Clear-Host\n");
        }

        if !setup_commands.is_empty() {
            let _ = writer.write_all(setup_commands.as_bytes());
        }
    }

    *writer_guard = Some(writer);

    let mut master_guard = state.master.lock().map_err(|e| e.to_string())?;
    *master_guard = Some(pair.master);

    // Spawn thread to read from PTY
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let _ = app_handle.emit("terminal-output", output);
                }
                Ok(_) => break,  // EOF
                Err(_) => break, // Error
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn write_to_shell(data: String, state: State<'_, TerminalSession>) -> Result<(), String> {
    let mut writer_guard = state.writer.lock().map_err(|e| e.to_string())?;
    if let Some(writer) = writer_guard.as_mut() {
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Shell not initialized".to_string())
    }
}

#[tauri::command]
pub async fn resize_terminal(
    cols: u16,
    rows: u16,
    state: State<'_, TerminalSession>,
) -> Result<(), String> {
    let master_guard = state.master.lock().map_err(|e| e.to_string())?;
    if let Some(master) = master_guard.as_ref() {
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Shell not initialized".to_string())
    }
}

#[derive(serde::Serialize)]
pub struct TerminalResult {
    pub success: bool,
    pub output: String,
    pub error: String,
}

#[tauri::command]
pub async fn execute_simple_terminal_command(
    command_str: String,
) -> Result<TerminalResult, String> {
    use std::process::Command;

    let settings = settings::load_settings().map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let (shell, arg) = ("powershell", "-Command");
    #[cfg(not(target_os = "windows"))]
    let (shell, arg) = ("sh", "-c");

    let mut final_command = command_str.clone();
    let parts: Vec<&str> = final_command.split_whitespace().collect();
    if let Some(cmd) = parts.first() {
        // 检查是否有加载的镜像
        let image_flag = if !settings.current_image_path.is_empty() {
            format!("-f \"{}\"", settings.current_image_path)
        } else {
            String::new()
        };

        let replacement = match *cmd {
            "vol2" => {
                if !image_flag.is_empty() {
                    Some(format!(
                        "& \"{}\" \"{}\" {}",
                        settings.python2_path, settings.volatility2_path, image_flag
                    ))
                } else {
                    Some(format!(
                        "& \"{}\" \"{}\"",
                        settings.python2_path, settings.volatility2_path
                    ))
                }
            }
            "vol3" => {
                if !image_flag.is_empty() {
                    Some(format!(
                        "& \"{}\" \"{}\" {}",
                        settings.python3_path, settings.volatility3_path, image_flag
                    ))
                } else {
                    Some(format!(
                        "& \"{}\" \"{}\"",
                        settings.python3_path, settings.volatility3_path
                    ))
                }
            }
            "python2" => Some(format!("& \"{}\"", settings.python2_path)),
            "python3" => Some(format!("& \"{}\"", settings.python3_path)),
            _ => None,
        };

        if let Some(repl) = replacement {
            final_command = final_command.replacen(cmd, &repl, 1);
        }
    }

    let output = Command::new(shell)
        .args(&[arg, &final_command])
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    Ok(TerminalResult {
        success: output.status.success(),
        output: stdout,
        error: stderr,
    })
}

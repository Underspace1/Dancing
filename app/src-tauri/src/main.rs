// Dancing! native shell: starts the bundled Node server (danser + tosu live in runtime/) without a console,
// shows the splash, which then opens the editor, and stops the server and everything it started on close.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

struct Server(Mutex<Option<Child>>);

const NO_WINDOW: u32 = 0x0800_0000;

fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(NO_WINDOW);
    }
    cmd
}

fn app_dir() -> PathBuf {
    // Dancing!.exe sits next to server.mjs; during development it lives in target/<profile>.
    let exe = std::env::current_exe().unwrap_or_default();
    let mut dir = exe.parent().map(PathBuf::from).unwrap_or_default();
    for _ in 0..5 {
        if dir.join("server.mjs").exists() {
            return dir;
        }
        if !dir.pop() {
            break;
        }
    }
    exe.parent().map(PathBuf::from).unwrap_or_default()
}

fn start_server() -> Option<Child> {
    let dir = app_dir();
    let bundled = dir.join("runtime/node.exe");
    let mut cmd = if bundled.is_file() { Command::new(bundled) } else { Command::new("node") };
    cmd.arg("server.mjs").current_dir(dir);
    hidden(&mut cmd).spawn().ok()
}

fn stop_tree(child: &mut Child) {
    // Kills node and what it started (danser, ffmpeg, tosu, headless capture).
    let _ = hidden(Command::new("taskkill").args(["/PID", &child.id().to_string(), "/T", "/F"])).status();
    let _ = child.kill();
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let server = start_server().ok_or("Impossible de démarrer Dancing!. Vérifie les fichiers du logiciel.")?;
            app.manage(Server(Mutex::new(Some(server))));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Dancing! could not start");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<Server>() {
                if let Some(mut child) = state.0.lock().unwrap().take() {
                    stop_tree(&mut child);
                }
            }
        }
    });
}

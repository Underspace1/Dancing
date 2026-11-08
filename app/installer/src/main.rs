// Dancing! installer: a custom-UI window that unpacks the zip appended to this exe
// (layout: [installer exe][payload.zip][u64 LE payload offset]["DNCPAYLD"]).
// User data (data/, videos/, cache/) is never in the payload, so reinstalling keeps it.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs::{self, File};
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use tauri::{Emitter, Window};

const MAGIC: &[u8; 8] = b"DNCPAYLD";
const NO_WINDOW: u32 = 0x0800_0000;

fn hidden(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(NO_WINDOW);
    }
    cmd
}

/// A window onto the payload part of the exe, so the zip reader sees offset 0 = start of the zip.
struct Slice {
    file: File,
    start: u64,
    len: u64,
}
impl Read for Slice {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let pos = self.file.stream_position()? - self.start;
        let left = self.len.saturating_sub(pos) as usize;
        let n = buf.len().min(left);
        self.file.read(&mut buf[..n])
    }
}
impl Seek for Slice {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let target = match to {
            SeekFrom::Start(p) => p as i64,
            SeekFrom::End(p) => self.len as i64 + p,
            SeekFrom::Current(p) => (self.file.stream_position()? - self.start) as i64 + p,
        };
        if target < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek avant le début"));
        }
        Ok(self.file.seek(SeekFrom::Start(self.start + target as u64))? - self.start)
    }
}

fn payload() -> Result<Slice, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut file = File::open(exe).map_err(|e| e.to_string())?;
    let size = file.metadata().map_err(|e| e.to_string())?.len();
    let mut tail = [0u8; 16];
    file.seek(SeekFrom::End(-16)).map_err(|e| e.to_string())?;
    file.read_exact(&mut tail).map_err(|e| e.to_string())?;
    if &tail[8..] != MAGIC {
        return Err("Cet installateur ne contient pas Dancing!. Retélécharge-le.".into());
    }
    let start = u64::from_le_bytes(tail[..8].try_into().unwrap());
    Ok(Slice { file, start, len: size - 16 - start })
}

#[derive(Serialize)]
struct Defaults {
    dir: String,
    size_mb: u64,
    existing: bool,
    ok: bool,
}

fn default_dir() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".into());
    Path::new(&base).join("Programs").join("Dancing!")
}

#[tauri::command]
fn defaults() -> Defaults {
    let dir = default_dir();
    let archive = payload().ok().and_then(|p| zip::ZipArchive::new(p).ok());
    let ok = archive.is_some();
    let size_mb = archive
        .map(|mut z| (0..z.len()).filter_map(|i| z.by_index_raw(i).ok().map(|f| f.size())).sum::<u64>() / 1_048_576)
        .unwrap_or(0);
    Defaults { existing: dir.join("Dancing!.exe").exists(), dir: dir.to_string_lossy().into(), size_mb, ok }
}

#[tauri::command]
fn pick_folder(current: String) -> Option<String> {
    let script = format!(
        "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $d=New-Object Windows.Forms.FolderBrowserDialog; $d.Description='Dossier d''installation de Dancing!'; $d.SelectedPath='{}'; if($d.ShowDialog() -eq 'OK'){{ $d.SelectedPath }}",
        current.replace('\'', "''")
    );
    let out = hidden(Command::new("powershell.exe").args(["-NoProfile", "-STA", "-Command", &script])).output().ok()?;
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    let p = PathBuf::from(&path);
    // Always install into a "Dancing!" folder so uninstalling never wipes the chosen parent.
    Some(if p.file_name().is_some_and(|n| n == "Dancing!") { p } else { p.join("Dancing!") }.to_string_lossy().into())
}

#[derive(Clone, Serialize)]
struct Progress {
    done: usize,
    total: usize,
    name: String,
}

fn ps(script: &str) -> Result<(), String> {
    let ok = hidden(Command::new("powershell.exe").args(["-NoProfile", "-Command", script])).status().map_err(|e| e.to_string())?.success();
    if ok { Ok(()) } else { Err("Impossible de créer un raccourci.".into()) }
}

fn shortcut(lnk: &Path, target: &Path, dir: &Path) -> Result<(), String> {
    let q = |p: &Path| p.to_string_lossy().replace('\'', "''");
    ps(&format!(
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{}'); $s.TargetPath='{}'; $s.WorkingDirectory='{}'; $s.IconLocation='{},0'; $s.Save()",
        q(lnk), q(target), q(dir), q(target)
    ))
}

fn desktop_dir() -> PathBuf {
    let out = hidden(Command::new("powershell.exe").args(["-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"]))
        .output().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default();
    if out.is_empty() { Path::new(&std::env::var("USERPROFILE").unwrap_or_default()).join("Desktop") } else { PathBuf::from(out) }
}

fn do_install(report: &dyn Fn(Progress), dir: &Path, desktop: bool, start_menu: bool, register: bool) -> Result<(), String> {
    if dir.file_name().is_none_or(|n| n != "Dancing!") {
        return Err("Le dossier d'installation doit s'appeler Dancing!.".into());
    }
    let mut zip = zip::ZipArchive::new(payload()?).map_err(|e| format!("Paquet illisible : {e}"))?;
    fs::create_dir_all(dir).map_err(|e| format!("Impossible de créer le dossier : {e}"))?;
    let total = zip.len();
    for i in 0..total {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        // enclosed_name() refuses absolute paths and "..": nothing can be written outside dir.
        let Some(rel) = entry.enclosed_name() else { continue };
        let rel: PathBuf = rel.components().filter(|c| !matches!(c, Component::CurDir)).collect();
        if rel.as_os_str().is_empty() {
            continue;
        }
        let out = dir.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut file = File::create(&out).map_err(|e| format!("{} : {e}. Ferme Dancing! s'il est ouvert, puis réessaie.", rel.display()))?;
            io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
        }
        if i % 8 == 0 || i + 1 == total {
            report(Progress { done: i + 1, total, name: rel.to_string_lossy().into() });
        }
    }
    for d in ["data", "videos", "cache"] {
        let _ = fs::create_dir_all(dir.join(d));
    }
    let exe = dir.join("Dancing!.exe");
    if desktop {
        shortcut(&desktop_dir().join("Dancing!.lnk"), &exe, dir)?;
    }
    if start_menu {
        if let Ok(appdata) = std::env::var("APPDATA") {
            shortcut(&Path::new(&appdata).join("Microsoft\\Windows\\Start Menu\\Programs\\Dancing!.lnk"), &exe, dir)?;
        }
    }
    // Uninstaller: removes shortcuts and the registry entry, then asks before deleting renders and settings.
    let uninstall = dir.join("Désinstaller Dancing!.cmd");
    let desk = desktop_dir().join("Dancing!.lnk");
    let script = format!(
        "@echo off\r\nchcp 65001 >nul\r\ntitle Désinstaller Dancing!\r\ntaskkill /IM \"Dancing!.exe\" /T /F >nul 2>&1\r\n\
del \"{}\" \"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Dancing!.lnk\" >nul 2>&1\r\n\
reg delete \"HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Dancing!\" /f >nul 2>&1\r\n\
choice /M \"Supprimer aussi tes réglages, replays et vidéos\"\r\nif errorlevel 2 (\r\n\
  for /d %%D in (\"%~dp0*\") do if /i not \"%%~nxD\"==\"data\" if /i not \"%%~nxD\"==\"videos\" rd /s /q \"%%D\"\r\n\
  for %%F in (\"%~dp0*\") do if /i not \"%%~nxF\"==\"%~nx0\" del /q \"%%F\"\r\n\
  echo Dancing! est désinstallé. Tes réglages et vidéos restent dans %~dp0\r\n  pause\r\n  (goto) 2>nul & del \"%~f0\"\r\n\
) else (\r\n  cd /d \"%TEMP%\"\r\n  (goto) 2>nul & rd /s /q \"%~dp0\"\r\n)\r\n",
        desk.to_string_lossy()
    );
    fs::write(&uninstall, script).map_err(|e| e.to_string())?;
    if !register {
        return Ok(());
    }
    let key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Dancing!";
    let exe_s = exe.to_string_lossy().to_string();
    let un_s = format!("\"{}\"", uninstall.to_string_lossy());
    let dir_s = dir.to_string_lossy().to_string();
    for (name, kind, value) in [
        ("DisplayName", "REG_SZ", "Dancing!"),
        ("DisplayVersion", "REG_SZ", env!("CARGO_PKG_VERSION")),
        ("Publisher", "REG_SZ", "Dancing!"),
        ("DisplayIcon", "REG_SZ", exe_s.as_str()),
        ("InstallLocation", "REG_SZ", dir_s.as_str()),
        ("UninstallString", "REG_SZ", un_s.as_str()),
        ("NoModify", "REG_DWORD", "1"),
        ("NoRepair", "REG_DWORD", "1"),
    ] {
        let _ = hidden(Command::new("reg").args(["add", key, "/v", name, "/t", kind, "/d", value, "/f"])).status();
    }
    Ok(())
}

#[tauri::command]
fn install(window: Window, dir: String, desktop: bool, start_menu: bool) {
    std::thread::spawn(move || match do_install(&|p| { let _ = window.emit("progress", p); }, Path::new(&dir), desktop, start_menu, true) {
        Ok(()) => { let _ = window.emit("installed", ()); }
        Err(e) => { let _ = window.emit("failed", e); }
    });
}

#[tauri::command]
fn launch(app: tauri::AppHandle, dir: String) {
    let dir = PathBuf::from(dir);
    let _ = Command::new(dir.join("Dancing!.exe")).current_dir(&dir).spawn();
    app.exit(0);
}

fn main() {
    // Dancing!-Setup.exe --silent <dossier> : installation sans fenêtre ni raccourcis (déploiement, tests).
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--silent") {
        let dir = args.get(2).map(PathBuf::from).unwrap_or_else(default_dir);
        std::process::exit(match do_install(&|_| {}, &dir, false, false, false) { Ok(()) => 0, Err(_) => 1 });
    }
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![defaults, pick_folder, install, launch])
        .run(tauri::generate_context!())
        .expect("installateur Dancing!");
}

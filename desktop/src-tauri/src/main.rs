use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use semver::Version;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
    Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, State, Url,
    WindowEvent,
};

struct PtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send>>,
}

#[derive(Default)]
struct PtyState {
    sessions: Mutex<HashMap<String, Arc<PtySession>>>,
}

#[derive(Default)]
struct WebServiceState {
    owned_child: Mutex<Option<std::process::Child>>,
    shutting_down: AtomicBool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum CapsuleLocale {
    #[default]
    Zh,
    En,
}

impl CapsuleLocale {
    fn from_web_locale(value: &str) -> Self {
        if value.trim().to_ascii_lowercase().starts_with("en") {
            Self::En
        } else {
            Self::Zh
        }
    }

    fn query_value(self) -> &'static str {
        match self {
            Self::Zh => "zh",
            Self::En => "en",
        }
    }

    fn default_status(self) -> (&'static str, &'static str) {
        match self {
            Self::Zh => ("读取中", "GoalBoard 正在读取当前工作"),
            Self::En => ("Loading", "GoalBoard is reading current work"),
        }
    }

    fn recovering_status(self) -> (&'static str, &'static str) {
        match self {
            Self::Zh => (
                "连接中断",
                "暂时无法确认最新工作状态，GoalBoard 正在自动重新连接",
            ),
            Self::En => (
                "Disconnected",
                "GoalBoard is reconnecting to confirm the latest work status",
            ),
        }
    }

    fn synced_status(self) -> (&'static str, &'static str) {
        match self {
            Self::Zh => ("正在同步", "GoalBoard 已重新连接，正在读取最新工作状态"),
            Self::En => (
                "Syncing",
                "GoalBoard reconnected and is reading the latest work status",
            ),
        }
    }

    fn tray_actions(self) -> (&'static str, &'static str) {
        match self {
            Self::Zh => ("打开当前目标", "退出 GoalBoard"),
            Self::En => ("Open current Goal", "Quit GoalBoard"),
        }
    }
}

struct CapsuleTrayMenuItems {
    open_goalboard: MenuItem<tauri::Wry>,
    quit_goalboard: MenuItem<tauri::Wry>,
}

#[derive(Default)]
struct CapsuleStatusState {
    latest_path: Mutex<String>,
    visible: Mutex<bool>,
    last_tray_rect: Mutex<Option<tauri::Rect>>,
    locale: Mutex<CapsuleLocale>,
    menu_items: Mutex<Option<CapsuleTrayMenuItems>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyDataPayload {
    panel_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyExitPayload {
    panel_id: String,
}

fn goalboard_home() -> PathBuf {
    if let Ok(home) = std::env::var("GOALBOARD_HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into())).join(".goalboard")
}

fn login_shell_path() -> String {
    let output = Command::new("/bin/zsh")
        .args(["-l", "-c", r#"printf '%s' "$PATH""#])
        .output();
    match output {
        Ok(result) if result.status.success() => {
            let path = String::from_utf8_lossy(&result.stdout).trim().to_string();
            if path.is_empty() {
                std::env::var("PATH").unwrap_or_default()
            } else {
                path
            }
        }
        _ => std::env::var("PATH").unwrap_or_default(),
    }
}

fn resolve_command(command: &str, search_path: &str) -> PathBuf {
    let candidate = PathBuf::from(command);
    if candidate.is_absolute() || command.contains('/') {
        return candidate;
    }
    for dir in search_path.split(':') {
        if dir.is_empty() {
            continue;
        }
        let path = Path::new(dir).join(command);
        if path.is_file() {
            return path;
        }
    }
    candidate
}

fn web_healthy() -> bool {
    health_body()
        .map(|body| body.contains("\"status\":\"ok\"") || body.contains("\"status\": \"ok\""))
        .unwrap_or(false)
}

fn web_desktop_ready() -> bool {
    health_body()
        .map(|body| body.contains("\"desktop_tui\":true") || body.contains("\"desktop_tui\": true"))
        .unwrap_or(false)
}

fn health_body() -> Option<String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 4173));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(250)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1:4173\r\nConnection: close\r\n\r\n")
        .ok()?;
    let mut body = String::new();
    let _ = stream.read_to_string(&mut body);
    if body.contains("200") {
        Some(body)
    } else {
        None
    }
}

fn embedded_goalboard_source(resource_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    for relative in ["goalboard-runtime", "resources/goalboard-runtime"] {
        let source = resource_dir.join(relative);
        let node = source.join("runtime").join("node");
        let installer = source.join("dist").join("cli").join("main.js");
        if node.is_file() && installer.is_file() {
            return Some((source, node));
        }
    }
    None
}

#[derive(Deserialize)]
struct RuntimeVersionMetadata {
    version: String,
}

fn read_runtime_version(path: &Path) -> Option<Version> {
    let metadata = serde_json::from_slice::<RuntimeVersionMetadata>(&fs::read(path).ok()?).ok()?;
    Version::parse(metadata.version.trim()).ok()
}

fn embedded_version_is_upgrade(embedded: &Version, installed: Option<&Version>) -> bool {
    installed.map(|version| embedded > version).unwrap_or(true)
}

fn embedded_runtime_upgrade_available(resource_dir: &Path, home: &Path) -> bool {
    let Some((source, _)) = embedded_goalboard_source(resource_dir) else {
        return false;
    };
    let Some(embedded_version) = read_runtime_version(&source.join("package.json")) else {
        return false;
    };
    let installed_version = read_runtime_version(&home.join("config").join("installation.json"));
    embedded_version_is_upgrade(&embedded_version, installed_version.as_ref())
}

#[cfg(test)]
mod embedded_runtime_version_tests {
    use super::{embedded_version_is_upgrade, sync_managed_web_service_after_upgrade, Version};
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        path::PathBuf,
        process,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn only_missing_or_newer_embedded_runtimes_install() {
        let old = Version::parse("0.1.4").unwrap();
        let current = Version::parse("0.1.5").unwrap();
        let newer = Version::parse("0.1.6").unwrap();

        assert!(embedded_version_is_upgrade(&current, None));
        assert!(embedded_version_is_upgrade(&newer, Some(&current)));
        assert!(!embedded_version_is_upgrade(&current, Some(&current)));
        assert!(!embedded_version_is_upgrade(&old, Some(&current)));
    }

    #[test]
    fn embedded_runtime_upgrade_repairs_the_owned_service_configuration() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let home = std::env::temp_dir().join(format!(
            "goalboard-desktop-service-refresh-{}-{nonce}",
            process::id(),
        ));
        let bin = home.join("bin");
        let cli = bin.join("goalboard");
        let receipt = home.join("called.txt");
        fs::create_dir_all(&bin).unwrap();
        fs::write(
            &cli,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" > '{}'\n",
                receipt.display()
            ),
        )
        .unwrap();
        let mut permissions = fs::metadata(&cli).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&cli, permissions).unwrap();

        let refreshed = sync_managed_web_service_after_upgrade(&home);

        assert!(refreshed);
        assert_eq!(
            fs::read_to_string(&receipt).unwrap().trim(),
            format!(
                "service install --home {} --confirm",
                PathBuf::from(&home).display()
            ),
        );
        fs::remove_dir_all(home).unwrap();
    }
}

fn install_embedded_goalboard(resource_dir: &Path, home: &Path) -> Result<(), String> {
    let (source, node) = embedded_goalboard_source(resource_dir).ok_or_else(|| {
        "GoalBoard App 不含可用的 Runtime payload，请重新下载安装包。".to_string()
    })?;
    let installer = source.join("dist").join("cli").join("main.js");
    let output = Command::new(&node)
        .arg(&installer)
        .arg("install")
        .arg("--home")
        .arg(home)
        .arg("--source")
        .arg(&source)
        .arg("--json")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("无法运行 GoalBoard 内置安装器：{error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if detail.is_empty() {
        "GoalBoard 内置 Runtime 安装失败。".to_string()
    } else {
        format!("GoalBoard 内置 Runtime 安装失败：{detail}")
    })
}

fn sync_managed_web_service_after_upgrade(home: &Path) -> bool {
    let cli = home.join("bin").join("goalboard");
    if !cli.is_file() {
        return false;
    }
    Command::new(cli)
        .args(["service", "install", "--home"])
        .arg(home)
        .arg("--confirm")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn terminate_owned_web_child(child: &mut std::process::Child) {
    if child.try_wait().ok().flatten().is_none() {
        let pid = child.id().to_string();
        let process_group = format!("-{}", child.id());
        let _ = Command::new("/bin/kill")
            .args(["-TERM", process_group.as_str()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = Command::new("/bin/kill")
            .args(["-TERM", pid.as_str()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        for _ in 0..20 {
            if child.try_wait().ok().flatten().is_some() {
                return;
            }
            thread::sleep(Duration::from_millis(25));
        }
        let _ = Command::new("/bin/kill")
            .args(["-KILL", process_group.as_str()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn replace_owned_web_child(
    state: &WebServiceState,
    mut child: std::process::Child,
) -> Result<(), String> {
    let mut owned_child = state
        .owned_child
        .lock()
        .map_err(|error| error.to_string())?;
    if state.shutting_down.load(Ordering::Acquire) {
        drop(owned_child);
        terminate_owned_web_child(&mut child);
        return Err("GoalBoard 正在退出，不再启动 Web 服务".into());
    }
    let previous = owned_child.replace(child);
    drop(owned_child);
    if let Some(mut previous) = previous {
        terminate_owned_web_child(&mut previous);
    }
    Ok(())
}

fn stop_owned_web_service(state: &WebServiceState) -> bool {
    let child = state
        .owned_child
        .lock()
        .ok()
        .and_then(|mut child| child.take());
    if let Some(mut child) = child {
        terminate_owned_web_child(&mut child);
        return true;
    }
    false
}

fn ensure_goalboard_web(
    resource_dir: Option<&Path>,
    service_state: &WebServiceState,
) -> Result<(), String> {
    let home = goalboard_home();
    let bin = home.join("bin").join("goalboard-web");
    let upgraded_runtime = resource_dir
        .filter(|resource_dir| embedded_runtime_upgrade_available(resource_dir, &home))
        .map(|resource_dir| install_embedded_goalboard(resource_dir, &home))
        .transpose()?
        .is_some();
    if upgraded_runtime {
        let _ = sync_managed_web_service_after_upgrade(&home);
    }
    if web_healthy() {
        if !web_desktop_ready() {
            eprintln!(
        "127.0.0.1:4173 上的 GoalBoard Web 不含桌面终端。请在仓库运行 pnpm install:local 后执行 goalboard service restart --confirm，再重新打开 App。"
      );
        }
        return Ok(());
    }
    if !bin.is_file() {
        if let Some(resource_dir) = resource_dir {
            // A first-run App can seed its self-contained Runtime. Existing installs are
            // only replaced above when the bundled version is newer, so an older App can
            // never overwrite a same-version local build while the service restarts.
            install_embedded_goalboard(resource_dir, &home)?;
        }
    }
    if !bin.is_file() {
        return Err(format!(
            "GoalBoard Web 未安装：找不到 {}。源码运行请先执行 pnpm install:local。",
            bin.display()
        ));
    }
    let path = login_shell_path();
    let child = Command::new(&bin)
        .args(["--home", home.to_str().unwrap_or_default()])
        .env("PATH", &path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|error| format!("无法启动 GoalBoard Web：{error}"))?;
    replace_owned_web_child(service_state, child)?;
    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if service_state.shutting_down.load(Ordering::Acquire) {
            stop_owned_web_service(service_state);
            return Err("GoalBoard 正在退出，不再等待 Web 服务".into());
        }
        if web_healthy() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(120));
    }
    stop_owned_web_service(service_state);
    Err("GoalBoard Web 已启动，但 127.0.0.1:4173 尚未就绪".into())
}

fn drop_session(state: &PtyState, panel_id: &str) {
    let session = state
        .sessions
        .lock()
        .ok()
        .and_then(|mut sessions| sessions.remove(panel_id));
    if let Some(session) = session {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
    }
}

fn drop_all_sessions(state: &PtyState) {
    let sessions = state
        .sessions
        .lock()
        .map(|mut sessions| {
            sessions
                .drain()
                .map(|(_, session)| session)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for session in sessions {
        if let Ok(mut child) = session.child.lock() {
            let _ = child.kill();
        }
    }
}

#[tauri::command]
// These names are the stable Tauri invoke payload used by the WebView client.
// Wrapping them in an options object would change that public desktop boundary.
#[allow(clippy::too_many_arguments)]
fn pty_spawn(
    app: tauri::AppHandle,
    state: State<PtyState>,
    panel_id: String,
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<(), String> {
    let cols = cols.unwrap_or(80).max(20);
    let rows = rows.unwrap_or(24).max(8);
    let existing = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&panel_id)
        .cloned();
    if let Some(existing) = existing {
        let running = existing
            .child
            .lock()
            .ok()
            .and_then(|mut child| child.try_wait().ok())
            .flatten()
            .is_none();
        if running {
            existing
                .master
                .lock()
                .map_err(|error| error.to_string())?
                .resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                })
                .map_err(|error| error.to_string())?;
            return Ok(());
        }
    }
    drop_session(&state, &panel_id);

    let search_path = login_shell_path();
    let command = resolve_command(&command, &search_path);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let mut builder = CommandBuilder::new(command);
    if let Some(cmd_args) = args {
        for arg in cmd_args {
            builder.arg(arg);
        }
    }
    let cwd = cwd
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::var("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("/"))
        });
    builder.cwd(cwd);
    builder.env("PATH", &search_path);
    builder.env("TERM", "xterm-256color");
    builder.env("COLORTERM", "truecolor");
    if let Some(env) = env {
        for (key, value) in env {
            builder.env(key, value);
        }
    }

    let child = pair
        .slave
        .spawn_command(builder)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let session = Arc::new(PtySession {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
    });

    state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .insert(panel_id.clone(), session.clone());

    let emit_id = panel_id.clone();
    let emit_app = app.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).into_owned();
                    let _ = emit_app.emit(
                        "pty-data",
                        PtyDataPayload {
                            panel_id: emit_id.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });

    let wait_id = panel_id.clone();
    let wait_app = app.clone();
    let wait_session = session.clone();
    thread::spawn(move || {
        loop {
            let exited = wait_session
                .child
                .lock()
                .ok()
                .and_then(|mut child| child.try_wait().ok())
                .flatten()
                .is_some();
            if exited {
                break;
            }
            thread::sleep(Duration::from_millis(80));
        }
        let _ = wait_app.emit(
            "pty-exit",
            PtyExitPayload {
                panel_id: wait_id.clone(),
            },
        );
        if let Ok(mut sessions) = wait_app.state::<PtyState>().sessions.lock() {
            sessions.remove(&wait_id);
        }
    });

    Ok(())
}

#[tauri::command]
fn pty_write(state: State<PtyState>, panel_id: String, data: String) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&panel_id)
        .cloned()
        .ok_or_else(|| "终端进程不存在".to_string())?;
    let mut writer = session.writer.lock().map_err(|error| error.to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
fn pty_resize(
    state: State<PtyState>,
    panel_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .get(&panel_id)
        .cloned()
        .ok_or_else(|| "终端进程不存在".to_string())?;
    let master = session.master.lock().map_err(|error| error.to_string())?;
    master
        .resize(PtySize {
            rows: rows.max(8),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn pty_kill(state: State<PtyState>, panel_id: String) -> Result<(), String> {
    drop_session(&state, &panel_id);
    Ok(())
}

const CAPSULE_WIDTH: f64 = 420.0;
const CAPSULE_MIN_HEIGHT: f64 = 252.0;
const CAPSULE_MAX_HEIGHT: f64 = 476.0;
const CAPSULE_EDGE_MARGIN: i32 = 8;
const CAPSULE_TRAY_GAP: i32 = 5;
const APP_OWNED_WEB_FAILURES_BEFORE_RECOVERY: u8 = 2;
const MANAGED_WEB_FAILURES_BEFORE_FALLBACK: u8 = 10;

fn capsule_menu_bar_icon() -> Image<'static> {
    const SIZE: u32 = 36;
    let center = (SIZE as f32 - 1.0) / 2.0;
    let mut rgba = Vec::with_capacity((SIZE * SIZE * 4) as usize);
    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - center;
            let dy = y as f32 - center;
            let distance = (dx * dx + dy * dy).sqrt();
            let ring_distance = (distance - 10.5).abs();
            let ring_alpha = ((1.75 - ring_distance) / 0.85).clamp(0.0, 1.0);
            let dot_alpha = ((3.1 - distance) / 0.85).clamp(0.0, 1.0);
            let alpha = (ring_alpha.max(dot_alpha) * 255.0).round() as u8;
            rgba.extend_from_slice(&[0, 0, 0, alpha]);
        }
    }
    Image::new_owned(rgba, SIZE, SIZE)
}

fn anchored_capsule_position(
    tray_position: PhysicalPosition<i32>,
    tray_size: PhysicalSize<u32>,
    window_size: PhysicalSize<u32>,
    work_area: PhysicalRect<i32, u32>,
) -> PhysicalPosition<i32> {
    let tray_center_x = tray_position.x + tray_size.width as i32 / 2;
    let work_right = work_area.position.x + work_area.size.width as i32;
    let work_bottom = work_area.position.y + work_area.size.height as i32;
    let min_x = work_area.position.x + CAPSULE_EDGE_MARGIN;
    let max_x = (work_right - window_size.width as i32 - CAPSULE_EDGE_MARGIN).max(min_x);
    let x = (tray_center_x - window_size.width as i32 / 2).clamp(min_x, max_x);

    let below = tray_position.y + tray_size.height as i32 + CAPSULE_TRAY_GAP;
    let above = tray_position.y - window_size.height as i32 - CAPSULE_TRAY_GAP;
    let min_y = work_area.position.y + CAPSULE_EDGE_MARGIN;
    let max_y = (work_bottom - window_size.height as i32 - CAPSULE_EDGE_MARGIN).max(min_y);
    let preferred_y = if below + window_size.height as i32 <= work_bottom - CAPSULE_EDGE_MARGIN {
        below
    } else {
        above
    };
    PhysicalPosition::new(x, preferred_y.clamp(min_y, max_y))
}

fn validated_goalboard_path(path: &str) -> Result<&str, String> {
    if !path.starts_with("/projects/")
        || path.starts_with("//")
        || path.contains("://")
        || path.contains('\\')
        || path.contains(['\r', '\n'])
    {
        return Err("GoalBoard 页面地址无效".into());
    }
    Ok(path)
}

fn desktop_goalboard_url(path: &str) -> Result<Url, String> {
    let path = validated_goalboard_path(path)?;
    let (base, fragment) = path
        .split_once('#')
        .map_or((path, None), |(base, fragment)| (base, Some(fragment)));
    let separator = if base.contains('?') { '&' } else { '?' };
    let target = match fragment {
        Some(fragment) => format!("http://127.0.0.1:4173{base}{separator}desktop=1#{fragment}"),
        None => format!("http://127.0.0.1:4173{base}{separator}desktop=1"),
    };
    Url::parse(&target).map_err(|error| format!("GoalBoard 页面地址无效：{error}"))
}

fn capsule_web_url(locale: CapsuleLocale) -> Result<Url, String> {
    Url::parse(&format!(
        "http://127.0.0.1:4173/desktop/capsule?desktop=1&locale={}",
        locale.query_value(),
    ))
    .map_err(|error| format!("工作胶囊页面地址无效：{error}"))
}

fn current_capsule_locale(state: &CapsuleStatusState) -> Result<CapsuleLocale, String> {
    state
        .locale
        .lock()
        .map(|locale| *locale)
        .map_err(|error| error.to_string())
}

fn update_capsule_tray_menu(
    state: &CapsuleStatusState,
    locale: CapsuleLocale,
) -> Result<(), String> {
    let items = state.menu_items.lock().map_err(|error| error.to_string())?;
    let Some(items) = items.as_ref() else {
        return Ok(());
    };
    let (open_current, quit) = locale.tray_actions();
    items
        .open_goalboard
        .set_text(open_current)
        .map_err(|error| error.to_string())?;
    items
        .quit_goalboard
        .set_text(quit)
        .map_err(|error| error.to_string())
}

fn sync_capsule_locale(
    app: &tauri::AppHandle,
    state: &CapsuleStatusState,
    locale: CapsuleLocale,
) -> Result<(), String> {
    *state.locale.lock().map_err(|error| error.to_string())? = locale;
    update_capsule_tray_menu(state, locale)?;
    let (title, tooltip) = locale.default_status();
    set_capsule_connection_status(app, title, tooltip)?;
    if let Some(capsule) = app.get_webview_window("capsule") {
        capsule
            .navigate(capsule_web_url(locale)?)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn hide_capsule_window(app: &tauri::AppHandle, state: &CapsuleStatusState) -> Result<(), String> {
    let window = app
        .get_webview_window("capsule")
        .ok_or_else(|| "工作胶囊窗口不存在".to_string())?;
    window.hide().map_err(|error| error.to_string())?;
    *state.visible.lock().map_err(|error| error.to_string())? = false;
    Ok(())
}

fn set_capsule_connection_status(
    app: &tauri::AppHandle,
    title: &str,
    tooltip: &str,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("goalboard-status")
        .ok_or_else(|| "GoalBoard 菜单栏状态不存在".to_string())?;
    tray.set_title(Some(title))
        .map_err(|error| error.to_string())?;
    tray.set_tooltip(Some(tooltip))
        .map_err(|error| error.to_string())
}

fn should_keep_window_on_close(label: &str) -> bool {
    label == "main"
}

fn should_attempt_web_recovery(consecutive_failures: u8, owns_web_child: bool) -> bool {
    let threshold = if owns_web_child {
        APP_OWNED_WEB_FAILURES_BEFORE_RECOVERY
    } else {
        MANAGED_WEB_FAILURES_BEFORE_FALLBACK
    };
    consecutive_failures >= threshold
}

fn goalboard_reload_url(current: Option<Url>, fallback: &str) -> Option<Url> {
    let mut url = current
        .filter(|url| {
            url.scheme() == "http"
                && url.host_str() == Some("127.0.0.1")
                && url.port_or_known_default() == Some(4173)
        })
        .or_else(|| Url::parse(fallback).ok())?;
    let query = url
        .query_pairs()
        .filter(|(key, _)| key != "desktop")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    url.query_pairs_mut()
        .clear()
        .extend_pairs(query)
        .append_pair("desktop", "1");
    Some(url)
}

fn reload_goalboard_webviews(app: &tauri::AppHandle) {
    if let Some(capsule) = app.get_webview_window("capsule") {
        let state = app.state::<CapsuleStatusState>();
        let locale = current_capsule_locale(state.inner()).unwrap_or_default();
        if let Ok(url) = capsule_web_url(locale) {
            let _ = capsule.navigate(url);
        }
    }
    if let Some(main) = app.get_webview_window("main") {
        let target = goalboard_reload_url(main.url().ok(), "http://127.0.0.1:4173/?desktop=1");
        if let Some(url) = target {
            let _ = main.navigate(url);
        }
    }
}

fn start_web_health_monitor(app: tauri::AppHandle, resource_dir: Option<PathBuf>) {
    let _ = thread::Builder::new()
        .name("goalboard-web-health".into())
        .spawn(move || {
            let mut consecutive_failures = 0_u8;
            loop {
                thread::sleep(Duration::from_secs(2));
                let service_state = app.state::<WebServiceState>();
                if service_state.shutting_down.load(Ordering::Acquire) {
                    break;
                }
                if web_healthy() {
                    consecutive_failures = 0;
                    continue;
                }
                consecutive_failures = consecutive_failures.saturating_add(1);
                let owns_web_child = service_state
                    .owned_child
                    .lock()
                    .map(|child| child.is_some())
                    .unwrap_or(false);
                if !should_attempt_web_recovery(consecutive_failures, owns_web_child) {
                    continue;
                }
                let capsule_state = app.state::<CapsuleStatusState>();
                let locale = current_capsule_locale(capsule_state.inner()).unwrap_or_default();
                let (title, tooltip) = locale.recovering_status();
                let _ = set_capsule_connection_status(&app, title, tooltip);
                if ensure_goalboard_web(resource_dir.as_deref(), service_state.inner()).is_ok() {
                    consecutive_failures = 0;
                    let (title, tooltip) = locale.synced_status();
                    let _ = set_capsule_connection_status(&app, title, tooltip);
                    reload_goalboard_webviews(&app);
                }
            }
        });
}

fn normalized_capsule_height(height: f64) -> f64 {
    if !height.is_finite() {
        return CAPSULE_MAX_HEIGHT;
    }
    height.clamp(CAPSULE_MIN_HEIGHT, CAPSULE_MAX_HEIGHT)
}

fn position_capsule_below_tray(
    app: &tauri::AppHandle,
    rect: tauri::Rect,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("capsule")
        .ok_or_else(|| "工作胶囊窗口不存在".to_string())?;
    window
        .set_size(LogicalSize::new(
            CAPSULE_WIDTH,
            normalized_capsule_height(height),
        ))
        .map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    let tray_position = rect.position.to_physical::<i32>(scale_factor);
    let tray_size = rect.size.to_physical::<u32>(scale_factor);
    let window_size = window.outer_size().map_err(|error| error.to_string())?;
    let tray_center = PhysicalPosition::new(
        tray_position.x + tray_size.width as i32 / 2,
        tray_position.y + tray_size.height as i32 / 2,
    );
    let monitors = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let monitor = monitors
        .iter()
        .find(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            let right = position.x + size.width as i32;
            let bottom = position.y + size.height as i32;
            tray_center.x >= position.x
                && tray_center.x < right
                && tray_center.y >= position.y
                && tray_center.y < bottom
        })
        .or_else(|| monitors.first())
        .ok_or_else(|| "没有可用显示器，无法定位工作胶囊".to_string())?;
    let position =
        anchored_capsule_position(tray_position, tray_size, window_size, *monitor.work_area());
    window
        .set_position(position)
        .map_err(|error| error.to_string())?;
    let anchor_x =
        ((tray_center.x - position.x) as f64 / scale_factor).clamp(24.0, CAPSULE_WIDTH - 24.0);
    let _ = window.eval(&format!(
        "document.documentElement.style.setProperty('--capsule-anchor-x', '{anchor_x:.1}px')"
    ));
    Ok(())
}

fn toggle_capsule(
    app: &tauri::AppHandle,
    state: &CapsuleStatusState,
    rect: tauri::Rect,
) -> Result<(), String> {
    let window = app
        .get_webview_window("capsule")
        .ok_or_else(|| "工作胶囊窗口不存在".to_string())?;
    let visible = *state.visible.lock().map_err(|error| error.to_string())?;
    if visible {
        return hide_capsule_window(app, state);
    }
    *state
        .last_tray_rect
        .lock()
        .map_err(|error| error.to_string())? = Some(rect);
    position_capsule_below_tray(app, rect, CAPSULE_MAX_HEIGHT)?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    *state.visible.lock().map_err(|error| error.to_string())? = true;
    Ok(())
}

fn open_main_window(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let url = desktop_goalboard_url(path)?;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "GoalBoard 主窗口不存在".to_string())?;
    window.navigate(url).map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[tauri::command]
fn capsule_hide(app: tauri::AppHandle, state: State<CapsuleStatusState>) -> Result<(), String> {
    hide_capsule_window(&app, state.inner())
}

#[tauri::command]
fn capsule_resize(
    app: tauri::AppHandle,
    state: State<CapsuleStatusState>,
    height: f64,
) -> Result<(), String> {
    let rect = *state
        .last_tray_rect
        .lock()
        .map_err(|error| error.to_string())?;
    let Some(rect) = rect else {
        return Ok(());
    };
    position_capsule_below_tray(&app, rect, height)
}

#[tauri::command]
fn capsule_update_menu_bar(
    app: tauri::AppHandle,
    state: State<CapsuleStatusState>,
    title: String,
    tooltip: String,
    path: String,
) -> Result<(), String> {
    let title = title.trim();
    let tooltip = tooltip.trim();
    if title.is_empty() || title.chars().count() > 24 {
        return Err("菜单栏状态文字无效".into());
    }
    if tooltip.is_empty() || tooltip.chars().count() > 320 {
        return Err("菜单栏说明文字无效".into());
    }
    validated_goalboard_path(&path)?;
    set_capsule_connection_status(&app, title, tooltip)?;
    *state
        .latest_path
        .lock()
        .map_err(|error| error.to_string())? = path;
    Ok(())
}

#[tauri::command]
fn capsule_set_locale(
    app: tauri::AppHandle,
    state: State<CapsuleStatusState>,
    locale: String,
) -> Result<(), String> {
    sync_capsule_locale(&app, state.inner(), CapsuleLocale::from_web_locale(&locale))
}

#[tauri::command]
fn capsule_open_main(
    app: tauri::AppHandle,
    state: State<CapsuleStatusState>,
    path: String,
) -> Result<(), String> {
    validated_goalboard_path(&path)?;
    *state
        .latest_path
        .lock()
        .map_err(|error| error.to_string())? = path.clone();
    hide_capsule_window(&app, state.inner())?;
    open_main_window(&app, &path)
}

fn install_goalboard_tray(app: &tauri::App) -> tauri::Result<()> {
    let state = app.state::<CapsuleStatusState>();
    let locale = current_capsule_locale(state.inner()).unwrap_or_default();
    let (open_current, quit) = locale.tray_actions();
    let open_goalboard_item =
        MenuItem::with_id(app, "open_goalboard", open_current, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit_goalboard", quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_goalboard_item, &separator, &quit_item])?;
    let (title, tooltip) = locale.default_status();
    TrayIconBuilder::with_id("goalboard-status")
        .icon(capsule_menu_bar_icon())
        .icon_as_template(true)
        .title(title)
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                rect,
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } = event
            {
                let app = tray.app_handle();
                let state = app.state::<CapsuleStatusState>();
                let _ = toggle_capsule(app, state.inner(), rect);
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_goalboard" => {
                let path = app
                    .state::<CapsuleStatusState>()
                    .latest_path
                    .lock()
                    .ok()
                    .map(|value| value.clone())
                    .filter(|value| !value.is_empty())
                    .unwrap_or_else(|| "/projects/".into());
                if path == "/projects/" {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                } else {
                    let _ = open_main_window(app, &path);
                }
            }
            "quit_goalboard" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    if let Ok(mut menu_items) = state.menu_items.lock() {
        *menu_items = Some(CapsuleTrayMenuItems {
            open_goalboard: open_goalboard_item,
            quit_goalboard: quit_item,
        });
    }
    Ok(())
}

#[cfg(test)]
fn pty_collect_output(command: &str, args: &[&str], cwd: &Path) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;
    let mut builder = CommandBuilder::new(command);
    for arg in args {
        builder.arg(*arg);
    }
    builder.cwd(cwd);
    let mut child = pair
        .slave
        .spawn_command(builder)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let mut output = String::new();
    let mut buffer = [0_u8; 1024];
    let deadline = Instant::now() + Duration::from_secs(3);
    while Instant::now() < deadline {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => output.push_str(&String::from_utf8_lossy(&buffer[..count])),
            Err(_) => break,
        }
        if child.try_wait().ok().flatten().is_some()
            && output.contains(args.last().copied().unwrap_or(""))
        {
            break;
        }
    }
    let _ = child.kill();
    Ok(output)
}

fn main() {
    let app = tauri::Builder::default()
    .manage(PtyState::default())
    .manage(WebServiceState::default())
    .manage(CapsuleStatusState::default())
    .invoke_handler(tauri::generate_handler![
      pty_spawn,
      pty_write,
      pty_resize,
      pty_kill,
      capsule_hide,
      capsule_resize,
      capsule_update_menu_bar,
      capsule_set_locale,
      capsule_open_main
    ])
    .setup(|app| {
      install_goalboard_tray(app)?;
      let resource_dir = app.path().resource_dir().ok();
      let service_state = app.state::<WebServiceState>();
      let result = ensure_goalboard_web(resource_dir.as_deref(), service_state.inner());
      if let Some(window) = app.get_webview_window("main") {
        match result {
          Ok(()) => {
            if let Ok(url) = Url::parse("http://127.0.0.1:4173/?desktop=1") {
              let _ = window.navigate(url);
            }
            if let Some(capsule) = app.get_webview_window("capsule") {
              let capsule_state = app.state::<CapsuleStatusState>();
              let locale = current_capsule_locale(capsule_state.inner()).unwrap_or_default();
              if let Ok(url) = capsule_web_url(locale) {
                let _ = capsule.navigate(url);
              }
            }
          }
          Err(error) => {
            eprintln!("{error}");
            let message = serde_json::to_string(&error)
              .unwrap_or_else(|_| "\"GoalBoard 启动失败\"".into());
            let script = format!(
              r#"document.body.innerHTML='<main style="font:14px -apple-system,sans-serif;max-width:640px;margin:12vh auto;padding:32px;color:#20232a"><h1 style="font-size:24px">GoalBoard 无法启动</h1><p id="goalboard-bootstrap-error" style="line-height:1.7;color:#5f6673"></p></main>';document.getElementById('goalboard-bootstrap-error').textContent={message};"#
            );
            let _ = window.eval(&script);
          }
        }
      }
      start_web_health_monitor(app.handle().clone(), resource_dir);
      Ok(())
    })
    .on_page_load(|window, payload| {
      if payload.event() == PageLoadEvent::Finished {
        if window.label() == "main" {
          let _ = window.eval(
            r#"(() => {
              const locale = String(document.documentElement.lang || "zh").toLowerCase().startsWith("en") ? "en" : "zh";
              globalThis.__TAURI__?.core?.invoke?.("capsule_set_locale", { locale }).catch(() => {});
            })();"#,
          );
        }
      }
    })
    .on_window_event(|window, event| {
      if window.label() == "capsule" && matches!(event, WindowEvent::Focused(false)) {
        let app = window.app_handle();
        let state = app.state::<CapsuleStatusState>();
        let _ = hide_capsule_window(app, state.inner());
      }
      if should_keep_window_on_close(window.label()) {
        if let WindowEvent::CloseRequested { api, .. } = event {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building GoalBoard desktop");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            drop_all_sessions(app.state::<PtyState>().inner());
            let web_service = app.state::<WebServiceState>();
            web_service.shutting_down.store(true, Ordering::Release);
            stop_owned_web_service(web_service.inner());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{
        anchored_capsule_position, capsule_menu_bar_icon, capsule_web_url, desktop_goalboard_url,
        goalboard_reload_url, normalized_capsule_height, pty_collect_output,
        should_attempt_web_recovery, should_keep_window_on_close, stop_owned_web_service,
        validated_goalboard_path, CapsuleLocale, WebServiceState,
    };
    use std::{env, process::Command};
    use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize, Url};

    #[test]
    fn echo_through_pty() {
        let output = pty_collect_output("/bin/echo", &["goalboard-pty"], &env::temp_dir())
            .expect("pty echo");
        assert!(
            output.contains("goalboard-pty"),
            "unexpected PTY output: {output:?}"
        );
    }

    #[test]
    fn capsule_position_is_centered_below_the_menu_bar_item() {
        let position = anchored_capsule_position(
            PhysicalPosition::new(740, 0),
            PhysicalSize::new(42, 48),
            PhysicalSize::new(784, 808),
            PhysicalRect {
                position: PhysicalPosition::new(0, 48),
                size: PhysicalSize::new(1728, 1069),
            },
        );
        assert_eq!(position, PhysicalPosition::new(369, 56));
    }

    #[test]
    fn capsule_height_fits_content_within_a_safe_range() {
        assert_eq!(normalized_capsule_height(120.0), 252.0);
        assert_eq!(normalized_capsule_height(338.0), 338.0);
        assert_eq!(normalized_capsule_height(900.0), 476.0);
        assert_eq!(normalized_capsule_height(f64::NAN), 476.0);
    }

    #[test]
    fn capsule_position_stays_inside_the_active_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(0, 48),
            size: PhysicalSize::new(1728, 1069),
        };
        let right_edge = anchored_capsule_position(
            PhysicalPosition::new(1700, 0),
            PhysicalSize::new(28, 48),
            PhysicalSize::new(784, 808),
            work_area,
        );
        assert_eq!(right_edge.x, 936);
        assert!(right_edge.y >= 48);

        let short_screen = anchored_capsule_position(
            PhysicalPosition::new(740, 880),
            PhysicalSize::new(42, 32),
            PhysicalSize::new(784, 808),
            PhysicalRect {
                position: PhysicalPosition::new(0, 0),
                size: PhysicalSize::new(1728, 940),
            },
        );
        assert_eq!(short_screen.y, 67);
    }

    #[test]
    fn menu_bar_icon_is_a_transparent_retina_template() {
        let icon = capsule_menu_bar_icon();
        assert_eq!((icon.width(), icon.height()), (36, 36));
        let alpha = |x: usize, y: usize| icon.rgba()[(y * 36 + x) * 4 + 3];
        assert_eq!(alpha(0, 0), 0);
        assert!(alpha(18, 18) > 220);
        assert!(alpha(28, 18) > 150);
        let transparent = icon
            .rgba()
            .chunks_exact(4)
            .filter(|pixel| pixel[3] == 0)
            .count();
        assert!(transparent > 800);
    }

    #[test]
    fn capsule_only_opens_local_project_paths() {
        assert!(validated_goalboard_path("/projects/project-a/goals/goal-a").is_ok());
        assert!(validated_goalboard_path("https://example.com/projects/project-a").is_err());
        assert!(validated_goalboard_path("//example.com/projects/project-a").is_err());
        let url =
            desktop_goalboard_url("/projects/project-a/decisions#decision-goal-goal-a").unwrap();
        assert_eq!(
            url.as_str(),
            "http://127.0.0.1:4173/projects/project-a/decisions?desktop=1#decision-goal-goal-a"
        );
    }

    #[test]
    fn capsule_locale_controls_its_url_and_native_menu_copy() {
        assert_eq!(CapsuleLocale::from_web_locale("en-US"), CapsuleLocale::En);
        assert_eq!(CapsuleLocale::from_web_locale("zh-CN"), CapsuleLocale::Zh);
        assert_eq!(
            capsule_web_url(CapsuleLocale::En).unwrap().as_str(),
            "http://127.0.0.1:4173/desktop/capsule?desktop=1&locale=en"
        );
        assert_eq!(
            CapsuleLocale::En.tray_actions(),
            ("Open current Goal", "Quit GoalBoard")
        );
        assert_eq!(
            CapsuleLocale::Zh.tray_actions(),
            ("打开当前目标", "退出 GoalBoard")
        );
    }

    #[test]
    fn desktop_recovery_preserves_only_local_goalboard_navigation() {
        let current =
            Url::parse("http://127.0.0.1:4173/projects/project-a/goals/goal-a?desktop=1").unwrap();
        assert_eq!(
            goalboard_reload_url(Some(current.clone()), "http://127.0.0.1:4173/?desktop=1"),
            Some(current)
        );
        assert_eq!(
            goalboard_reload_url(
                Url::parse("https://example.com/not-goalboard").ok(),
                "http://127.0.0.1:4173/?desktop=1"
            )
            .unwrap()
            .as_str(),
            "http://127.0.0.1:4173/?desktop=1"
        );
        assert_eq!(
            goalboard_reload_url(
                Url::parse("http://127.0.0.1:4173/projects/project-a/goals/goal-a#records").ok(),
                "http://127.0.0.1:4173/?desktop=1"
            )
            .unwrap()
            .as_str(),
            "http://127.0.0.1:4173/projects/project-a/goals/goal-a?desktop=1#records"
        );
    }

    #[test]
    fn desktop_recovery_gives_managed_service_transitions_a_wider_grace_period() {
        assert!(!should_attempt_web_recovery(1, true));
        assert!(should_attempt_web_recovery(2, true));
        assert!(!should_attempt_web_recovery(9, false));
        assert!(should_attempt_web_recovery(10, false));
        assert!(should_keep_window_on_close("main"));
        assert!(!should_keep_window_on_close("capsule"));
    }

    #[test]
    fn desktop_exit_stops_only_the_web_process_owned_by_this_app() {
        let state = WebServiceState::default();
        assert!(!stop_owned_web_service(&state));
        let child = Command::new("/bin/sleep").arg("30").spawn().unwrap();
        state.owned_child.lock().unwrap().replace(child);
        assert!(stop_owned_web_service(&state));
        assert!(!stop_owned_web_service(&state));
    }
}

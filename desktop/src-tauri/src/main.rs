use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{webview::PageLoadEvent, Emitter, Manager, State, Url};

struct PtySession {
  writer: Mutex<Box<dyn Write + Send>>,
  master: Mutex<Box<dyn MasterPty + Send>>,
  child: Mutex<Box<dyn portable_pty::Child + Send>>,
}

#[derive(Default)]
struct PtyState {
  sessions: Mutex<HashMap<String, Arc<PtySession>>>,
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
  health_body().map(|body| body.contains("\"status\":\"ok\"") || body.contains("\"status\": \"ok\"")).unwrap_or(false)
}

fn web_desktop_ready() -> bool {
  health_body().map(|body| body.contains("\"desktop_tui\":true") || body.contains("\"desktop_tui\": true")).unwrap_or(false)
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

fn ensure_goalboard_web(resource_dir: Option<&Path>) -> Result<(), String> {
  if web_healthy() {
    if !web_desktop_ready() {
      eprintln!(
        "127.0.0.1:4173 上的 GoalBoard Web 不含桌面终端。请在仓库运行 pnpm install:local 后执行 goalboard service restart --confirm，再重新打开 App。"
      );
    }
    return Ok(());
  }
  let home = goalboard_home();
  let bin = home.join("bin").join("goalboard-web");
  if let Some(resource_dir) = resource_dir {
    // The installer is idempotent. Running it before a stopped Web service also
    // upgrades older source launchers to the App's self-contained runtime.
    install_embedded_goalboard(resource_dir, &home)?;
  }
  if !bin.is_file() {
    return Err(format!(
      "GoalBoard Web 未安装：找不到 {}。源码运行请先执行 pnpm install:local。",
      bin.display()
    ));
  }
  let path = login_shell_path();
  Command::new(&bin)
    .args(["--home", home.to_str().unwrap_or_default()])
    .env("PATH", &path)
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|error| format!("无法启动 GoalBoard Web：{error}"))?;
  let deadline = Instant::now() + Duration::from_secs(8);
  while Instant::now() < deadline {
    if web_healthy() {
      return Ok(());
    }
    thread::sleep(Duration::from_millis(120));
  }
  Err("GoalBoard Web 已启动，但 127.0.0.1:4173 尚未就绪".into())
}

fn drop_session(state: &PtyState, panel_id: &str) {
  let session = state.sessions.lock().ok().and_then(|mut sessions| sessions.remove(panel_id));
  if let Some(session) = session {
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

  let child = pair.slave.spawn_command(builder).map_err(|error| error.to_string())?;
  drop(pair.slave);
  let mut reader = pair.master.try_clone_reader().map_err(|error| error.to_string())?;
  let writer = pair.master.take_writer().map_err(|error| error.to_string())?;
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
    let _ = wait_app.emit("pty-exit", PtyExitPayload { panel_id: wait_id.clone() });
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
fn pty_resize(state: State<PtyState>, panel_id: String, cols: u16, rows: u16) -> Result<(), String> {
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
  let mut child = pair.slave.spawn_command(builder).map_err(|error| error.to_string())?;
  drop(pair.slave);
  let mut reader = pair.master.try_clone_reader().map_err(|error| error.to_string())?;
  let mut output = String::new();
  let mut buffer = [0_u8; 1024];
  let deadline = Instant::now() + Duration::from_secs(3);
  while Instant::now() < deadline {
    match reader.read(&mut buffer) {
      Ok(0) => break,
      Ok(count) => output.push_str(&String::from_utf8_lossy(&buffer[..count])),
      Err(_) => break,
    }
    if child.try_wait().ok().flatten().is_some() && output.contains(args.last().copied().unwrap_or("")) {
      break;
    }
  }
  let _ = child.kill();
  Ok(output)
}

fn main() {
  tauri::Builder::default()
    .manage(PtyState::default())
    .invoke_handler(tauri::generate_handler![pty_spawn, pty_write, pty_resize, pty_kill])
    .setup(|app| {
      let resource_dir = app.path().resource_dir().ok();
      let result = ensure_goalboard_web(resource_dir.as_deref());
      if let Some(window) = app.get_webview_window("main") {
        match result {
          Ok(()) => {
            if let Ok(url) = Url::parse("http://127.0.0.1:4173/?desktop=1") {
              let _ = window.navigate(url);
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
      Ok(())
    })
    .on_page_load(|window, payload| {
      if payload.event() == PageLoadEvent::Finished {
        let _ = window.eval(
          r#"document.cookie="goalboard_desktop=1; Path=/; Max-Age=31536000; SameSite=Lax";"#,
        );
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running GoalBoard desktop");
}

#[cfg(test)]
mod tests {
  use super::pty_collect_output;
  use std::env;

  #[test]
  fn echo_through_pty() {
    let output = pty_collect_output("/bin/echo", &["goalboard-pty"], &env::temp_dir())
      .expect("pty echo");
    assert!(
      output.contains("goalboard-pty"),
      "unexpected PTY output: {output:?}"
    );
  }
}

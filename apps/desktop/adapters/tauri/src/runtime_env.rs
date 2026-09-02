use std::path::{Path, PathBuf};
use std::process::Command;

pub(crate) fn login_shell_path() -> String {
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

pub(crate) fn resolve_command(command: &str, search_path: &str) -> PathBuf {
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

# Starting GoalBoard Web from a Runtime

Use this reference only when the user explicitly asks to start or open GoalBoard Web. Service management is independent of Goal lifecycle; never use these commands to read or modify Goals, projects, bindings, Claims, Runs, or Evidence.

## 1. Inspect before acting

Run the installed, read-only status command first:

```bash
"$HOME/.goalboard/bin/goalboard" service status --home "$HOME/.goalboard" --json
```

If the launcher does not exist, say GoalBoard itself is not installed or is incomplete and point the user to the normal installation flow. Do not silently use a repository checkout, another database, or a different GoalBoard home.

## 2. Route an ordinary “启动 GoalBoard” request

Use the returned `state` exactly:

| State | Runtime action |
|---|---|
| `running` | Do not restart. Say the page is already available and return `http://127.0.0.1:4173`. |
| `absent` | Say: “这会安装 GoalBoard 的 macOS 用户级常驻后台服务。关闭终端后页面仍会运行，登录后会自动启动。要现在安装并启动吗？” Run `service install --confirm` only after an explicit yes in this conversation. |
| `stopped` | The user's explicit “启动” already authorizes starting the existing owned service. Run `service start --confirm`; return the address only after success. |
| `unhealthy` | Explain that the process exists but the page is unavailable. Run `service restart --confirm` under the user's explicit start request; return the address only after the health check succeeds. |
| `needs_repair` | Explain that GoalBoard's owned LaunchAgent uses an old or incomplete configuration and that repair will rewrite that owned configuration and restart it. Obtain explicit confirmation, then run `service install --confirm`. |
| `unavailable` | Explain the returned missing-launcher or incomplete-install message. Recommend repairing the GoalBoard installation; do not fall back to an unknown binary or service. |
| `conflict` | Explain that the same LaunchAgent name is unknown or user-modified and GoalBoard will not overwrite it. Stop and let the user resolve ownership; do not force install or start. |
| `unsupported` | Say that this operating system currently has no GoalBoard system-level persistent-service integration. Do not claim background startup. Ask whether the user wants to “临时打开 GoalBoard” in the foreground. |

The persistent commands are:

```bash
"$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard" --confirm --json
"$HOME/.goalboard/bin/goalboard" service start --home "$HOME/.goalboard" --confirm --json
"$HOME/.goalboard/bin/goalboard" service restart --home "$HOME/.goalboard" --confirm --json
```

Do not run `install --confirm` for `absent` or `needs_repair` until the required confirmation is present in the current conversation. Do not reinterpret “试试看”, silence, or an unrelated earlier approval as confirmation.

## 3. Route an explicit temporary request

“临时打开 GoalBoard” means foreground operation. First inspect status so a healthy persistent service is not given a competing process on the same port.

- If managed state is `running`, return its address instead of starting a second server.
- If an owned service process is running but unhealthy or needs repair, explain the conflict and use the controlled repair/restart route; do not start a second server on the same port.
- Otherwise run the installed foreground launcher attached to the current terminal or Runtime process:

```bash
"$HOME/.goalboard/bin/goalboard-web" --home "$HOME/.goalboard"
```

Before launching, say plainly that closing the terminal or Runtime Session stops this temporary page. Keep the process in the foreground. Do not add `nohup`, `&`, `disown`, a background shell, or a claim that it will survive logout.

## 4. Explain failures without switching paths

- If a service command fails, report its human-readable error and the returned stderr log path. Do not return the page address as though startup succeeded.
- If health readiness times out, say the process started but the page did not become usable, and point to `~/.goalboard/logs/web-service.error.log`.
- If foreground startup reports the port is already in use, re-run managed service status and report the actual state; do not pick a random port and pretend it is the configured service.
- On `unsupported`, do not use ordinary shell backgrounding. The only current fallback is an explicitly accepted foreground temporary run.
- Never turn a startup failure into CLI/SQLite Goal manipulation. Goal lifecycle remains available only through host-provided `goalboard_v1_*` MCP tools.

# Install & Maintenance (GoalBoard)

> Detailed install, update, startup, uninstall, and demo-data notes. For the quick start, see "Try it in 3 minutes" in the [README](../README.md).

## macOS Desktop installer

For macOS, download the `macos-arm64` (Apple Silicon) or `macos-x64` (Intel) DMG from [GitHub Releases](https://github.com/adeptify/GoalBoard/releases), drag GoalBoard into Applications, and launch it. The App contains architecture-matched Node, GoalBoard Core, and production dependencies. On first launch it calls the same `goalboard install` service to populate `~/.goalboard`, then starts the local Web service. It does not create a project, connect a Runtime, create demo data, or edit a user project.

Repository development provides the same release path:

```bash
pnpm desktop:build:macos    # DMG, App zip, and SHA256 under release/macos
pnpm desktop:install:macos  # install in ~/Applications; trash the previous App first
pnpm desktop:start:macos    # launch the installed App
```

For automation or acceptance checks, set `GOALBOARD_SKIP_OPEN=1` to install without opening a window. `GOALBOARD_APP_DIR` can point the script at another user-level Applications directory.

The build downloads a fixed Node LTS release and verifies it against Node's official `SHASUMS256.txt` before creating the payload. Apple Silicon and Intel are built separately so native addons are never mixed into a fake universal package. Without Developer ID and notarization credentials, local builds and manually dispatched workflows can only produce internal ad-hoc artifacts that trigger Gatekeeper; the scripts do not remove quarantine on the user's behalf. A public `v*` tag release requires all Apple Secrets, then Tauri signs, notarizes, staples, and publishes both architectures.

## Install boundaries

`goalboard install` only maintains `~/.goalboard`: the versioned program, shared Skill, MCP/Web/CLI launchers, project DB root, logs, and install manifest. It never creates or starts projects, never writes into user projects, and never modifies any Runtime user-level configuration. Registering the MCP entry into a Runtime later requires the user-confirmed Runtime integration flow.

For local installs from the repository use `pnpm install:local`; this single entry point rebuilds first, then installs the current content. If you point `goalboard install --source ...` directly at a repository containing `src/`, the installer checks the build fingerprint and stops if source and `dist` disagree instead of silently copying a stale build. The release also records a content digest: when the version is the same but program or Skill content changed, it refreshes atomically; only when the content is identical does it report "already up to date". A failed refresh restores the previous release; project data is never part of the replacement.

Projects use an immutable `project_id`; display names can be renamed or duplicated, and every project has its own `goalboard.db`. `projects/catalog.db` stores project identity, DB location, optional Session bindings, historical workspace-to-project associations, a user-set unique default project, and deletion receipts; it never copies Goal facts and never depends on Git. A normal project selection does not automatically become the directory default; a new Session sees historical candidates and asks. Only after the user explicitly sets a default does it restore automatically. Unbinding an association does not delete the project; deleting a project and its DB requires separate confirmation and is refused while valid Claims or unfinished Runs exist.

## Updating an existing install

If you already installed from the repository, pull the new content first, then use the same install entry point. Even when the version number doesn't change, the installer compares the actual content and refreshes the program and Skill; user projects, Runtime configuration, and demos are never rewritten automatically:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm install:local

# When the persistent Web service is in use, explicitly restart it onto the new release
"$HOME/.goalboard/bin/goalboard" service restart --home "$HOME/.goalboard" --confirm
```

After updating MCP or the Skill, also open a new Runtime Session, because an already-running Session does not reload tools. To make the built-in demo use the new example content, run `goalboard demo reset --confirm` separately; it clears changes inside the demo but never touches user projects.

If an older Session then reports a catalog schema above its reader's supported range, the running MCP is stale; the database is not damaged. Do not roll back `catalog.db` or bypass writes through SQLite, CLI, or Web. Create or Fork a Session, confirm that messages actually have the new task focus, and perform a read-only GoalBoard project resolution before any write. A host navigation success alone does not prove that the next message will land in the new task.

## Demo data

Both the CLI and Web "Settings → Projects" can create the same demo data. Preview first, then write only after explicit confirmation:

```bash
"$HOME/.goalboard/bin/goalboard" demo create
"$HOME/.goalboard/bin/goalboard" demo create --confirm
"$HOME/.goalboard/bin/goalboard" demo reset --confirm
"$HOME/.goalboard/bin/goalboard" demo remove --confirm
```

This project is clearly marked `regenerable_demo` in the catalog, separate from `user` and `migrated_user` data. Re-creating opens the existing demo; resetting clears changes inside the demo; removal and normal uninstall only clean up the regenerable demo and never touch user projects. Repository development and screenshots can still use `examples/seed-demo.mts`, which calls the same classification and rebuild logic.

## Starting Web: persistent or temporary

In a Runtime already connected to the GoalBoard Skill, you can say:

> Start GoalBoard

The Runtime first does a read-only `goalboard service status` check and does not guess the desired lifetime. On macOS, if no persistent service exists and the user only says “start/open GoalBoard”, the Runtime presents one choice between temporary foreground use, which ends with the current terminal or Session, and login-persistent use, which installs GoalBoard's owned user LaunchAgent, survives terminal closure, and starts after login. It follows the explicit choice without a repeated confirmation; before that choice it starts no Web process and writes no system configuration.

An explicit request for temporary use is already foreground-start authority, so the Runtime explains the lifetime and proceeds. An explicit request to enable login persistence is already first-install authority, so it explains the LaunchAgent effect and proceeds. Repairing an old configuration is a separate mutation: the Runtime still explains which owned configuration will be rewritten and restarted and obtains repair-specific authority. Unknown same-name services and port conflicts are never overwritten, adopted, or stopped. A service command reports success only after the reachable page belongs to the current owned instance.

“Use GoalBoard to continue this project”, “advance this Goal”, and “connect or open a project/Goal” stay in the Runtime Goal flow and do not start Web. Web is never a prerequisite for connection, clarification, execution, or review. If the user accepts a contextual visualization offer while the service is absent, the Runtime uses the same one choice between temporary and login-persistent use.

For a temporary process tied to the current terminal, say directly:

> Open GoalBoard temporarily

This runs the foreground `goalboard-web`; the page stops when the terminal or Runtime Session closes. Non-macOS platforms currently support only this foreground mode and never fake a system-level persistent service with `nohup` or a background shell.

### Manual startup

```bash
# Web lists browsable projects only from GoalBoard's own project directory
"$HOME/.goalboard/bin/goalboard-web" --home "$HOME/.goalboard"
```

After opening `http://127.0.0.1:4173`, you can create, import, rename, and open projects in Settings, and configure Runtime integration first. Selecting a project only changes what the page browses; it does not bind or switch the current Runtime Session. Existing legacy DBs are migrated into a project only after you explicitly select and confirm. On macOS you can use the Desktop installer or run `pnpm desktop` from the repository; both are window shells over the same pages and local data.

Running `goalboard-web` directly is still foreground mode, good for temporary debugging; closing the terminal closes the page too. On macOS you can instead use the user-level LaunchAgent persistent service — preview first, then confirm:

```bash
# Preview only; writes nothing to the system
"$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard"

# Install and start after explicit confirmation; auto-starts at login and recovers after abnormal exit
"$HOME/.goalboard/bin/goalboard" service install --home "$HOME/.goalboard" --confirm

"$HOME/.goalboard/bin/goalboard" service status --home "$HOME/.goalboard"
```

`stop` only stops the current service and keeps login startup; `remove` stops and removes the LaunchAgent that GoalBoard created and that hasn't been rewritten. Logs live in `~/.goalboard/logs/web-service.log` and `web-service.error.log`. Non-macOS platforms clearly report "not supported" and never pretend to install with a background shell. You can also run the same preview and confirmation from Web "Settings → Diagnostics".

## Safe uninstall

A normal uninstall first generates a plan and changes nothing without `--confirm`. After confirmation, it removes only what GoalBoard's ownership receipt still proves it owns — Runtime integrations, LaunchAgent, launchers, and releases — and cleans up demo data explicitly marked as rebuildable. User projects, the catalog, backups, and logs are kept and remain usable after reinstall:

```bash
"$HOME/.goalboard/bin/goalboard" uninstall
"$HOME/.goalboard/bin/goalboard" uninstall --confirm
```

Permanently erasing user data is a separate operation and cannot reuse the single confirmation from a normal uninstall. The preview shows the exact home and user project count; execution requires providing both again unchanged:

```bash
"$HOME/.goalboard/bin/goalboard" uninstall --purge-user-data
"$HOME/.goalboard/bin/goalboard" uninstall --purge-user-data --confirm \
  --confirm-home "$HOME/.goalboard" --confirm-project-count N
```

If a Runtime config, Skill link, LaunchAgent, or launcher was rewritten by the user, uninstall reports the conflict and stops instead of widening the deletion scope. A failure mid-run leaves the completed steps, kept projects, and the error in `~/.goalboard/config/uninstall.json`, so you can fix the conflict, preview again, and continue.

## Next steps after install

`goalboard install` only installs the GoalBoard program and prints the install location, CLI/MCP/Web launchers, and safety boundaries; automation can use `goalboard install --json`. The install never creates projects, associates Sessions, starts services, or modifies Runtime configuration.

Runtime integration is handled by the same domain service. The current adapter read-only probes Codex and Claude Code, then generates a preview containing config paths, the GoalBoard MCP entry, the Skill link, backup location, and restart instructions; it writes only after the user explicitly confirms the current Runtime and plan. MCP and Skill are validated as one transaction; on failure, the original config bytes and Skill state are restored. Removal only undoes what the GoalBoard ownership receipt still records as untouched by the user. Unknown same-name configs or Skills show a conflict and are never overwritten.

After the integration is confirmed, **you must open a new Codex / Claude Code Session** for it to take effect: Runtimes read MCP and Skill manifests only at Session startup, and the current conversation doesn't dynamically gain just-written tools. In the new Session you can copy "continue with GoalBoard" to resume; GoalBoard shows projects previously used in the current directory and asks you to confirm. If you want a project to be entered automatically in the future, you must additionally set it as the directory default. The integration preview lists every change and this resume note item by item.

Creating a project and associating the current Session are separate operations: after the user invokes the unified Skill in the current Runtime, the Skill uses `context-list-projects`, `context-bind`, or `context-create-and-bind`, and writes into GoalBoard's own data directory only after the user explicitly chooses. Web can create, import, rename, and open projects, and manage already-confirmed Session and workspace associations; selecting a project in the page never changes the Runtime connection, and a new Session still asks by default unless the user explicitly set a directory default project.

Web only listens on loopback. The control token is stored in `config/web-control-token` under the GoalBoard home and written into the local page; all Web API write requests must also pass same-origin Origin, control token, and one-time operation key checks. Non-local Hosts, blind third-party page submissions, missing credentials, or repeated requests are rejected before reaching the project catalog, Runtime config service, or Goal Coordinator. This browser gate does not replace the confirmation and idempotency rules in each domain flow.

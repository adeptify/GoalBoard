export const SETTINGS_STYLES = `
  body.settings-page { min-height: 100%; overflow: hidden; background: var(--page); }
  .settings-page > .topbar { height: 58px; }
  .settings-page .brand { color: inherit; text-decoration: none; }
  body.settings-page[data-desktop-shell="true"] .project-context strong { display: block; }
  body.settings-page[data-desktop-shell="true"] .project-context small { display: none; }
  .settings-shell { height: calc(100dvh - 58px); min-width: 0; overflow: hidden; display: grid; grid-template-columns: 232px minmax(0, 1fr); }
  .settings-shell--standalone { grid-template-columns: minmax(0, 1fr); }
  .settings-shell--standalone .settings-document { margin-inline: auto; }
  .settings-navigation { min-height: 0; overflow-y: auto; padding: 18px 10px; border-right: 1px solid var(--line-strong); background: var(--rail); display: flex; flex-direction: column; gap: 3px; }
  .settings-nav-group { min-width: 0; display: grid; gap: 3px; }
  .settings-nav-group + .settings-nav-group { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--line); }
  .settings-nav-label { min-width: 0; padding: 0 10px 5px; display: grid; gap: 2px; color: var(--faint); }
  .settings-nav-label > span { font-size: 10px; font-weight: 750; letter-spacing: .07em; text-transform: uppercase; }
  .settings-nav-label > small { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .settings-navigation a { min-height: 50px; padding: 7px 10px; border-radius: 5px; color: var(--ink-soft); display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 9px; text-decoration: none; }
  .settings-navigation a:hover { background: color-mix(in srgb, var(--blue-soft) 46%, var(--rail)); }
  .settings-navigation a[aria-current=page] { color: var(--blue-dark); background: color-mix(in srgb, var(--blue-soft) 76%, var(--rail)); box-shadow: inset 2px 0 0 var(--blue); }
  .settings-navigation a > svg { font-size: 17px; }
  .settings-navigation a > span { min-width: 0; display: grid; }
  .settings-navigation strong { font-size: 13px; }
  .settings-navigation small { color: var(--muted); font-size: 11px; }
  .project-settings-back { min-height: 38px !important; margin-bottom: 12px; color: var(--muted) !important; }
  .project-settings-back svg { transform: rotate(180deg); }
  .project-settings-navigation .settings-nav-label { padding-top: 4px; }
  .settings-content { min-width: 0; min-height: 0; overflow: auto; background: var(--paper); }
  .settings-document { width: min(100%, 980px); min-height: 100%; padding: 38px 42px 80px; }
  .settings-heading { max-width: 72ch; padding-bottom: 25px; border-bottom: 1px solid var(--line-strong); }
  .settings-heading h1 { margin: 0; font-size: clamp(24px, 2.1vw, 30px); line-height: 1.25; letter-spacing: -.03em; }
  .settings-heading p { margin: 8px 0 0; color: var(--muted); }
  .appearance-settings { border-bottom: 1px solid var(--line-strong); }
  .preference-section { padding: 25px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: minmax(190px, .72fr) minmax(360px, 1.28fr); align-items: start; gap: 28px; }
  .preference-section:last-child { border-bottom: 0; }
  .preference-copy h2 { margin: 0; font-size: 16px; letter-spacing: -.015em; }
  .preference-copy p { max-width: 48ch; margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .preference-options { min-width: 0; display: grid; gap: 8px; }
  .preference-options--density { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preference-options--language { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .preference-options--theme { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .preference-option {
    position: relative;
    min-width: 0;
    min-height: 84px;
    padding: 12px;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    background: var(--paper);
    color: var(--ink-soft);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 16px;
    align-items: center;
    gap: 11px;
    text-align: left;
    cursor: pointer;
    text-decoration: none;
  }
  .preference-option:hover { border-color: color-mix(in srgb, var(--blue) 44%, var(--line-strong)); background: color-mix(in srgb, var(--blue-soft) 30%, var(--paper)); }
  .preference-option[aria-pressed="true"] { border-color: color-mix(in srgb, var(--blue) 58%, var(--line-strong)); color: var(--blue-dark); background: var(--blue-soft); }
  .preference-option[aria-current="true"] { border-color: color-mix(in srgb, var(--blue) 58%, var(--line-strong)); color: var(--blue-dark); background: var(--blue-soft); }
  .preference-option > span:nth-child(2) { min-width: 0; display: grid; gap: 3px; }
  .preference-option strong { color: var(--ink); font-size: 13px; font-weight: 680; }
  .preference-option small { color: var(--muted); font-size: 10px; line-height: 1.4; }
  .preference-option > svg { width: 16px; height: 16px; }
  .preference-option .preference-check { opacity: 0; color: var(--blue-dark); }
  .preference-option[aria-pressed="true"] .preference-check { opacity: 1; }
  .preference-option[aria-current="true"] .preference-check { opacity: 1; }
  .language-preview { width: 54px; height: 42px; border: 1px solid var(--line); border-radius: 5px; background: var(--rail); color: var(--ink); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
  .density-preview {
    width: 54px;
    height: 42px;
    padding: 5px;
    border: 1px solid var(--line);
    border-radius: 5px;
    background: var(--rail);
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 4px;
  }
  .density-preview > i { border-right: 1px solid var(--line-strong); }
  .density-preview > span { display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .density-preview > span > i { height: 2px; border-radius: 1px; background: var(--muted); opacity: .72; }
  .density-preview > span > i:nth-child(2) { width: 82%; }
  .density-preview > span > i:nth-child(3) { width: 68%; }
  .density-preview--compact > span { gap: 2px; }
  .density-preview--compact > span > i { height: 1px; }
  .preference-note { max-width: 72ch; margin: 18px 0 0; color: var(--muted); font-size: 12px; line-height: 1.55; }
  .settings-record-list { border-bottom: 1px solid var(--line-strong); }
  .settings-record { border-bottom: 1px solid var(--line); }
  .settings-record:last-child { border-bottom: 0; }
  .settings-record > header { min-height: 92px; padding: 19px 0; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .settings-record-title { min-width: 0; display: flex; align-items: flex-start; gap: 12px; }
  .settings-record-title .record-icon { width: 34px; height: 34px; flex: 0 0 34px; border: 1px solid var(--line); border-radius: 6px; display: grid; place-items: center; color: var(--blue-dark); background: var(--rail); }
  .settings-record-title h2, .settings-record-title h3 { margin: 0; font-size: 16px; letter-spacing: -.015em; }
  .settings-record-title p { margin: 3px 0 0; color: var(--muted); font-size: 12px; }
  .settings-record-action { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; }
  .settings-record-action button, .settings-button, .settings-action-section button, .settings-import-row button, .project-record-tools form button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--blue-dark); background: var(--paper); font-weight: 650; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .settings-record-action button:hover, .settings-button:hover, .settings-action-section button:hover, .settings-import-row button:hover, .project-record-tools form button:hover { border-color: color-mix(in srgb, var(--blue) 44%, var(--line-strong)); background: var(--blue-soft); }
  .settings-record-action button:disabled { color: var(--faint); background: var(--rail); cursor: not-allowed; }
  .settings-state { display: inline-flex; align-items: center; white-space: nowrap; font-size: 12px; font-weight: 650; }
  .settings-state--success { color: var(--green); }
  .settings-state--warning { color: var(--amber); }
  .settings-state--danger { color: var(--red); }
  .settings-state--neutral { color: var(--muted); }
  .settings-paths { margin: 0; padding: 0 0 18px 46px; display: grid; gap: 5px; }
  .settings-paths > div { min-width: 0; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 9px; }
  .settings-paths dt, .project-db-details dt, .diagnostics-summary dt, .runtime-plan-meta dt { color: var(--muted); font-size: 11px; font-weight: 650; }
  .settings-paths dd, .project-db-details dd, .diagnostics-summary dd, .runtime-plan-meta dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: var(--ink-soft); font-size: 12px; }
  .settings-footnote { max-width: 72ch; margin: 20px 0 0; color: var(--muted); font-size: 12px; }
  .settings-footnote code { padding: 1px 4px; border: 1px solid var(--line); border-radius: 3px; color: var(--ink-soft); background: var(--rail); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .settings-empty { padding: 34px 0 38px; color: var(--muted); }
  .settings-empty h2 { margin: 0; color: var(--ink); font-size: 16px; }
  .settings-empty p { margin: 5px 0 0; }
  .settings-action-section, .settings-import-row { padding: 24px 0; border-bottom: 1px solid var(--line-strong); display: grid; grid-template-columns: minmax(220px, .8fr) minmax(320px, 1.2fr); gap: 30px; align-items: start; }
  .settings-action-section h2, .settings-import-row h2, .launcher-section h2, .diagnostics-summary h2 { margin: 0; font-size: 16px; }
  .settings-action-section > div > p, .settings-import-row > div > p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
  .inline-settings-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: end; }
  .inline-settings-form > label:first-child { min-width: 0; display: grid; gap: 5px; color: var(--ink-soft); font-size: 12px; font-weight: 650; }
  .inline-settings-form input[type=text], .project-record-tools input { width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); }
  .inline-settings-form .inline-confirm { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .inline-settings-form .settings-form-error { grid-column: 1 / -1; }
  .settings-form-error { margin: 0; color: var(--red); font-size: 12px; }
  .project-record-tools { margin: -8px 0 16px 46px; display: flex; gap: 8px; }
  .project-record-tools details { min-width: min(100%, 280px); }
  .project-record-tools summary { min-height: 32px; padding: 0 7px; display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 650; cursor: pointer; list-style: none; }
  .project-record-tools summary::-webkit-details-marker { display: none; }
  .project-record-tools summary svg:last-child { font-size: 11px; }
  .project-record-tools details[open] summary svg:last-child { transform: rotate(180deg); }
  .project-record-tools form, .project-db-details { width: min(100%, 440px); margin: 5px 0 0; padding: 13px; border: 1px solid var(--line); background: var(--rail); }
  .project-record-tools form { display: grid; gap: 9px; }
  .project-record-tools form label { display: grid; gap: 5px; color: var(--ink-soft); font-size: 12px; font-weight: 650; }
  .project-record-tools form button { justify-self: end; }
  .project-db-details { display: grid; gap: 7px; }
  .project-db-details > div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 8px; }
  .connection-settings-section { margin-top: 30px; padding-top: 28px; border-top: 1px solid var(--line-strong); }
  .connection-settings-heading { max-width: 72ch; margin-bottom: 8px; }
  .connection-settings-heading h2 { margin: 0; font-size: 18px; letter-spacing: -.02em; }
  .connection-settings-heading p { margin: 6px 0 0; color: var(--muted); font-size: 12px; }
  .connection-record-list { border-bottom: 1px solid var(--line-strong); }
  .connection-record .settings-record-title p strong { color: var(--ink-soft); }
  .connection-record-tools { margin: -6px 0 17px 46px; display: flex; align-items: flex-start; gap: 10px; }
  .connection-record-tools details { min-width: min(100%, 300px); }
  .connection-record-tools summary { min-height: 32px; padding: 0 7px; display: inline-flex; align-items: center; gap: 7px; color: var(--muted); font-size: 12px; font-weight: 650; cursor: pointer; list-style: none; }
  .connection-record-tools summary::-webkit-details-marker { display: none; }
  .connection-record-tools summary svg:last-child { font-size: 11px; }
  .connection-record-tools details[open] summary svg:last-child { transform: rotate(180deg); }
  .connection-action-form { width: min(100%, 460px); margin-top: 5px; padding: 13px; border: 1px solid var(--line); background: var(--rail); display: grid; gap: 10px; }
  .connection-action-form > label:not(.inline-confirm) { display: grid; gap: 5px; color: var(--ink-soft); font-size: 12px; font-weight: 650; }
  .connection-action-form select { width: 100%; min-height: 36px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); }
  .connection-action-form .inline-confirm { display: flex; align-items: flex-start; gap: 8px; color: var(--muted); font-size: 12px; cursor: pointer; }
  .connection-action-form .inline-confirm input { margin-top: 2px; }
  .connection-action-form > button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; justify-self: end; color: var(--blue-dark); background: var(--paper); font-weight: 650; cursor: pointer; }
  .connection-action-form--danger > button { color: var(--red); }
  .workspace-project-list { list-style: none; margin: -4px 0 12px 46px; padding: 0; width: min(100%, 620px); border-top: 1px solid var(--line); }
  .workspace-project-list li { min-height: 46px; padding: 7px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .workspace-project-list li > span { display: flex; align-items: center; gap: 9px; }
  .workspace-project-list form { display: flex; align-items: center; gap: 8px; }
  .workspace-project-list form button { min-height: 30px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--red); background: var(--paper); cursor: pointer; }
  .workspace-project-list .settings-form-error { flex-basis: 100%; }
  .settings-import-row { border-top: 1px solid var(--line-strong); margin-top: 24px; }
  .settings-import-row > button { justify-self: end; }
  .diagnostics-summary { padding: 25px 0; border-bottom: 1px solid var(--line-strong); }
  .diagnostics-summary > div:first-child { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .diagnostics-summary dl { margin: 19px 0 0; display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--line); }
  .diagnostics-summary dl > div { min-width: 0; padding: 12px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 10px; }
  .diagnostics-summary dl > div:nth-child(odd) { padding-right: 22px; }
  .launcher-section { padding: 25px 0 0; }
  .launcher-section ul { list-style: none; margin: 14px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .launcher-section li { min-height: 60px; padding: 10px 0; border-bottom: 1px solid var(--line); display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .launcher-section li > span:first-child { min-width: 0; display: grid; grid-template-columns: 22px 50px minmax(0, 1fr); align-items: center; gap: 8px; }
  .launcher-section li small { min-width: 0; overflow-wrap: anywhere; color: var(--muted); }
  .service-action-row { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
  .service-action-row button { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--blue-dark); background: var(--paper); font-weight: 650; cursor: pointer; }
  .runtime-plan-dialog { width: min(680px, calc(100vw - 28px)); max-height: min(760px, calc(100dvh - 28px)); padding: 0; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); background: var(--paper); box-shadow: var(--shadow); }
  .runtime-plan-dialog::backdrop { background: rgba(27, 35, 45, .34); }
  .runtime-plan-shell { max-height: min(760px, calc(100dvh - 28px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  .runtime-plan-shell > header { padding: 21px 24px 17px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .runtime-plan-shell h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .runtime-plan-shell header p { margin: 5px 0 0; color: var(--muted); }
  .runtime-plan-body { min-height: 0; overflow: auto; padding: 20px 24px; }
  .runtime-change-list { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .runtime-change-list li { padding: 13px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 8px 12px; }
  .runtime-change-list li > strong { font-size: 12px; }
  .runtime-change-list li > div { min-width: 0; }
  .runtime-change-list li p { margin: 0; overflow-wrap: anywhere; }
  .runtime-change-list li small { display: block; margin-top: 3px; color: var(--muted); overflow-wrap: anywhere; }
  .runtime-plan-meta { margin: 18px 0 0; display: grid; gap: 7px; }
  .runtime-plan-meta > div { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 12px; }
  .runtime-plan-confirm { margin-top: 18px; padding: 12px; border: 1px solid color-mix(in srgb, var(--blue) 36%, var(--line)); background: var(--blue-soft); display: flex; align-items: flex-start; gap: 9px; cursor: pointer; }
  .runtime-plan-confirm input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }
  .runtime-plan-shell > footer { padding: 14px 24px; border-top: 1px solid var(--line); background: var(--rail); display: flex; justify-content: flex-end; gap: 9px; }
  .runtime-plan-shell > footer button { min-height: 34px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 4px; color: var(--ink); background: var(--paper); cursor: pointer; }
  .runtime-plan-shell > footer .runtime-plan-apply { border-color: var(--action); color: var(--action-ink); background: var(--action); font-weight: 650; }
  .runtime-plan-shell > footer .runtime-plan-apply:disabled { opacity: .55; cursor: not-allowed; }
  .settings-page .toast { position: fixed; right: 22px; bottom: 22px; z-index: 30; }
  @media (max-width: 760px) {
    .settings-page > .topbar { height: 52px; }
    .settings-page .top-action { margin-right: 8px; padding-inline: 8px; }
    .settings-page .top-action span { display: none; }
    .settings-page .project-context small { display: none; }
    .settings-shell { height: calc(100dvh - 52px); grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
    .settings-navigation { overflow-x: auto; overflow-y: hidden; padding: 6px 8px; border-right: 0; border-bottom: 1px solid var(--line-strong); flex-direction: row; }
    .settings-desktop-project,
    .settings-desktop-heading,
    .settings-navigation > .personal-sidebar-footer { display: none !important; }
    .settings-nav-body { display: contents; }
    .settings-nav-group { display: contents; }
    .settings-nav-label { display: none; }
    .settings-navigation a { min-width: max-content; min-height: 40px; grid-template-columns: 18px auto; }
    .settings-navigation small { display: none; }
    .settings-document { padding: 25px 18px 60px; }
    .preference-section { grid-template-columns: 1fr; gap: 14px; }
    .preference-options--theme { grid-template-columns: 1fr; }
    .preference-options--language { grid-template-columns: 1fr; }
    .preference-option { min-height: 72px; }
    .settings-record > header { align-items: flex-start; }
    .settings-record-action { align-items: flex-end; flex-direction: column; }
    .settings-paths { padding-left: 0; }
    .settings-action-section, .settings-import-row { grid-template-columns: 1fr; gap: 14px; }
    .inline-settings-form { grid-template-columns: 1fr; }
    .inline-settings-form .inline-confirm, .inline-settings-form .settings-form-error { grid-column: 1; }
    .project-record-tools { margin-left: 0; flex-wrap: wrap; }
    .connection-record-tools { margin-left: 0; flex-wrap: wrap; }
    .workspace-project-list { margin-left: 0; }
    .workspace-project-list li { align-items: flex-start; flex-direction: column; }
    .connection-record-tools details { min-width: 100%; }
    .connection-action-form { width: 100%; }
    .connection-action-form select { font-size: 16px; }
    .settings-import-row > button { justify-self: start; }
    .diagnostics-summary dl { grid-template-columns: 1fr; }
    .diagnostics-summary dl > div:nth-child(odd) { padding-right: 0; }
    .runtime-plan-dialog { width: 100vw; max-width: none; height: 100vh; max-height: none; margin: 0; border-radius: 0; }
    .runtime-plan-shell { max-height: 100vh; height: 100%; }
    .runtime-change-list li { grid-template-columns: 1fr; gap: 3px; }
    .launcher-section li > span:first-child { grid-template-columns: 20px 42px minmax(0, 1fr); }
    .inline-settings-form input[type=text], .project-record-tools input { font-size: 16px; }
  }
  @media (max-width: 520px) {
    .preference-options--density { grid-template-columns: 1fr; }
  }
`;

export const PROJECT_GUIDANCE_SETTINGS_STYLES = `
  .project-guidance-page .settings-content { max-width: none; }
  .guidance-document { width: min(100%, 1100px); margin: 0 auto; padding: 38px 42px 64px; }
  .guidance-page-header { padding-bottom: 28px; border-bottom: 1px solid var(--line-strong); display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; }
  .guidance-page-header h1 { margin: 0; color: var(--ink); font-size: 30px; letter-spacing: -.026em; }
  .guidance-page-header p { max-width: 68ch; margin: 9px 0 0; color: var(--muted); font-size: 13px; line-height: 1.65; }
  .guidance-primary-action, .guidance-secondary-action { min-height: 36px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: var(--ink-soft); background: var(--paper); font: inherit; font-size: 11px; font-weight: 700; white-space: nowrap; cursor: pointer; }
  .guidance-primary-action { border-color: var(--action); color: var(--action-ink); background: var(--action); }
  .guidance-primary-action:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .guidance-secondary-action:hover { border-color: var(--blue); color: var(--blue-dark); }
  .guidance-primary-action:focus-visible, .guidance-secondary-action:focus-visible, .guidance-text-action:focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }
  .guidance-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 56px; align-items: start; }
  .guidance-editor { margin: 28px 0 4px; padding: 22px 24px; border: 1px solid color-mix(in srgb, var(--blue) 32%, var(--line)); border-radius: 14px; background: color-mix(in srgb, var(--blue-soft) 24%, var(--paper)); box-shadow: 0 12px 32px rgba(38, 61, 87, .08); animation: guidance-editor-reveal .22s cubic-bezier(.16, 1, .3, 1); }
  .guidance-editor[hidden] { display: none; }
  .guidance-editor > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
  .guidance-editor h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
  .guidance-editor header p { margin: 5px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; }
  .guidance-editor form { margin-top: 18px; display: grid; gap: 15px; }
  .guidance-editor-fields { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 14px; }
  .guidance-editor-fields[hidden] { display: none; }
  .guidance-editor label { min-width: 0; display: grid; gap: 6px; color: var(--ink-soft); font-size: 11px; font-weight: 680; }
  .guidance-editor select, .guidance-editor textarea { width: 100%; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--ink); background: var(--paper); font: inherit; }
  .guidance-editor select { min-height: 39px; padding: 0 10px; }
  .guidance-editor textarea { min-height: 86px; padding: 10px 11px; resize: vertical; line-height: 1.6; }
  .guidance-editor textarea[name=reason] { min-height: 66px; }
  .guidance-editor select:focus, .guidance-editor textarea:focus { border-color: var(--blue); outline: 2px solid color-mix(in srgb, var(--blue), transparent 80%); outline-offset: 1px; }
  .guidance-editor-preview { margin: 0; padding: 13px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); color: var(--ink-soft); font-size: 13px; line-height: 1.65; white-space: pre-wrap; }
  .guidance-editor-preview[hidden] { display: none; }
  .guidance-editor-error { margin: 0; padding: 10px 12px; border-radius: 8px; color: var(--red); background: var(--red-soft); font-size: 11px; }
  .guidance-editor footer { display: flex; justify-content: flex-end; gap: 9px; }
  .guidance-content { min-width: 0; }
  .guidance-empty { padding: 72px 20px; border-bottom: 1px solid var(--line); text-align: center; }
  .guidance-empty svg { width: 28px; height: 28px; color: var(--blue-dark); }
  .guidance-empty h2 { margin: 15px 0 0; font-size: 18px; }
  .guidance-empty p { max-width: 56ch; margin: 8px auto 18px; color: var(--muted); font-size: 12px; line-height: 1.65; }
  .guidance-section { padding: 31px 0 28px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 142px minmax(0, 1fr); gap: 28px; }
  .guidance-section-heading { align-self: start; position: sticky; top: 18px; }
  .guidance-section-heading h2 { margin: 0; color: var(--ink); font-size: 13px; }
  .guidance-section-heading p { margin: 5px 0 0; color: var(--faint); font-size: 10px; line-height: 1.5; }
  .guidance-entry-list { min-width: 0; display: grid; }
  .guidance-entry { min-width: 0; padding: 0 0 24px; }
  .guidance-entry + .guidance-entry { padding-top: 24px; border-top: 1px solid var(--line); }
  .guidance-entry:last-child { padding-bottom: 0; }
  .guidance-entry p { max-width: 72ch; margin: 0; color: var(--ink-soft); font-size: 14px; line-height: 1.78; white-space: pre-wrap; overflow-wrap: anywhere; }
  .guidance-entry footer { margin-top: 11px; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
  .guidance-entry-meta { color: var(--faint); font-size: 9px; font-variant-numeric: tabular-nums; }
  .guidance-entry-actions { display: flex; gap: 12px; }
  .guidance-text-action { padding: 2px 0; border: 0; color: var(--muted); background: transparent; font: inherit; font-size: 10px; font-weight: 680; text-underline-offset: 3px; cursor: pointer; }
  .guidance-text-action:hover { color: var(--blue-dark); text-decoration: underline; }
  .guidance-text-action--danger:hover { color: var(--red); }
  .guidance-aside { padding-top: 31px; position: sticky; top: 0; }
  .guidance-aside section { padding: 17px 0; border-top: 1px solid var(--line-strong); }
  .guidance-aside h2 { margin: 0; font-size: 12px; }
  .guidance-aside p { margin: 7px 0 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
  .guidance-aside dl { margin: 13px 0 0; display: grid; gap: 8px; }
  .guidance-aside dl div { display: flex; justify-content: space-between; gap: 12px; }
  .guidance-aside dt, .guidance-aside dd { margin: 0; font-size: 10px; }
  .guidance-aside dt { color: var(--muted); }
  .guidance-aside dd { color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; }
  .guidance-inactive-list { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 12px; }
  .guidance-inactive-list li { padding-top: 11px; border-top: 1px solid var(--line); }
  .guidance-inactive-list p { margin: 0; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  .guidance-inactive-list button { margin-top: 7px; }
  .guidance-history { margin-top: 40px; border-top: 1px solid var(--line-strong); }
  .guidance-history > summary { min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; color: var(--ink); font-size: 13px; font-weight: 720; cursor: pointer; list-style: none; }
  .guidance-history > summary::-webkit-details-marker { display: none; }
  .guidance-history > summary span { color: var(--muted); font-size: 10px; font-weight: 500; }
  .guidance-history-list { border-top: 1px solid var(--line); }
  .guidance-history-row { padding: 15px 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; gap: 16px; }
  .guidance-history-row strong { font-size: 10px; }
  .guidance-history-row p { margin: 3px 0 0; color: var(--ink-soft); font-size: 11px; line-height: 1.55; white-space: pre-wrap; }
  .guidance-history-row time { color: var(--faint); font-size: 9px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .guidance-history-state { margin-top: 3px; color: var(--blue-dark); font-size: 9px; font-weight: 750; }
  .guidance-history-state--inactive { color: var(--muted); }
  .guidance-history-entry { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--line); }
  .guidance-history-entry > summary { min-height: 30px; color: var(--blue-dark); display: inline-flex; align-items: center; font-size: 10px; font-weight: 700; text-underline-offset: 3px; cursor: pointer; }
  .guidance-history-entry > summary:hover { text-decoration: underline; }
  .guidance-history-entry[open] > summary { margin-bottom: 10px; }
  .guidance-history-full { display: grid; gap: 11px; }
  .guidance-history-full > div { display: grid; gap: 4px; }
  .guidance-history-full dt { color: var(--faint); font-size: 9px; font-weight: 700; }
  .guidance-history-full dd { margin: 0; color: var(--ink-soft); font-size: 10px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
  @keyframes guidance-editor-reveal {
    from { opacity: .4; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 1180px) {
    .guidance-layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .guidance-aside { position: static; padding-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  }
  @media (max-width: 760px) {
    .guidance-document { padding: 25px 18px 48px; }
    .guidance-page-header { align-items: stretch; flex-direction: column; gap: 18px; }
    .guidance-page-header h1 { font-size: 26px; }
    .guidance-primary-action { align-self: flex-start; }
    .guidance-editor { margin-top: 20px; padding: 18px; }
    .guidance-editor-fields { grid-template-columns: 1fr; }
    .guidance-editor select, .guidance-editor textarea { font-size: 16px; }
    .guidance-section { grid-template-columns: 1fr; gap: 15px; }
    .guidance-section-heading { position: static; }
    .guidance-aside { grid-template-columns: 1fr; gap: 0; }
    .guidance-text-action { min-height: 44px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; }
    .guidance-entry-actions { gap: 2px; }
    .guidance-inactive-list button { margin-top: 2px; }
    .guidance-history-entry > summary { min-height: 44px; }
    .guidance-history-row { grid-template-columns: 76px minmax(0, 1fr); }
    .guidance-history-row time { grid-column: 2; }
  }
`;

export const PROJECT_RULES_SETTINGS_STYLES = `
  .project-rules-page .settings-document { width: min(100%, 900px); }
  .project-rules-receipt { margin: 20px 0 0; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--green), var(--line) 65%); border-radius: 5px; background: var(--green-soft); display: grid; gap: 2px; }
  .project-rules-receipt strong { color: var(--green); font-size: 12px; }
  .project-rules-receipt span { color: var(--muted); font-size: 12px; line-height: 1.5; }
  .project-rules-receipt:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
  .project-rules-intro { margin: 24px 0 20px; padding: 16px 18px; border: 1px solid var(--line); border-radius: 6px; background: var(--rail); }
  .project-rules-intro h2 { margin: 0; font-size: 15px; }
  .project-rules-intro p { max-width: 70ch; margin: 5px 0 0; color: var(--muted); font-size: 12px; }
  .project-rules-intro ol { margin: 14px 0 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
  .project-rules-intro li { min-width: 0; padding: 11px 12px; border: 1px solid var(--line); border-radius: 5px; background: var(--paper); display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px; }
  .project-rules-intro li > span:first-child { width: 22px; height: 22px; border-radius: 50%; color: var(--blue-dark); background: var(--blue-soft); display: grid; place-items: center; font-size: 10px; font-weight: 750; }
  .project-rules-intro li > span:last-child { min-width: 0; display: grid; }
  .project-rules-intro li strong { font-size: 12px; }
  .project-rules-intro li small { color: var(--muted); font-size: 10px; overflow-wrap: anywhere; }
  .project-rules-page .policy-source { margin-bottom: 18px; }
  .project-rules-page .policy-source-title small { display: none; }
  .project-rules-page .settings-footnote { margin-top: 16px; }
  @media (max-width: 760px) {
    .project-rules-intro ol { grid-template-columns: 1fr; }
    .project-rules-page .policy-source-state { min-width: 0; }
  }
`;



export const PROJECT_INDEX_STYLES = `
  body.project-index-page { overflow: auto; background: var(--page); }
  .project-index-page > .topbar { height: 58px; }
  .project-index-page > .project-directory-topbar { display: flex !important; }
  .project-index-page > .project-directory-topbar > .top-action { display: inline-flex !important; }
  .project-index-page .brand { color: inherit; text-decoration: none; }
  .project-directory-topbar { gap: 8px; }
  .project-primary-directories { height: 34px; padding: 3px; border-radius: 9px; background: var(--rail); display: flex; align-items: center; gap: 2px; }
  .project-primary-directories a { height: 28px; padding: 0 10px; border-radius: 7px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-decoration: none; }
  .project-primary-directories a[aria-current=page] { color: var(--ink); background: var(--paper); box-shadow: 0 2px 9px rgba(34, 48, 64, .08); }
  .project-index { min-height: calc(100dvh - 58px); padding: clamp(28px, 5vh, 52px) clamp(22px, 5vw, 72px) 64px; display: grid; place-items: start center; }
  .project-index-panel { width: min(100%, 1040px); background: transparent; }
  .project-index-heading { padding: 0 0 18px; display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
  .project-index-heading h1 { margin: 0; font-size: clamp(27px, 3vw, 38px); letter-spacing: -.04em; }
  .project-index-heading p { max-width: 64ch; margin: 9px 0 0; color: var(--muted); }
  .project-index-actions { display: flex; align-items: center; gap: 8px; }
  .project-index-search { position: relative; display: flex; align-items: center; }
  .project-index-search svg { position: absolute; left: 10px; color: var(--muted); pointer-events: none; }
  .project-index-search input { width: 190px; min-height: 34px; padding: 0 10px 0 31px; border: 1px solid var(--line-strong); border-radius: 7px; color: var(--ink); background: var(--paper); }
  .project-index-search-empty { margin: 12px 0 0; padding: 24px 10px; border: 1px dashed var(--line-strong); border-radius: 12px; color: var(--muted); text-align: center; }
  .project-index-create { min-height: 34px; padding: 0 12px; border: 1px solid var(--action); border-radius: 7px; color: var(--action-ink); background: var(--action); display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap; }
  .project-index-create:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .project-card { min-width: 0; min-height: 138px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; color: inherit; background: var(--paper); box-shadow: var(--shadow-soft); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 13px; text-decoration: none; transition: border-color .16s ease, box-shadow .16s ease, transform .16s ease; }
  .project-card:hover { border-color: var(--line-strong); box-shadow: var(--shadow-raised); transform: translateY(-1px); }
  .project-card:focus-visible { outline: 2px solid color-mix(in srgb, var(--blue) 62%, transparent); outline-offset: 3px; }
  .project-card > header, .project-card > footer { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .project-card > div { min-width: 0; }
  .project-card-icon { width: 28px; height: 28px; border-radius: 8px; color: var(--ink-soft); background: var(--rail); display: grid; place-items: center; }
  .project-card-icon svg { width: 15px; height: 15px; }
  .project-card-kind { min-width: 0; overflow: hidden; color: var(--faint); font-size: 9px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
  .project-card h2 { margin: 0; overflow: hidden; font-size: 14px; letter-spacing: -.014em; text-overflow: ellipsis; white-space: nowrap; }
  .project-card p { margin: 4px 0 0; overflow: hidden; color: var(--muted); font-size: 10px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
  .project-card footer { color: var(--ink-soft); font-size: 10px; font-weight: 680; }
  .project-card footer svg { width: 13px; height: 13px; transform: rotate(180deg); transition: transform .16s ease; }
  .project-card:hover footer svg { transform: rotate(180deg) translateX(-2px); }
  .project-index-empty { padding: 42px 30px 46px; color: var(--muted); }
  .project-index-empty h2 { margin: 0 0 7px; color: var(--ink); font-size: 18px; }
  .project-index-empty p { max-width: 48ch; margin: 0; }
  .project-index-start { margin-top: 18px; display: flex; flex-wrap: wrap; gap: 9px; }
  .project-index-start a { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 7px; color: var(--blue-dark); background: var(--paper); display: inline-flex; align-items: center; font-weight: 650; text-decoration: none; }
  .project-index-start a:first-child { border-color: var(--action); color: var(--action-ink); background: var(--action); }
  .project-index-start a:hover { border-color: color-mix(in srgb, var(--blue), var(--line) 58%); background: var(--blue-soft); color: var(--blue-dark); }
  .project-index-start a:first-child:hover { border-color: var(--action); color: var(--action-ink); background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-index-migration { margin-top: 28px; padding: 18px 20px; border: 0; border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 18px; background: color-mix(in srgb, var(--rail) 78%, var(--page)); }
  .project-index-migration > div { min-width: 0; }
  .project-index-migration strong { display: block; font-size: 13px; }
  .project-index-migration small { display: block; margin-top: 2px; color: var(--muted); }
  .project-index-migrate { min-height: 34px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 7px; color: var(--blue-dark); background: var(--paper); font-weight: 650; white-space: nowrap; cursor: pointer; }
  .project-index-migrate:hover { border-color: color-mix(in srgb, var(--blue), var(--line) 58%); background: var(--blue-soft); }
  .project-migration-dialog { width: min(100% - 28px, 580px); padding: 0; border: 1px solid var(--line-strong); border-radius: 9px; background: var(--paper); color: var(--ink); box-shadow: var(--shadow); }
  .project-migration-dialog::backdrop { background: rgba(27, 35, 45, .32); }
  .project-migration-form { display: grid; }
  .project-migration-form > header { padding: 22px 24px 18px; border-bottom: 1px solid var(--line); display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .project-migration-form h2 { margin: 0; font-size: 19px; letter-spacing: -.02em; }
  .project-migration-form header p { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
  .project-migration-form > .project-migration-body { padding: 20px 24px; display: grid; gap: 15px; }
  .project-migration-form label:not(.project-migration-confirm) { display: grid; gap: 5px; color: var(--ink-soft); font-size: 13px; font-weight: 650; }
  .project-migration-form label small { color: var(--muted); font-weight: 400; }
  .project-migration-form input[type=text] { width: 100%; min-height: 36px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--paper); color: var(--ink); }
  .project-migration-form input[type=text]:focus { border-color: var(--blue); outline: 0; box-shadow: 0 0 0 2px color-mix(in srgb, var(--blue), transparent 84%); }
  .project-migration-warning { margin: 0; padding: 10px 11px; color: #654300; border: 1px solid #efd49c; background: var(--amber-soft); font-size: 12px; line-height: 1.55; }
  .project-migration-confirm { display: flex; align-items: flex-start; gap: 9px; color: var(--ink-soft); font-size: 13px; line-height: 1.45; cursor: pointer; }
  .project-migration-confirm input { width: 16px; height: 16px; margin: 2px 0 0; accent-color: var(--blue); }
  .project-migration-error { margin: 0; color: var(--red); font-size: 13px; }
  .project-migration-form > footer { padding: 14px 24px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 9px; background: var(--rail); }
  .project-migration-form > footer button { min-height: 34px; padding: 0 13px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--paper); color: var(--ink); cursor: pointer; }
  .project-migration-form > footer .project-migration-submit { border-color: var(--action); color: var(--action-ink); background: var(--action); font-weight: 650; }
  .project-migration-form > footer .project-migration-submit:hover { background: color-mix(in srgb, var(--action) 90%, var(--action-ink)); }
  .project-migration-form > footer .project-migration-submit:disabled { opacity: .58; cursor: wait; }
  .project-index-note { margin: 10px 0 0; padding: 0 2px; border: 0; color: var(--muted); font-size: 11px; background: transparent; }
  @media (max-width: 760px) {
    .project-index-page > .topbar { height: 52px; }
    .project-index { min-height: calc(100dvh - 52px); }
    .project-index-page .project-context small { display: none; }
    .project-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 1100px) and (min-width: 761px) {
    .project-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 620px) {
    .project-index { padding: 28px 14px; place-items: start stretch; }
    .project-index-panel { width: 100%; }
    .project-index-heading { align-items: stretch; flex-direction: column; }
    .project-index-heading, .project-index-empty { padding-inline: 0; }
    .project-index-actions { align-items: stretch; }
    .project-index-search { flex: 1; }
    .project-index-search input { width: 100%; min-height: 44px; }
    .project-index-create { min-height: 44px; align-self: stretch; }
    .project-index-migration { padding-inline: 20px; align-items: stretch; flex-direction: column; }
    .project-index-migrate { align-self: flex-start; }
    .project-index-note { padding-inline: 20px; }
    .project-migration-form > header, .project-migration-form > .project-migration-body, .project-migration-form > footer { padding-inline: 18px; }
  }
  @media (max-width: 520px) {
    .project-card-grid { grid-template-columns: minmax(0, 1fr); }
  }
`;



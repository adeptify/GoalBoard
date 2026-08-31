# Gmail connector QA

## Scope

- Goal: `goal-infoflow-gmail-connector`
- Completion target: internal complete
- Provider account: `yijunw0212@gmail.com`; no credential value was inspected or recorded
- Configured range: `in:inbox is:unread`
- UI: desktop 1024 px and requested 390×844 narrow viewport (effective content width 312 px in the in-app browser)

## Automated checks

- Gmail-scoped TypeScript check passed.
- Connector, source lifecycle, contract, and the relevant Web workbench assertions cover:
  - default Provider query `in:inbox is:unread` and all four closed presets;
  - scope persistence, bounded full sync after scope changes, and history filtering;
  - sender, subject, Provider time, snippet, system labels, Gmail link, and account identity mapping;
  - STARRED, IMPORTANT, and direct-recipient/non-bulk attention rules;
  - ordinary or automated mail remaining Feed-only;
  - removal of secrets and message content from cursor, receipt, logs, and Inbox detail;
  - disconnect, delete, rejected-token, source-fault, and reconnect lifecycle;
  - current-page OAuth navigation and Source-to-Feed filter reset.
- Full repository run: 348 tests, 345 passed, 3 failed. All Gmail tests passed. The three failures are existing presentation-contract drift outside this Work Item:
  - desktop/TUI empty-project copy still expects an older sentence;
  - the static English translation inventory is behind current renderer labels;
  - the desktop project-catalog test still expects the older `<header class="topbar">` shell.

## Real account smoke

- Google OAuth completed and returned to the same project page.
- The account was materialized as an independent Source named `Gmail · yijunw0212@gmail.com`.
- The Source displays account identity, selected range, and `gmail.readonly · GET only`.
- The legacy generic Gmail compatibility Source was paused to avoid duplicate synchronization.
- First authenticated run created 25 new Feed Items; Source item count changed from 42 to 67 and the run ledger showed `新增 25 · 去重 0`.
- Second authenticated run created no new item; item count stayed 67 and the run ledger showed `新增 0 · 去重 0`.
- This proves a successful real fetch plus repeat-run idempotence/history continuation.

## Live item inspection

- A real Gmail Feed Item retained:
  - sender `DreamerWYJ <notifications@github.com>`;
  - complete subject and Provider timestamp;
  - necessary body preview;
  - `gmail`, `label:unread`, and `label:inbox` tags;
  - account-specific Gmail URL ending in message id `1a052783d0f5d0a8`.
- Opening Source Messages in Feed clears the previous search, applies `Gmail · yijunw0212@gmail.com`, and shows exactly the 25 newly fetched account items.
- The 25 fetched items were automated GitHub notification emails. Filtering Inbox to this Gmail account returned zero entries, confirming that automatic/bulk mail does not create attention noise.
- Positive attention cases remain covered by automated provider tests for STARRED, IMPORTANT, and direct-recipient/non-bulk mail.

## Privacy and recovery

- OAuth requests only `gmail.readonly`, `openid`, and `email`; no send, reply, label mutation, or server-side delete path exists.
- A rejected-token smoke retained 42 historical items and the trusted cursor, created one actionable `source_fault`, and exposed reconnect without logging a token or message body.
- Successful reauthorization restored the account into a healthy independent Source and resumed synchronization.
- Disconnect stops pulls and removes the local secret; deletion preserves the existing explicit keep-history/delete-history choice.
- Historical Inbox entries attached to the legacy generic Source were not guessed, rewritten, or deleted.

## Responsive and navigation inspection

- Desktop Source detail, account state, range selector, sync ledger, and real Feed detail are readable and aligned.
- Narrow Source overview exposes account, state, last sync, item count, selected range, and `gmail.readonly · GET only`.
- Narrow configuration exposes all four closed range presets and bounded-backfill explanation.
- No horizontal document overflow was observed: desktop `1024 = 1024`; narrow effective content `312 = 312`.
- OAuth now navigates the current page, avoiding popup suppression in the in-app browser.
- Source-to-Feed navigation resets stale search/type/time/status/sort state before applying the current account Source.

## Artifacts

- `gmail-connector-wide-config.png`
- `gmail-connector-narrow-config.png`
- `gmail-connector-narrow-recovery.png`

## Current verdict

Pass. Real authorization, bounded live fetch, repeat-run idempotence, metadata/original-link retention, Feed/Inbox routing, privacy/recovery, and responsive source-management paths meet the Gmail Goal's internal-complete acceptance level.

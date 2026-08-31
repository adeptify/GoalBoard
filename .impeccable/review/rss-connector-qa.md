# RSS / Atom Connector QA — 2026-08-30

## Real data smoke

- Ars Technica (`https://feeds.arstechnica.com/arstechnica/index`, RSS)
  - First post-fix pull: completed, created 20, deduped 0.
  - Source identity captured: `Ars Technica - All content`, home `https://arstechnica.com/`.
  - Validator captured: `Last-Modified`.
  - Immediate second pull: completed + empty, receipt status 304, UI says `源站未修改 · 没有重复下载或新增 Item`.
- The Verge (`https://www.theverge.com/rss/index.xml`, Atom)
  - First post-fix pull: completed, created 9, deduped 1.
  - Source identity captured: `The Verge`, home `https://www.theverge.com/`.
  - Validator captured: `ETag`.
  - Immediate second pull: completed + empty, receipt status 304, no new Item.
- Feed detail checked with the real The Verge item `Xbox CEO calls Project Helix a ‘family of devices’`:
  - source label, title, published time, summary/body and source material are visible;
  - `打开原文` and material link both target the real canonical Verge URL;
  - the saved body is readable from the recovered encrypted content overlay.

## Recovery and safety

- Existing migrated project state first exposed an unreadable v1 Intelligence ledger and a missing v1 evidence-content key.
- Runtime now starts in the non-destructive `feed-intent-v2` namespace; v1 opaque blobs remain untouched.
- When an old content hash is present but its key is unavailable, the same content is re-sealed under `evidence-recovered-v2`; the original ciphertext remains byte-for-byte unchanged.
- Unit coverage verifies HTTPS-only/custom-feed validation, private-network rejection, conditional request headers, 304 success, URL edit cursor reset, immediate parse-fault recovery, third-transient-failure threshold and successful fault resolution.

## Responsive review

- Wide overview: `rss-connector-wide-overview.png` at 1024 × 820.
- Narrow config: `rss-connector-narrow-config.png` with requested viewport 390 × 844 (effective app content width 312).
- Narrow run ledger: `rss-connector-narrow-runs.png` at the same viewport.
- Source identity, tabs, URL, range explanation, run result and primary actions remain readable; long endpoints stay contained by the input/ledger cell and do not introduce page-level horizontal overflow.

## Automated verification

- Affected suite: 70/70 passed (`feed-sources`, `feed-security`, `feed-contract`, `web`).
- Strict `pnpm build`: passed.
- Full `pnpm test`: 347 total, 346 passed, 1 failed.
- The only failure is the pre-existing broad static i18n inventory for the larger Source/Feed/Inbox high-fidelity surface; every label added by this RSS Work Item has an English mapping.

---
name: glossary-ui
description: >-
  The local, beginner-friendly browser interface under glossary_ui/ for editing
  services/fixed_glossary/fixed_glossary.json, including its dependency-free
  HTTP server, validation, backups, archive semantics, matcher preview, static
  frontend, and macOS double-click launcher.
---

# Fixed glossary UI

`glossary_ui/` is a localhost-only browser interface for people who should not
need to edit JSON or Python. It reads and writes the production
`services/fixed_glossary/fixed_glossary.json`, so saved changes are consumed by
pre-pass, glossary check, and finalize exactly like hand-edited entries.

## Launch and architecture

- Double-click the root-level `開啟漫才詞庫管理.command` (the `scripts/`
  directory keeps an equivalent launcher), or run
  `.venv/bin/python -m glossary_ui.server`.
- The server binds to `127.0.0.1:8765`, opens the default browser, and uses only
  Python's standard library. Do not add a web-framework dependency for this
  single-user local surface.
- Static HTML/CSS/JS lives in `glossary_ui/static/`. JSON endpoints are in
  `glossary_ui/server.py`.
- Every save validates and normalizes the complete payload, copies the current
  file to `services/fixed_glossary/backups/`, then modifies the production JSON.
  Backups are never pruned automatically.

## Data and safety invariants

- A talent unit has an optional `group` mapping and at least one `members`
  mapping. An `others` entry is a standalone program, brand, segment, or term.
- Every mapping requires a non-empty `jp` alias list and a non-empty `zh` target.
  Optional `note` metadata is preserved by the UI but ignored by the pipeline.
- The UI never permanently deletes entries. Archive actions set
  `disabled: true`; the production loader skips disabled talent units, members,
  and other terms. Restoring removes that flag on the next normalized save.
- `/api/glossary/match` deliberately calls the production
  `load_fixed_glossary` + `filter_fixed_glossary` path. Keep it that way so the
  preview cannot drift from actual translation behavior.
- The server must remain localhost-only by default and must never expose or
  inspect `.env` or API keys.

## Tests

Run the loader and UI tests after changes:

```bash
.venv/bin/python -m unittest tests.test_fixed_glossary tests.test_glossary_ui
```

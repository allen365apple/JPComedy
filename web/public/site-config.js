// Public runtime configuration for the integrated site. No secrets here.
// glossaryMode picks the data source for 漫才詞庫 explicitly (never guessed
// from hostname):
//   'fixture' — browse/edit the shipped read-only snapshot (default; offline).
//   'local'   — same-origin Python API (glossary_ui/server.py) at /api/glossary.
//   'cloud'   — the public Worker + shared password (production).
window.JPCOMEDY_SITE = {
  glossaryMode: "fixture",
  cloud: {
    repository: "allen365apple/jpcomedy-glossary",
    branch: "main",
    apiBase: "https://jpcomedy-glossary.allen365apple.workers.dev",
  },
};

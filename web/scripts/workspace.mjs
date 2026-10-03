import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve the JPComedy workspace (the folder that holds the source archive and
// the shared glossary) WITHOUT hardcoding any machine-specific absolute path.
// Order: explicit JPCOMEDY_WORKSPACE env → walk up from `startUrl` looking for
// the required source folders. This lets the same script run from jpcomedy-site
// and from owarai-grillmaster/web/ locally. A clean public CI checkout will not
// contain these local-only sources, so the public build never calls this — it
// ships the already-approved, prebuilt public/ instead (see web/README.md).
const REQUIRED = ['manzaiweek-archive', 'jpcomedy-glossary'];

export function resolveWorkspace(startUrl) {
  if (process.env.JPCOMEDY_WORKSPACE) {
    const explicit = path.resolve(process.env.JPCOMEDY_WORKSPACE);
    assertWorkspace(explicit);
    return explicit;
  }
  let dir = path.dirname(fileURLToPath(startUrl));
  for (let i = 0; i < 8; i += 1) {
    if (REQUIRED.every((name) => existsSync(path.join(dir, name)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    'Could not locate the JPComedy workspace (needs adjacent manzaiweek-archive/ and jpcomedy-glossary/). '
    + 'Set JPCOMEDY_WORKSPACE to the folder that contains them.',
  );
}

function assertWorkspace(dir) {
  const missing = REQUIRED.filter((name) => !existsSync(path.join(dir, name)));
  if (missing.length) throw new Error(`JPCOMEDY_WORKSPACE is missing: ${missing.join(', ')} (at ${dir})`);
}

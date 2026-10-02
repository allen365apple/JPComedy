// Load the primary JSON database and the source-backed final coverage batch.
// The build-facing exports stay stable so build-data.mjs needs no special case.
// Edit profiles.json for the main catalog and profiles-backfill.mjs for the
// supplemental 44-artist batch (see PROFILES_SCHEMA.md).
import { readFile } from 'node:fs/promises';
import { profiles as backfillProfiles, coverOrder as backfillCoverOrder, officialCovers as backfillOfficialCovers } from './profiles-backfill.mjs';

const db = JSON.parse(await readFile(new URL('./profiles.json', import.meta.url), 'utf8'));

export const checkedAt = db.checkedAt;
export const resultsSource = db.resultsSource;
export const aliasSource = db.aliasSource;
export const videoResources = db.videoResources;
export const coverOrder = { ...db.coverOrder, ...backfillCoverOrder };
export const officialCovers = { ...db.officialCovers, ...backfillOfficialCovers };
export const profiles = [...db.profiles, ...(db.profilesSupplement || []), ...backfillProfiles];

// `resources` stores its links to artists declaratively so the database never
// goes stale: relatedScope 'm1' = every M-1 finalist, 'all' = every artist.
export const resources = db.resources.map(({ relatedScope, related, ...rest }) => ({
  ...rest,
  related: relatedScope === 'm1' ? profiles.filter(p => p.m1Id).map(p => p.id)
    : relatedScope === 'all' ? profiles.map(p => p.id)
    : (related || [])
}));

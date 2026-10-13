// Load the primary JSON database and the source-backed final coverage batch.
// The build-facing exports stay stable so build-data.mjs needs no special case.
// Edit profiles.json for the main catalog and profiles-backfill.mjs for the
// supplemental 44-artist batch (see PROFILES_SCHEMA.md).
import { readFile } from 'node:fs/promises';
import { profiles as backfillProfiles, coverOrder as backfillCoverOrder, officialCovers as backfillOfficialCovers } from './profiles-backfill.mjs';

const db = JSON.parse(await readFile(new URL('./profiles.json', import.meta.url), 'utf8'));
const seniorEnrichment = JSON.parse(await readFile(new URL('./senior-enrichment-2026-10-14.json', import.meta.url), 'utf8'));
const baseProfiles = [...db.profiles, ...(db.profilesSupplement || []), ...backfillProfiles];
const enrichedById = new Map();
for (const entry of seniorEnrichment.profiles) {
  const original = baseProfiles.find(profile => profile.id === entry.id);
  if (!original || original.postSeq || enrichedById.has(entry.id)) {
    throw new Error(`Invalid senior enrichment target: ${entry.id}`);
  }
  enrichedById.set(entry.id, entry);
}

export const checkedAt = db.checkedAt;
export const resultsSource = db.resultsSource;
export const aliasSource = db.aliasSource;
export const videoResources = db.videoResources;
export const coverOrder = { ...db.coverOrder, ...backfillCoverOrder };
export const officialCovers = { ...db.officialCovers, ...backfillOfficialCovers };
export const profiles = baseProfiles.map(profile => {
  const enrichment = enrichedById.get(profile.id);
  return enrichment ? { ...profile, researchedArticle: enrichment.researchedArticle, works: enrichment.works } : profile;
});

// `resources` stores its links to artists declaratively so the database never
// goes stale: relatedScope 'm1' = every M-1 finalist, 'all' = every artist.
export const resources = db.resources.map(({ relatedScope, related, ...rest }) => ({
  ...rest,
  related: relatedScope === 'm1' ? profiles.filter(p => p.m1Id).map(p => p.id)
    : relatedScope === 'all' ? profiles.map(p => p.id)
    : (related || [])
}));

// Load the primary JSON database and the source-backed final coverage batch.
// The build-facing exports stay stable so build-data.mjs needs no special case.
// Edit profiles.json for the main catalog and profiles-backfill.mjs for the
// supplemental 44-artist batch (see PROFILES_SCHEMA.md).
import { readFile } from 'node:fs/promises';
import { profiles as backfillProfiles, coverOrder as backfillCoverOrder, officialCovers as backfillOfficialCovers } from './profiles-backfill.mjs';

const db = JSON.parse(await readFile(new URL('./profiles.json', import.meta.url), 'utf8'));
const seniorEnrichment = JSON.parse(await readFile(new URL('./senior-enrichment-2026-10-14.json', import.meta.url), 'utf8'));
const weeklyUpdate = JSON.parse(await readFile(new URL('./weekly-update-2026-10-14.json', import.meta.url), 'utf8'));
const authorizedWeekly = JSON.parse(await readFile(new URL('./weekly-authorized-2026-10-14.json', import.meta.url), 'utf8'));
const baseProfiles = [...db.profiles, ...(db.profilesSupplement || []), ...backfillProfiles,
  ...weeklyUpdate.newProfiles.map(p => ({ ...p, checkedAt: weeklyUpdate.checkedAt }))];
if (new Set(baseProfiles.map(p => p.id)).size !== baseProfiles.length) throw new Error('Duplicate profile identity');
for (const id of Object.keys(weeklyUpdate.weeklyUpdates)) {
  if (!baseProfiles.some(p => p.id === id)) throw new Error(`Unknown weekly update target: ${id}`);
}
const enrichedById = new Map();
for (const entry of seniorEnrichment.profiles) {
  const original = baseProfiles.find(profile => profile.id === entry.id);
  if (!original || original.postSeq || enrichedById.has(entry.id)) {
    throw new Error(`Invalid senior enrichment target: ${entry.id}`);
  }
  enrichedById.set(entry.id, entry);
}

export const checkedAt = db.checkedAt;
// Glossary-only maintenance must not relabel the basic artist research dates.
export const glossaryUpdatedAt = '2026-10-18';
export const resultsSource = db.resultsSource;
export const aliasSource = db.aliasSource;
export const videoResources = { ...db.videoResources, ...weeklyUpdate.videoResources };
export const coverOrder = { ...db.coverOrder, ...backfillCoverOrder, ...weeklyUpdate.coverOrder };
export const officialCovers = { ...db.officialCovers, ...backfillOfficialCovers, ...weeklyUpdate.officialCovers };
export const profiles = baseProfiles.map(profile => {
  const enrichment = enrichedById.get(profile.id);
  const enriched = enrichment ? { ...profile, researchedArticle: enrichment.researchedArticle, works: enrichment.works } : profile;
  const update = authorizedWeekly.weeklyUpdates[profile.id] || weeklyUpdate.weeklyUpdates[profile.id];
  if (!update) return enriched;
  // Keep the historical research in its source files, but do not ship a second
  // editorial feature on a page that already carries Weekly Manzai content.
  const { researchedArticle, ...weeklyProfile } = enriched;
  return { ...weeklyProfile, weeklyUpdate: update,
    works: (weeklyProfile.works || []).filter(work => !/專訪|訪談/.test(work.kind)),
    ...(profile.id === 'nanamagari' ? { aliases: [...new Set([...(profile.aliases || []), '七曲'])] } : {}),
    sources: [...(enriched.sources || []), ...(weeklyUpdate.existingSources[profile.id] || []),
      { label: '每週漫才：新文章／合輯原文', url: update.url, covers: '已獲授權刊載的作者原文；合輯顯示本組完整段落' }] };
});

// `resources` stores its links to artists declaratively so the database never
// goes stale: relatedScope 'm1' = every M-1 finalist, 'all' = every artist.
export const resources = db.resources.map(({ relatedScope, related, ...rest }) => ({
  ...rest,
  related: relatedScope === 'm1' ? profiles.filter(p => p.m1Id).map(p => p.id)
    : relatedScope === 'all' ? profiles.map(p => p.id)
    : (related || [])
}));

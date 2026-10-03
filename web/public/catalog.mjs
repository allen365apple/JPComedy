/** Normalize searchable aliases without losing Japanese or Traditional Chinese text. */
export function normalize(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
}

/** Search group names, archive aliases, verified stage names and glossary members. */
export function matchesQuery(group, query) {
  const q = normalize(query);
  if (!q) return true;
  const fields = [group.jp, group.zh, group.reading, group.article?.title, group.format, group.styleGroup,
    ...group.works.flatMap(w => [w.title, w.detail]),
    ...group.aliases, ...group.tags, ...group.glossaryAliases,
    ...group.members.flatMap(m => [m.jp, m.zh, m.reading, ...m.glossaryAliases])];
  return fields.some(v => normalize(v).includes(q));
}

/** Combine name/works search, style and performer type; preserve editorial order by default. */
export function filterGroups(groups, { query = '', style = 'all', tag = 'all', type = 'all', sort = 'featured' } = {}) {
  return groups.filter(g => matchesQuery(g, query))
    .filter(g => style === 'all' || g.styleGroup === style)
    .filter(g => tag === 'all' || g.tags.includes(tag))
    .filter(g => type === 'all' || g.type === type)
    .toSorted((a, b) => sort === 'name' ? a.jp.localeCompare(b.jp, 'ja') : 0);
}

/** Suggest related artists by shared styles, preserving editorial order for ties. */
export function relatedGroups(groups, current, count = 3) {
  return groups.filter(g => g.id !== current.id)
    .map(g => ({ group: g, overlap: g.tags.filter(t => current.tags.includes(t)).length }))
    .filter(g => g.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, count).map(g => g.group);
}

/** Escape imported text before placing it in HTML templates. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

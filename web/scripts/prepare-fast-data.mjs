import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Keep the searchable directory small; fetch the complete, immutable profile only on demand. */
export async function prepareFastData(directory, data) {
  await mkdir(path.join(directory, 'profiles'), { recursive: true });
  const groups = [];
  for (const group of data.groups) {
    const json = JSON.stringify(group);
    const hash = createHash('sha256').update(json).digest('hex').slice(0, 12);
    const detailUrl = `profiles/${group.id}-${hash}.json`;
    await writeFile(path.join(directory, detailUrl), json);
    const { id, jp, zh, reading, type, status, format, styleGroup, headline, tags,
      aliases, glossaryAliases, cover, coverSmall, members, photo, videoUrl, videoResource, works, article } = group;
    groups.push({ id, jp, zh, reading, type, status, format, styleGroup, headline, tags,
      aliases, glossaryAliases, cover, coverSmall, detailUrl,
      members: members.map(({ jp, zh, reading, glossaryAliases }) => ({ jp, zh, reading, glossaryAliases })),
      photo: { imageUrl: photo?.imageUrl }, videoUrl,
      videoResource: videoResource ? { title: videoResource.title, kind: videoResource.kind } : null,
      works: works.map(({ title, detail }) => ({ title, detail })),
      article: article ? { title: article.title } : null });
  }
  await writeFile(path.join(directory, 'catalog.json'), JSON.stringify({ meta: data.meta, resources: data.resources, groups }));
}

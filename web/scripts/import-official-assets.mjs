import { writeFile, mkdir, access } from 'node:fs/promises';
import { officialCovers } from '../content/profiles.mjs';

// Explicit, one-time asset import; the normal build stays offline.
// Publicly accessible portraits are NOT licensed for public republication.
await mkdir(new URL('../public/assets/', import.meta.url), { recursive: true });
for (const [id, cover] of Object.entries(officialCovers)) {
  const target = new URL('../public/' + cover.src, import.meta.url);
  try {
    await access(target);
    console.log(`Kept existing ${id}: ${cover.src}`);
    continue;
  } catch {
    // New profile assets are added without replacing any existing user image.
  }
  const response = await fetch(cover.imageUrl);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
    throw new Error(`Invalid official image: ${id} (${response.status})`);
  }
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  console.log(`Imported ${id}: ${cover.credit}; local preview only.`);
}

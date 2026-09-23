import type { Project, WikiFolder } from '../types';

export type WikiMoveTarget = { kind: 'article' | 'folder'; id: string };

/** Check the destination's ancestor chain, including malformed imported cycles. */
export function canMoveFolder(folders: WikiFolder[], id: string, destination?: string): boolean {
  const seen = new Set<string>([id]);
  let cursor = destination;
  while (cursor) {
    if (seen.has(cursor)) return false;
    seen.add(cursor);
    const folder = folders.find(f => f.id === cursor);
    if (!folder) return false;
    cursor = folder.parentId;
  }
  return true;
}

export function folderPath(folders: WikiFolder[], id: string): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = id;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const folder = folders.find(f => f.id === cursor);
    if (!folder) break;
    names.unshift(folder.name);
    cursor = folder.parentId;
  }
  return names.join(' / ');
}

export function moveWikiItem(project: Project, target: WikiMoveTarget, destination?: string): Project {
  const folders = project.wikiFolders ?? [];
  if (destination && !folders.some(f => f.id === destination)) throw new Error('Der Zielordner ist nicht mehr vorhanden.');
  if (target.kind === 'folder') {
    if (!folders.some(f => f.id === target.id)) throw new Error('Der Ordner ist nicht mehr vorhanden.');
    if (!canMoveFolder(folders, target.id, destination)) throw new Error('Ein Ordner kann nicht in sich selbst oder einen seiner Unterordner verschoben werden.');
    return { ...project, wikiFolders: folders.map(f => f.id === target.id ? { ...f, parentId: destination } : f) };
  }
  if (!(project.wikiEntries ?? []).some(e => e.id === target.id)) throw new Error('Der Artikel ist nicht mehr vorhanden.');
  return { ...project, wikiEntries: (project.wikiEntries ?? []).map(e => e.id === target.id ? { ...e, folderId: destination } : e) };
}

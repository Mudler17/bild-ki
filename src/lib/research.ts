import type { Artwork, Project, WorkNote } from '../types';

export type SearchHit = { project: Project; artwork?: Artwork; note?: WorkNote; wikiId?: string; tab?: 'info' | 'description' | 'analysis' | 'catalog' | 'details'; title: string; text: string; field: string };
export type SearchFilters = { query: string; project: string; artist: string; style: string; tag: string; type: string };
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de');
export function searchArchive(projects: Project[], filters: SearchFilters): SearchHit[] {
  const words = fold(filters.query).split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  const matches = (text: string) => words.every(word => fold(text).includes(word));
  for (const project of projects) {
    if (filters.project && project.id !== filters.project) continue;
    const artworkFilter = Boolean(filters.artist || filters.style || filters.tag);
    if (!artworkFilter && project.kind !== 'notebook' && (!filters.type || filters.type === 'project')) {
      const text = [project.name, project.description, project.historicalContext, project.notes].join(' ');
      if (matches(text)) hits.push({ project, title: project.name, text, field: 'Projekt' });
    }
    if (!filters.type || filters.type === 'artwork') for (const artwork of project.artworks.filter(a => !a.deletedAt)) {
      if (filters.artist && !fold(artwork.artist).includes(fold(filters.artist))) continue;
      if (filters.style && !artwork.styleTags.some(t => fold(t).includes(fold(filters.style)))) continue;
      if (filters.tag && ![...artwork.styleTags, ...artwork.elementTags, ...Object.values(artwork.elementClusters).flat()].some(t => fold(t).includes(fold(filters.tag)))) continue;
      const text = [artwork.title, artwork.artist, artwork.year, artwork.description, artwork.medium, artwork.inventoryNumber,
        artwork.location, artwork.provenance, artwork.catalogText, artwork.contextAnalysis, artwork.notes,
        ...artwork.styleTags, ...artwork.elementTags, ...Object.values(artwork.elementClusters).flat(), ...Object.values(artwork.formalAnalysis ?? {}),
        ...(artwork.detailViews ?? []).flatMap(d => [d.title, d.description])].join(' ');
      if (matches(text)) {
        const sections: [SearchHit['tab'], string][] = [
          ['analysis', Object.values(artwork.formalAnalysis ?? {}).join(' ')],
          ['catalog', artwork.catalogText], ['description', [artwork.description, artwork.contextAnalysis, artwork.provenance, artwork.notes].join(' ')],
          ['details', (artwork.detailViews ?? []).flatMap(d => [d.title, d.description]).join(' ')],
        ];
        const tab = sections.find(([, content]) => words.some(word => fold(content).includes(word)))?.[0] ?? 'info';
        hits.push({ project, artwork, title: artwork.title, text, field: 'Bild', tab });
      }
    }
    if (!artworkFilter && (!filters.type || filters.type === 'note')) for (const note of project.workNotes ?? []) {
      const text = `${note.title} ${note.content}`;
      if (matches(text)) hits.push({ project, note, title: note.title || 'Ohne Titel', text, field: note.kind === 'task' ? 'Aufgabe' : 'Notiz' });
    }
    if (!artworkFilter && (!filters.type || filters.type === 'wiki')) for (const entry of project.wikiEntries ?? []) {
      const text = [entry.title, entry.content, entry.discussionDraft, ...(entry.discussion ?? []).map(post => post.content)].join(' ');
      if (matches(text)) hits.push({ project, wikiId: entry.id, title: entry.title, text, field: 'Wiki' });
    }
  }
  return hits;
}

export function newWorkNote(patch: Partial<WorkNote> = {}): WorkNote {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: '', content: '', kind: 'draft', done: false, due: '', artworkIds: [], source: 'user', createdAt: now, updatedAt: now, ...patch };
}

export function putWorkNote(projects: Project[], projectId: string | null, note: WorkNote): Project[] {
  const owner = projectId ? projects.find(p => p.id === projectId) : projects.find(p => p.kind === 'notebook' && !p.name.includes('(Konfliktkopie)'));
  if (projectId && !owner) throw new Error('Das zugehörige Projekt wurde gelöscht. Bitte die Notiz im App-Bereich sichern.');
  const target: Project = owner ?? { id: projects.some(p => p.id === 'artarchive-app-notes-v1') ? crypto.randomUUID() : 'artarchive-app-notes-v1', kind: 'notebook', name: 'App-Notizen', description: '', historicalContext: '', artworks: [], createdAt: Date.now() };
  const notes = target.workNotes ?? [];
  const updated = { ...target, updatedAt: Date.now(), workNotes: notes.some(n => n.id === note.id) ? notes.map(n => n.id === note.id ? note : n) : [...notes, note] };
  return owner ? projects.map(p => p.id === target.id ? updated : p) : [...projects, updated];
}

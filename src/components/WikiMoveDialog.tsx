import { useState } from 'react';
import type { Project } from '../types';
import { canMoveFolder, folderPath, type WikiMoveTarget } from '../lib/wiki-structure';
import { ModalFrame } from './Modals';

export function WikiMoveDialog({ project, target, onMove, onClose }: {
  project: Project; target: WikiMoveTarget; onMove: (destination?: string) => void; onClose: () => void;
}) {
  const folders = project.wikiFolders ?? [];
  const item = target.kind === 'folder' ? folders.find(f => f.id === target.id) : project.wikiEntries?.find(e => e.id === target.id);
  const current = target.kind === 'folder' ? folders.find(f => f.id === target.id)?.parentId : project.wikiEntries?.find(e => e.id === target.id)?.folderId;
  const [destination, setDestination] = useState(current ?? '');
  const choices = folders.filter(f => target.kind === 'article' || canMoveFolder(folders, target.id, f.id));
  const name = item && ('title' in item ? item.title : item.name);
  return <ModalFrame title={target.kind === 'article' ? 'Artikel verschieben' : 'Ordner verschieben'} onClose={onClose}>
    <form className="space-y-4 p-4" onSubmit={event => { event.preventDefault(); onMove(destination || undefined); }}>
      <p className="break-words text-sm">{name ? `„${name}“` : 'Dieser Eintrag ist nicht mehr vorhanden.'}{target.kind === 'folder' && ' wird mit allen Unterordnern und Artikeln verschoben.'}</p>
      <label className="block text-sm font-semibold">Zielordner in diesem Projekt<select autoFocus aria-label="Zielordner" className="mt-2 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal" value={destination} onChange={event => setDestination(event.target.value)}><option value="">{target.kind === 'folder' ? 'Oberste Ebene' : 'Unsortiert (ohne Ordner)'}</option>{choices.sort((a,b) => folderPath(folders,a.id).localeCompare(folderPath(folders,b.id),'de')).map(f => <option key={f.id} value={f.id}>{folderPath(folders, f.id)}</option>)}</select></label>
      <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">Abbrechen</button><button type="submit" disabled={!item || destination === (current ?? '')} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40">Verschieben</button></div>
    </form>
  </ModalFrame>;
}

import { Archive, ChevronRight, Database, Pencil, Plus, Settings, Trash2, UploadCloud } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, APP_VERSION, ORIGINAL_VERSION } from '../config';
import type { Project } from '../types';

/** Startbildschirm mit Projektübersicht (Aufbau wie im Original, ergänzt um Umbenennen/Löschen). */
export function ProjectList({
  projects,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onOpenSettings,
}: {
  projects: Project[];
  onOpen: (projectId: string) => void;
  onCreate: () => void;
  onRename: (project: Project) => void;
  onDelete: (project: Project) => void;
  onOpenSettings: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-5 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-10 flex items-center gap-4 sm:mb-12">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xl sm:h-16 sm:w-16">
            <Archive size={30} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{APP_NAME}</h1>
            <p className="font-medium text-slate-500">{APP_TAGLINE}</p>
          </div>
          <button onClick={onOpenSettings} className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-900" title="Speichern & Synchronisieren" aria-label="Einstellungen">
            <Settings size={22} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <div key={project.id} className="group relative">
              <button
                onClick={() => onOpen(project.id)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-left transition-all hover:border-slate-900 hover:shadow-lg"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="rounded-xl bg-slate-50 p-3 transition-colors group-hover:bg-slate-900 group-hover:text-white">
                    <Database size={24} />
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-slate-900" />
                </div>
                <h3 className="truncate pr-16 text-lg font-bold text-slate-900">{project.name}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {project.artworks.length} {project.artworks.length === 1 ? 'Kunstwerk' : 'Kunstwerke'} · {(project.wikiEntries ?? []).length} Wiki-Artikel
                </p>
              </button>
              <div className="absolute bottom-5 right-5 flex gap-1">
                <button onClick={() => onRename(project)} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-900" title="Umbenennen" aria-label={`${project.name} umbenennen`}>
                  <Pencil size={15} />
                </button>
                <button onClick={() => onDelete(project)} className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600" title="Löschen" aria-label={`${project.name} löschen`}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={onCreate}
            className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 p-6 text-left text-slate-400 transition-all hover:border-slate-400 hover:bg-white"
          >
            <Plus size={32} />
            <span className="font-bold">Neues Projekt erstellen</span>
          </button>
          {projects.length === 0 && (
            <button
              onClick={onOpenSettings}
              className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-slate-400 transition-all hover:border-slate-400 hover:bg-white"
            >
              <UploadCloud size={32} />
              <span className="font-bold">Backup importieren</span>
              <span className="text-xs">auch Daten aus der AI-Studio-Version</span>
            </button>
          )}
        </div>

        <p className="mt-10 text-center text-[11px] text-slate-400">
          v{APP_VERSION} · Nachbau der AI-Studio-App „Bild-KI“ ({ORIGINAL_VERSION}) · Daten bleiben lokal auf diesem Gerät
        </p>
      </div>
    </div>
  );
}

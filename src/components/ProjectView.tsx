import { useState, type DragEvent, type ReactNode } from 'react';
import { Archive, BookOpen, ChevronLeft, CloudOff, ImagePlus, LayoutGrid, Loader2, Settings, Sparkles, Upload } from 'lucide-react';
import type { Project, SessionInfo } from '../types';

export type ProjectViewMode = 'gallery' | 'wiki';

export function ProjectHeader({
  project,
  view,
  onViewChange,
  onBack,
  onUpload,
  uploadProgress,
  onOpenSettings,
  session,
}: {
  project: Project;
  view: ProjectViewMode;
  onViewChange: (view: ProjectViewMode) => void;
  onBack: () => void;
  onUpload: (files: File[]) => void;
  uploadProgress: { done: number; total: number } | null;
  onOpenSettings: () => void;
  session: SessionInfo;
}) {
  const navButton = (id: ProjectViewMode, label: string, icon: ReactNode) => (
    <button
      onClick={() => onViewChange(id)}
      aria-pressed={view === id}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-all ${
        view === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6 md:h-16 md:flex-nowrap md:py-0">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
          <button onClick={onBack} className="flex shrink-0 items-center gap-2 font-medium text-slate-500 transition-colors hover:text-slate-900" aria-label="Zur Projektübersicht">
            <ChevronLeft size={20} /> <Archive size={18} className="hidden sm:block" /> <span className="hidden sm:inline">ArtArchive</span>
          </button>
          <div className="h-4 w-px shrink-0 bg-slate-200" />
          <h2 className="truncate font-bold text-slate-900">{project.name}</h2>
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {navButton('gallery', 'Galerie', <LayoutGrid size={16} />)}
            {navButton('wiki', 'Wiki', <BookOpen size={16} />)}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {session.mock && (
            <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800 sm:flex" title="AI_MOCK ist aktiv">
              <Sparkles size={12} /> Demo-Modus
            </span>
          )}
          {(session.offline || session.aiAvailable === false) && (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500" title="KI-Funktionen nicht verfügbar">
              <CloudOff size={12} /> KI aus
            </span>
          )}
          {view === 'gallery' && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-900 transition-all hover:bg-slate-200 sm:px-4">
              {uploadProgress ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span>{uploadProgress ? `${uploadProgress.done}/${uploadProgress.total}` : 'Upload'}</span>
              <input
                type="file"
                multiple
                className="hidden"
                accept="image/*"
                disabled={uploadProgress !== null}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = '';
                  if (files.length > 0) onUpload(files);
                }}
              />
            </label>
          )}
          <button onClick={onOpenSettings} className="p-2 text-slate-400 transition-colors hover:text-slate-900" title="Speichern & Synchronisieren" aria-label="Einstellungen">
            <Settings size={20} />
          </button>
        </div>

        <nav className="flex w-full items-center gap-1 md:hidden">
          {navButton('gallery', 'Galerie', <LayoutGrid size={16} />)}
          {navButton('wiki', 'Wiki', <BookOpen size={16} />)}
        </nav>
      </div>
    </header>
  );
}

export function Gallery({
  project,
  analyzingIds,
  onSelect,
  onUpload,
}: {
  project: Project;
  analyzingIds: Set<string>;
  onSelect: (artworkId: string) => void;
  onUpload: (files: File[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) onUpload(files);
  };

  return (
    <div
      className={`min-h-[60vh] p-4 transition-colors sm:p-8 ${dragOver ? 'bg-purple-50/60' : ''}`}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {project.artworks.length === 0 ? (
        <label className="mx-auto flex max-w-lg cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-6 py-16 text-center text-slate-400 transition-all hover:border-slate-400 hover:bg-white">
          <ImagePlus size={40} />
          <span className="font-bold text-slate-600">Noch keine Kunstwerke</span>
          <span className="text-sm">Bilder hochladen oder hierher ziehen</span>
          <input
            type="file"
            multiple
            className="hidden"
            accept="image/*"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length > 0) onUpload(files);
            }}
          />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {project.artworks.map((artwork) => (
            <button
              key={artwork.id}
              onClick={() => onSelect(artwork.id)}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition-all hover:-translate-y-1 hover:shadow-2xl"
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
                <img src={artwork.imageUrl} alt={artwork.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                {analyzingIds.has(artwork.id) ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px]">
                    <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-purple-700 shadow">
                      <Loader2 size={14} className="animate-spin" /> Analysiere …
                    </span>
                  </div>
                ) : (
                  artwork.analyzed && (
                    <div className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 text-purple-600 shadow-sm backdrop-blur-sm">
                      <Sparkles size={14} />
                    </div>
                  )
                )}
              </div>
              <div className="p-4">
                <h3 className="truncate font-bold text-slate-900">{artwork.title}</h3>
                <p className="mt-1 truncate text-xs text-slate-500">{artwork.artist}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  ArrowUpDown,
  BookOpen,
  Bot,
  FileDown,
  FileText,
  LayoutGrid,
  LayoutList,
  Lightbulb,
  List,
  Loader2,
  Maximize,
  PenTool,
  Plus,
  Search,
  Shapes,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Artwork, DetailView, FocusArea, FormalAnalysis, Project } from '../types';
import { compressImage } from '../lib/image';
import { artworkMarkdownFilename, artworkToMarkdown } from '../lib/markdown-export';
import { downloadBlob, errorMessage, flattenClusters, formatDateTime, generateId } from '../lib/util';
import { AnalysisSetup } from './AnalysisSetup';
import { ImageWorkspace } from './ImageWorkspace';
import { ConfirmModal, useBodyScrollLock, useEscape, type ConfirmOptions } from './Modals';
import { ClusteredTagInput, TagInput } from './TagInputs';
import { useToast } from './Toasts';

type Tab = 'info' | 'description' | 'analysis' | 'catalog' | 'details';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'info', label: 'Basisdaten', icon: <FileText size={14} /> },
  { id: 'description', label: 'Beschreibung', icon: <List size={14} /> },
  { id: 'analysis', label: 'Formale Analyse', icon: <Bot size={14} /> },
  { id: 'catalog', label: 'Katalogtext', icon: <BookOpen size={14} /> },
  { id: 'details', label: 'Details', icon: <LayoutGrid size={14} /> },
];

const FORMAL_FIELDS: { id: keyof FormalAnalysis; label: string; icon: ReactNode }[] = [
  { id: 'composition', label: 'Bildkomposition', icon: <LayoutList size={14} /> },
  { id: 'lightAndShadow', label: 'Licht & Schatten', icon: <Lightbulb size={14} /> },
  { id: 'perspective', label: 'Perspektive & Raum', icon: <Maximize size={14} /> },
  { id: 'technique', label: 'Technik & Farbauftrag', icon: <PenTool size={14} /> },
  { id: 'visualRhythm', label: 'Visueller Rhythmus', icon: <ArrowUpDown size={14} /> },
  { id: 'iconography', label: 'Ikonographie', icon: <Search size={14} /> },
  { id: 'miscellaneous', label: 'Weitere Beobachtungen', icon: <Shapes size={14} /> },
];

const labelClass = 'mb-1 block text-[10px] font-bold uppercase text-gray-400';

function InfoField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <div className="border-b border-gray-100 transition-all focus-within:border-gray-300">
      <label className={labelClass}>{label}</label>
      <input className="w-full bg-transparent py-1 text-sm outline-none" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ColorAdder({ onAdd }: { onAdd: (color: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef(onAdd);
  useEffect(() => {
    addRef.current = onAdd;
  });
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const listener = () => addRef.current(input.value);
    input.addEventListener('change', listener); // „change“ = Auswahl abgeschlossen (nicht bei jedem Zwischenwert)
    return () => input.removeEventListener('change', listener);
  }, []);
  return (
    <label
      className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 transition-colors hover:border-black hover:text-black"
      title="Farbe hinzufügen"
    >
      <Plus size={16} />
      <input ref={inputRef} type="color" defaultValue="#8b5cf6" className="absolute inset-0 cursor-pointer opacity-0" aria-label="Farbe hinzufügen" />
    </label>
  );
}

export function ArtworkDetailModal({
  initialTab, onCreateNote, onCompare,
  artwork,
  project,
  aiAvailable,
  analyzing,
  onClose,
  onUpdate,
  onCreateArtwork,
  onDeleteArtwork,
  onAnalyze,
}: {
  initialTab?: Tab;
  onCreateNote: () => void;
  onCompare: () => void;
  artwork: Artwork;
  project: Project;
  aiAvailable: boolean;
  analyzing: boolean;
  onClose: () => void;
  onUpdate: (updater: (artwork: Artwork) => Artwork) => void;
  onCreateArtwork: (artwork: Artwork) => void;
  onDeleteArtwork: () => void;
  onAnalyze: (options: { focusAreas: FocusArea[]; hint: string }) => Promise<boolean>;
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'info');
  const [showAnalysisConfig, setShowAnalysisConfig] = useState(false);
  const [analysisHint, setAnalysisHint] = useState('');
  const [focusAreas, setFocusAreas] = useState<FocusArea[]>(['artist', 'style', 'composition']);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const detailInputRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock();
  useEscape(() => {
    if (showAnalysisConfig) setShowAnalysisConfig(false);
    else onClose();
  });

  const patch = (changes: Partial<Artwork>) => onUpdate((current) => ({ ...current, ...changes }));

  const detailViews = artwork.detailViews ?? [];
  const selectedDetail = selectedDetailId ? detailViews.find((detail) => detail.id === selectedDetailId) : undefined;
  const currentImage = selectedDetail?.imageUrl ?? artwork.imageUrl;

  const toggleFocus = (area: FocusArea) =>
    setFocusAreas((previous) => (previous.includes(area) ? previous.filter((item) => item !== area) : [...previous, area]));

  const startAnalysis = async () => {
    setShowAnalysisConfig(false);
    const ok = await onAnalyze({ focusAreas, hint: analysisHint });
    if (ok) setAnalysisHint('');
  };

  const addDetail = (imageUrl: string, title: string) => {
    const detail: DetailView = { id: generateId(), imageUrl, title };
    onUpdate((current) => ({ ...current, detailViews: [...(current.detailViews ?? []), detail] }));
    return detail;
  };

  const handleDetailUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    for (const file of files) {
      try {
        addDetail(await compressImage(file), file.name.replace(/\.[^.]+$/, ''));
      } catch (error) {
        toast.error(errorMessage(error, `„${file.name}“ konnte nicht geladen werden.`));
      }
    }
  };

  const askDeleteDetail = (id: string) =>
    setConfirm({
      title: 'Detail löschen?',
      message: 'Dieses Detailbild wird dauerhaft entfernt.',
      action: () => {
        onUpdate((current) => ({ ...current, detailViews: (current.detailViews ?? []).filter((detail) => detail.id !== id) }));
        if (selectedDetailId === id) setSelectedDetailId(null);
      },
    });

  const askDeleteArtwork = () =>
    setConfirm({
      title: 'Werk löschen?',
      message: `„${artwork.title}“ wird mit allen Details und Texten dauerhaft entfernt.`,
      action: onDeleteArtwork,
    });

  const createFromCrop = (imageUrl: string) => {
    const now = Date.now();
    onCreateArtwork({
      ...artwork,
      id: generateId(),
      imageUrl,
      title: `${artwork.title} (Ausschnitt)`,
      analyzed: false,
      detailViews: [],
      createdAt: now,
      updatedAt: now,
      analyzedAt: undefined,
      analysisModel: undefined,
    });
    toast.success('Ausschnitt als neues Werk gespeichert.');
  };

  const exportMarkdown = () => {
    downloadBlob(new Blob([artworkToMarkdown(artwork, project)], { type: 'text/markdown;charset=utf-8' }), artworkMarkdownFilename(artwork));
  };

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label={artwork.title}>
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-[90vh] sm:rounded-2xl md:flex-row">
        {/* Links: Bild */}
        <div className="relative h-[38vh] shrink-0 bg-gray-100 md:h-auto md:w-1/2">
          <ImageWorkspace
            src={currentImage}
            onClose={onClose}
            onSaveAsArtwork={createFromCrop}
            onSaveDetail={(imageUrl) => {
              addDetail(imageUrl, 'Detail');
              toast.success('Ausschnitt als Detail hinzugefügt.');
            }}
            onDelete={selectedDetail ? () => askDeleteDetail(selectedDetail.id) : askDeleteArtwork}
            deleteLabel={selectedDetail ? 'Detail löschen' : 'Werk löschen'}
          />
          {selectedDetail && (
            <button
              onClick={() => setSelectedDetailId(null)}
              className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white hover:bg-black"
            >
              Detail „{selectedDetail.title}“ · zurück zum Gesamtwerk
            </button>
          )}
        </div>

        {/* Rechts: Inhalte */}
        <div className="relative flex min-h-0 flex-1 flex-col border-gray-100 bg-white md:w-1/2 md:border-l">
          {showAnalysisConfig && (
            <AnalysisSetup
              focusAreas={focusAreas}
              onToggleFocus={toggleFocus}
              hint={analysisHint}
              onHintChange={setAnalysisHint}
              onStart={() => void startAnalysis()}
              onCancel={() => setShowAnalysisConfig(false)}
              aiAvailable={aiAvailable}
              alreadyAnalyzed={artwork.analyzed}
            />
          )}

          <div className="flex items-start gap-3 border-b border-gray-100 bg-white p-4 sm:p-6">
            <div className="min-w-0 flex-1">
              <input
                value={artwork.title}
                onChange={(event) => patch({ title: event.target.value })}
                className="w-full border-none bg-transparent p-0 font-serif text-xl font-bold outline-none focus:ring-0 sm:text-2xl"
                placeholder="Titel des Werks"
                aria-label="Titel des Werks"
              />
              <input
                value={artwork.artist}
                onChange={(event) => patch({ artist: event.target.value })}
                className="w-full border-none bg-transparent p-0 text-sm text-gray-500 outline-none focus:ring-0"
                placeholder="Künstler / Schule"
                aria-label="Künstler / Schule"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button
                onClick={() => setShowAnalysisConfig(true)}
                disabled={analyzing}
                className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold shadow-sm transition-all sm:px-4 ${
                  analyzing ? 'bg-gray-100 text-gray-400' : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                <span className="hidden sm:inline">{analyzing ? 'Analysiere …' : 'KI-Analyse'}</span>
              </button>
              <button onClick={exportMarkdown} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100" title="Als Markdown (Obsidian) exportieren" aria-label="Als Markdown exportieren">
                <FileDown size={20} />
              </button>
              <button onClick={onClose} className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100" aria-label="Schließen">
                <X size={24} />
              </button>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 border-b px-3 py-2 sm:px-6">
            <button onClick={onCreateNote} className="rounded-lg border px-3 py-2 text-sm">Notiz / Aufgabe zu diesem Bild</button>
            <button onClick={onCompare} className="rounded-lg border px-3 py-2 text-sm">Zum Bildvergleich</button>
          </div>
          <div className="scrollbar-hide flex shrink-0 overflow-x-auto border-b border-gray-50 bg-gray-50/50 px-3 sm:px-6" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedDetailId(null);
                }}
                className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[10px] font-bold uppercase tracking-widest transition-all sm:px-4 ${
                  activeTab === tab.id ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto bg-white p-5 sm:p-8">
            {activeTab === 'info' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                  <InfoField label="Jahr / Datierung" value={artwork.year} placeholder="z. B. ca. 1912" onChange={(year) => patch({ year })} />
                  <InfoField label="Technik" value={artwork.medium} placeholder="z. B. Öl auf Holz" onChange={(medium) => patch({ medium })} />
                  <InfoField label="Maße" value={artwork.dimensions} placeholder="z. B. 45 x 60 cm" onChange={(dimensions) => patch({ dimensions })} />
                  <InfoField label="Inventar-Nr." value={artwork.inventoryNumber} placeholder="Inv. 1234/A" onChange={(inventoryNumber) => patch({ inventoryNumber })} />
                  <InfoField label="Standort" value={artwork.location} placeholder="z. B. Gemäldegalerie Berlin" onChange={(location) => patch({ location })} />
                </div>

                <TagInput label="Stil / Epoche / Schule" tags={artwork.styleTags ?? []} onUpdate={(styleTags) => patch({ styleTags })} placeholder="+ Tag hinzufügen" />
                <ClusteredTagInput
                  clusters={artwork.elementClusters ?? {}}
                  onUpdate={(elementClusters) => patch({ elementClusters, elementTags: flattenClusters(elementClusters) })}
                />

                <div>
                  <label className="mb-4 block text-[10px] font-bold uppercase text-gray-400">Dominante Farben</label>
                  <div className="flex flex-wrap gap-3">
                    {(artwork.colors ?? []).map((color, index) => (
                      <div key={`${color}-${index}`} className="relative h-10 w-10 rounded-full border shadow-sm" style={{ backgroundColor: color }} title={color}>
                        <button
                          onClick={() => patch({ colors: (artwork.colors ?? []).filter((_, i) => i !== index) })}
                          className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-gray-500 shadow-md hover:text-red-600"
                          aria-label={`Farbe ${color} entfernen`}
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                    <ColorAdder onAdd={(color) => onUpdate((current) => ({ ...current, colors: [...(current.colors ?? []), color] }))} />
                  </div>
                </div>

                {artwork.analyzed && (
                  <p className="flex items-center gap-2 text-xs text-gray-400">
                    <Sparkles size={12} className="text-purple-400" />
                    KI-analysiert{artwork.analyzedAt ? ` am ${formatDateTime(artwork.analyzedAt)}` : ''}
                    {artwork.analysisModel ? ` · ${artwork.analysisModel}` : ''}
                  </p>
                )}
              </div>
            )}

            {activeTab === 'description' && (
              <div className="space-y-8">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase text-gray-400">Beschreibung des Werks</label>
                  <textarea
                    className="h-72 w-full rounded-xl border border-gray-100 bg-gray-50/30 p-4 text-sm leading-relaxed outline-none transition-all focus:ring-1 focus:ring-black"
                    placeholder="Beschreiben Sie das Werk..."
                    value={artwork.description}
                    onChange={(event) => patch({ description: event.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase text-gray-400">Historischer & biografischer Kontext</label>
                  <textarea
                    className="h-48 w-full rounded-xl border border-gray-100 bg-gray-50/30 p-4 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-black"
                    placeholder="Wird von der KI-Analyse befüllt oder selbst verfasst..."
                    value={artwork.contextAnalysis ?? ''}
                    onChange={(event) => patch({ contextAnalysis: event.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase text-gray-400">Provenienz & Besitzgeschichte</label>
                  <textarea
                    className="h-32 w-full rounded-xl border border-gray-100 bg-gray-50/30 p-4 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-black"
                    value={artwork.provenance}
                    onChange={(event) => patch({ provenance: event.target.value })}
                    placeholder="Verlauf der Besitzverhältnisse..."
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase text-gray-400">Notizen</label>
                  <textarea
                    className="h-32 w-full rounded-xl border border-gray-100 bg-amber-50/30 p-4 text-sm leading-relaxed outline-none focus:ring-1 focus:ring-black"
                    value={artwork.notes ?? ''}
                    onChange={(event) => patch({ notes: event.target.value })}
                    placeholder="Eigene Beobachtungen, offene Fragen..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="space-y-10 pb-12">
                {FORMAL_FIELDS.map((field) => (
                  <div key={field.id}>
                    <label className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase text-gray-400">
                      {field.icon} {field.label}
                    </label>
                    <textarea
                      className="h-32 w-full rounded-xl border border-gray-100 bg-purple-50/5 p-4 text-sm leading-relaxed outline-none transition-all focus:ring-1 focus:ring-purple-600"
                      value={artwork.formalAnalysis?.[field.id] ?? ''}
                      onChange={(event) =>
                        onUpdate((current) => ({ ...current, formalAnalysis: { ...(current.formalAnalysis ?? {}), [field.id]: event.target.value } }))
                      }
                      placeholder={`${field.label} beschreiben...`}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'catalog' && (
              <div className="h-full">
                <label className="mb-2 block text-[10px] font-bold uppercase text-gray-400">Wissenschaftlicher Katalogeintrag</label>
                <textarea
                  className="h-[500px] w-full rounded-xl border border-gray-100 bg-stone-50/20 p-5 font-serif text-lg leading-loose shadow-inner outline-none transition-all focus:ring-1 focus:ring-stone-600 sm:p-8"
                  placeholder="Katalogtext verfassen..."
                  value={artwork.catalogText}
                  onChange={(event) => patch({ catalogText: event.target.value })}
                />
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-6 pb-12">
                <input type="file" ref={detailInputRef} className="hidden" accept="image/*" multiple onChange={(event) => void handleDetailUpload(event)} />
                <div className="grid grid-cols-2 gap-4">
                  {detailViews.map((detail) => (
                    <div
                      key={detail.id}
                      onClick={() => setSelectedDetailId(detail.id)}
                      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg border bg-gray-100 transition-all ${
                        selectedDetailId === detail.id ? 'border-transparent ring-2 ring-black' : 'hover:border-gray-400'
                      }`}
                    >
                      <img src={detail.imageUrl} alt={detail.title} className="h-full w-full object-cover" />
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          askDeleteDetail(detail.id);
                        }}
                        className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-red-500 shadow transition-transform hover:scale-110"
                        aria-label="Detail löschen"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[10px] text-white">{detail.title}</div>
                    </div>
                  ))}
                  <button
                    onClick={() => detailInputRef.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-gray-400 transition-all hover:border-black hover:bg-gray-50 hover:text-black"
                  >
                    <Plus size={24} />
                    <span className="mt-2 text-xs font-bold">Upload</span>
                  </button>
                </div>
                <p className="text-xs text-gray-400">Tipp: Im Bild auf das Schere-Symbol tippen, Ausschnitt einstellen und „Als Detail hinzufügen“ wählen.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}

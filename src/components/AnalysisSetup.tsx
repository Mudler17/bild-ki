import { Sparkles } from 'lucide-react';
import type { FocusArea } from '../types';

export const FOCUS_OPTIONS: { id: FocusArea; label: string }[] = [
  { id: 'artist', label: 'Künstler-Identifikation' },
  { id: 'style', label: 'Epochen-Einordnung' },
  { id: 'composition', label: 'Komposition' },
  { id: 'iconography', label: 'Ikonographie' },
  { id: 'technique', label: 'Technik-Analyse' },
];

/** „Forschungs-Setup“ vor der KI-Analyse – wie im Original. */
export function AnalysisSetup({
  focusAreas,
  onToggleFocus,
  hint,
  onHintChange,
  onStart,
  onCancel,
  aiAvailable,
  alreadyAnalyzed,
}: {
  focusAreas: FocusArea[];
  onToggleFocus: (area: FocusArea) => void;
  hint: string;
  onHintChange: (value: string) => void;
  onStart: () => void;
  onCancel: () => void;
  aiAvailable: boolean;
  alreadyAnalyzed: boolean;
}) {
  return (
    <div className="animate-fade-in absolute inset-0 z-40 flex flex-col items-center justify-center overflow-y-auto bg-white/95 p-6 backdrop-blur-md sm:p-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-purple-600">
            <Sparkles size={32} />
          </div>
          <h3 className="text-xl font-bold">Forschungs-Setup</h3>
          <p className="mt-1 text-sm text-gray-500">Konkretisieren Sie die Analyse-Ziele für die KI.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase text-gray-400">Fokus-Bereiche</label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((area) => (
                <button
                  key={area.id}
                  onClick={() => onToggleFocus(area.id)}
                  aria-pressed={focusAreas.includes(area.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    focusAreas.includes(area.id)
                      ? 'border-purple-600 bg-purple-600 text-white'
                      : 'bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {area.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="analysis-hint" className="mb-2 block text-[10px] font-bold uppercase text-gray-400">
              Zusätzlicher Kontext / Fragen
            </label>
            <textarea
              id="analysis-hint"
              className="min-h-[100px] w-full rounded-xl border p-3 text-sm outline-none transition-all focus:ring-1 focus:ring-purple-600"
              placeholder="z. B. Wissen Sie etwas über den Hintergrund? Oder haben Sie eine spezifische Frage zum Bild?"
              value={hint}
              maxLength={2000}
              onChange={(event) => onHintChange(event.target.value)}
            />
          </div>

          {alreadyAnalyzed && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Das Werk wurde bereits analysiert. Eine neue Analyse überschreibt die KI-Felder (Titel, Künstler, Beschreibung,
              Formanalyse …). Inventar-Nr., Provenienz, Katalogtext und Notizen bleiben erhalten.
            </p>
          )}
          {!aiAvailable && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              Die KI ist auf dem Server nicht eingerichtet (OPENAI_API_KEY fehlt) oder der Server ist nicht erreichbar.
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="flex-1 rounded-xl py-3 text-sm font-bold text-gray-500 transition-colors hover:bg-gray-50">
            Abbrechen
          </button>
          <button
            onClick={onStart}
            disabled={!aiAvailable}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-sm font-bold text-white shadow-lg shadow-purple-200 transition-all hover:bg-purple-700 disabled:opacity-40"
          >
            <Sparkles size={16} /> Analyse starten
          </button>
        </div>
      </div>
    </div>
  );
}

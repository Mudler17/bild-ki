import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Copy, Crop, LayoutGrid, RotateCcw, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { cropVisibleArea } from '../lib/image';

/**
 * Bild-Werkbank: Zoomen (Knöpfe, Mausrad, Zwei-Finger-Geste), Verschieben, Einpassen,
 * Ausschneiden des sichtbaren Bereichs (als neues Werk oder als Detailansicht).
 * Anders als im Original ist die Werkzeugleiste immer sichtbar – auf Touch-Geräten gibt es kein „Hover“.
 */

const MIN_SCALE = 0.05;
const MAX_SCALE = 10;
const clamp = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function ImageWorkspace({
  src,
  onClose,
  onSaveAsArtwork,
  onSaveDetail,
  onDelete,
  deleteLabel = 'Löschen',
}: {
  src: string;
  onClose: () => void;
  onSaveAsArtwork: (dataUrl: string) => void;
  onSaveDetail?: (dataUrl: string) => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<'view' | 'crop'>('view');
  const [dragging, setDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; scale: number } | null>(null);

  const fitImage = useCallback(() => {
    const image = imageRef.current;
    const container = containerRef.current;
    if (!image || !container || !image.naturalWidth) return;
    const ratio = Math.min(
      (container.clientWidth * 0.9) / image.naturalWidth,
      (container.clientHeight * 0.9) / image.naturalHeight,
    );
    setScale(clamp(ratio || 1));
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setMode('view');
    if (imageRef.current?.complete) fitImage();
  }, [src, fitImage]);

  // Neu einpassen, wenn sich die Fläche ändert (z. B. iPad drehen)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => fitImage());
    observer.observe(container);
    return () => observer.disconnect();
  }, [fitImage]);

  // Mausrad/Trackpad-Zoom (nicht-passiver Listener, damit die Seite nicht scrollt)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      setScale((current) => clamp(current * factor));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = { distance: distance(a, b) || 1, scale };
    }
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const start = pinch.current;
      setScale(clamp((start.scale * distance(a, b)) / start.distance));
      setPan((current) => ({ x: current.x + (next.x - previous.x) / 2, y: current.y + (next.y - previous.y) / 2 }));
    } else {
      setPan((current) => ({ x: current.x + next.x - previous.x, y: current.y + next.y - previous.y }));
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const crop = (): string | null => {
    if (!imageRef.current || !containerRef.current) return null;
    return cropVisibleArea(imageRef.current, containerRef.current);
  };

  const toolButton = 'rounded p-1.5 text-white transition-colors hover:bg-white/20';

  return (
    <div className="relative flex h-full w-full select-none flex-col overflow-hidden bg-gray-900">
      <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/75 p-1.5 shadow-lg backdrop-blur-md">
        <button onClick={() => setScale((s) => clamp(s / 1.25))} className={toolButton} title="Verkleinern" aria-label="Verkleinern">
          <ZoomOut size={16} />
        </button>
        <button onClick={() => setScale((s) => clamp(s * 1.25))} className={toolButton} title="Vergrößern" aria-label="Vergrößern">
          <ZoomIn size={16} />
        </button>
        <button onClick={fitImage} className={toolButton} title="Einpassen" aria-label="Einpassen">
          <RotateCcw size={16} />
        </button>
        {onDelete && mode === 'view' && (
          <button onClick={onDelete} className="ml-1 rounded border-l border-white/20 p-1.5 pl-2 text-red-400 hover:bg-red-500/20" title={deleteLabel} aria-label={deleteLabel}>
            <Trash2 size={16} />
          </button>
        )}
        {mode === 'view' ? (
          <button onClick={() => setMode('crop')} className={`${toolButton} ml-1 border-l border-white/20 pl-2`} title="Zuschneiden" aria-label="Zuschneiden">
            <Crop size={16} />
          </button>
        ) : (
          <>
            <button onClick={() => setMode('view')} className="ml-1 rounded border-l border-white/20 p-1.5 pl-2 text-red-400 hover:bg-red-500/20" title="Abbrechen" aria-label="Zuschneiden abbrechen">
              <X size={16} />
            </button>
            <button
              onClick={() => {
                const result = crop();
                if (result) onSaveAsArtwork(result);
                setMode('view');
              }}
              className="rounded p-1.5 text-blue-300 hover:bg-blue-500/20"
              title="Als neues Werk speichern"
              aria-label="Ausschnitt als neues Werk speichern"
            >
              <Copy size={16} />
            </button>
            {onSaveDetail && (
              <button
                onClick={() => {
                  const result = crop();
                  if (result) onSaveDetail(result);
                  setMode('view');
                }}
                className="rounded p-1.5 text-green-300 hover:bg-green-500/20"
                title="Als Detail hinzufügen"
                aria-label="Ausschnitt als Detail hinzufügen"
              >
                <LayoutGrid size={16} />
              </button>
            )}
          </>
        )}
      </div>

      <button onClick={onClose} className="absolute left-3 top-3 z-20 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black" aria-label="Schließen">
        <X size={20} />
      </button>

      <div
        ref={containerRef}
        className="relative flex flex-1 cursor-move touch-none items-center justify-center overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={fitImage}
      >
        <img
          ref={imageRef}
          src={src}
          alt=""
          draggable={false}
          onLoad={fitImage}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transition: dragging ? 'none' : 'transform 0.1s',
          }}
          className="pointer-events-none max-w-none shadow-2xl"
        />
        {mode === 'crop' && (
          <div className="pointer-events-none absolute inset-2 rounded border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]">
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1 text-[11px] text-white">
              Sichtbarer Bereich wird ausgeschnitten
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

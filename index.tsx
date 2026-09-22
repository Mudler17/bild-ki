
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Type } from "@google/genai";
import {
  Plus,
  Upload,
  BookOpen,
  Trash2,
  X,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Settings,
  FileText,
  LayoutList,
  PenTool,
  Hash,
  Move,
  ChevronLeft,
  Calendar,
  Save,
  Search,
  ArrowUpDown,
  Filter,
  ZoomIn,
  ZoomOut,
  Crop,
  RotateCcw,
  Check,
  Maximize,
  Minimize,
  Copy,
  Scan,
  Tag,
  PieChart,
  Columns,
  Scale,
  Download,
  UploadCloud,
  RefreshCcw,
  AlertTriangle,
  Archive,
  Folder,
  FolderOpen,
  HardDrive,
  Database,
  History,
  Edit3,
  List,
  MoreVertical,
  Bot,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  File,
  CornerDownRight,
  Link as LinkIcon,
  Lightbulb,
  Network,
  NotebookPen,
  LayoutGrid,
  Eye
} from "lucide-react";

// --- Types ---

interface DetailView {
  id: string;
  imageUrl: string;
  title: string;
  description?: string; 
}

interface FormalAnalysis {
  composition?: string;
  lightAndShadow?: string;
  perspective?: string;
  technique?: string;
  visualRhythm?: string;
  iconography?: string;
  miscellaneous?: string;
}

interface Artwork {
  id: string;
  imageUrl: string;
  title: string;
  artist: string;
  year: string;
  description: string;
  styleTags: string[];
  elementTags: string[]; 
  elementClusters: Record<string, string[]>;
  colors?: string[];
  analyzed: boolean;
  inventoryNumber: string;
  medium: string; 
  dimensions: string; 
  location: string; 
  provenance: string; 
  catalogText: string; 
  contextAnalysis?: string;
  formalAnalysis?: FormalAnalysis; 
  notes?: string; 
  detailViews?: DetailView[]; 
  deletedAt?: number; 
}

interface WikiEntry {
  id: string;
  folderId?: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  source: 'user' | 'ai';
}

interface WikiFolder {
  id: string;
  name: string;
  parentId?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  artworks: Artwork[];
  historicalContext: string;
  wikiEntries?: WikiEntry[];
  wikiFolders?: WikiFolder[]; 
  notes?: string; 
}

interface WikiSuggestion {
  targetTitle: string;
  reason: string;
  type: 'text-match' | 'ai-related' | 'artwork-match';
}

// --- Constants ---

const APP_VERSION = "v1.9.5";

// --- Helper Functions ---

const generateId = () => Math.random().toString(36).substring(2, 9);

const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      const MAX_SIZE = 2000;
      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas context failed"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL("image/jpeg", 0.8);
      URL.revokeObjectURL(url);
      resolve(base64);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
  });
};

const flattenClusters = (clusters: Record<string, string[]>): string[] => {
  return Array.from(new Set(Object.values(clusters || {}).reduce((acc, val) => acc.concat(val), [])));
};

// --- Components ---

const ConfirmModal = ({ title, message, onConfirm, onClose }: { title: string, message: string, onConfirm: () => void, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 transform scale-100 transition-all">
        <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2"><AlertTriangle className="text-red-500" size={20}/> {title}</h3>
        <p className="text-gray-600 mb-6 leading-relaxed text-sm">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors">Abbrechen</button>
          <button onClick={() => { onConfirm(); onClose(); }} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium shadow-sm transition-colors">Löschen</button>
        </div>
      </div>
    </div>
  );
};

const BackupModal = ({ onExport, onImport, onLinkFolder, isSyncing, linkedFolderName, folderError, onClose }: any) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
          <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800"><Save size={20} /> Speichern & Synchronisieren</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-8">
           <div>
              <div className="flex items-center gap-2 mb-2">
                 <div className={`p-2 rounded-full ${linkedFolderName ? 'bg-green-100 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                    {linkedFolderName ? <Check size={20}/> : <FolderOpen size={20}/>}
                 </div>
                 <h4 className="font-bold text-gray-800">Ordner-Synchronisation</h4>
              </div>
              <p className="text-sm text-gray-600 mb-4 pl-11">Daten automatisch in einem lokalen Ordner speichern.</p>
              <div className="pl-11">
                 {linkedFolderName ? (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between"><span className="text-sm font-medium text-green-800 flex items-center gap-2"><Folder size={16}/> {linkedFolderName}</span>{isSyncing && <span className="text-xs text-green-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> Sync...</span>}</div>
                 ) : (
                    <button onClick={onLinkFolder} className="w-full bg-slate-900 text-white hover:bg-slate-800 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"><HardDrive size={16}/> Ordner verknüpfen</button>
                 )}
                 {folderError && <div className="mt-3 bg-amber-50 border border-amber-100 text-amber-800 text-xs p-3 rounded-lg flex gap-2 items-start"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><div><p className="font-bold mb-1">Hinweis</p><p>{folderError}</p></div></div>}
              </div>
           </div>
           <div className="h-px bg-gray-100"></div>
           <div className="grid grid-cols-2 gap-3 pl-11">
              <button onClick={onExport} className="border border-gray-200 hover:border-slate-900 hover:bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"><Download size={16}/> Export (JSON)</button>
              <button onClick={onImport} className="border border-gray-200 hover:border-slate-900 hover:bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2"><UploadCloud size={16}/> Import (JSON)</button>
           </div>
        </div>
      </div>
    </div>
  );
};

const WikiContentRenderer = ({ content, onNavigate, artworks = [], wikiEntries = [] }: any) => {
  const parts = content.split(/(\[\[.*?\]\])/g);
  return (
    <div className="prose prose-slate max-w-3xl mx-auto leading-relaxed text-gray-800">
      {parts.map((part: string, index: number) => {
        if (part.startsWith('[[') && part.endsWith(']]')) {
          const title = part.slice(2, -2);
          const isArtwork = artworks.some((a: any) => a.title.toLowerCase() === title.toLowerCase());
          const isWiki = wikiEntries.some((e: any) => e.title.toLowerCase() === title.toLowerCase());
          let linkClass = "text-blue-600 bg-blue-50 hover:bg-blue-100";
          let icon = <LinkIcon size={10} />;
          if (isArtwork) { linkClass = "text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100"; icon = <ImageIcon size={10} />; } 
          else if (!isWiki) { linkClass = "text-red-400 bg-red-50 hover:bg-red-100 decoration-dashed"; }
          return <button key={index} onClick={() => onNavigate(title)} className={`${linkClass} hover:underline font-medium inline-flex items-center gap-1 px-1.5 py-0.5 rounded mx-0.5 cursor-pointer text-sm align-baseline transition-colors`}>{icon}{title}</button>;
        }
        return <span key={index} dangerouslySetInnerHTML={{ __html: part.replace(/\n/g, '<br/>') }} />;
      })}
    </div>
  );
};

const ImageWorkspace = ({ src, onSave, onClose, onSaveDetail, onDelete }: any) => {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"view"|"crop">("view");
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef<{x: number, y: number} | null>(null);

  const fitImage = () => {
    if (imgRef.current && containerRef.current) {
      const container = containerRef.current;
      const img = imgRef.current;
      const ratio = Math.min(
        (container.clientWidth * 0.9) / img.naturalWidth,
        (container.clientHeight * 0.9) / img.naturalHeight
      );
      setScale(ratio || 1);
      setPan({x:0, y:0});
    }
  };

  useEffect(() => {
    if (imgRef.current?.complete) {
        fitImage();
    }
  }, [src]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !lastPos.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsDragging(false);
    lastPos.current = null;
  };

  const getCroppedImage = () => {
      if (!imgRef.current || !containerRef.current) return src;
      const img = imgRef.current;
      const container = containerRef.current;
      const imgRect = img.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const scaleX = img.naturalWidth / imgRect.width;
      const scaleY = img.naturalHeight / imgRect.height;
      const visibleLeft = Math.max(imgRect.left, contRect.left);
      const visibleTop = Math.max(imgRect.top, contRect.top);
      const visibleRight = Math.min(imgRect.right, contRect.right);
      const visibleBottom = Math.min(imgRect.bottom, contRect.bottom);
      const cropX = (visibleLeft - imgRect.left) * scaleX;
      const cropY = (visibleTop - imgRect.top) * scaleY;
      const cropW = (visibleRight - visibleLeft) * scaleX;
      const cropH = (visibleBottom - visibleTop) * scaleY;
      if (cropW <= 0 || cropH <= 0) return src;
      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d');
      if (ctx) { ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH); return canvas.toDataURL('image/jpeg', 0.95); }
      return src;
  };

  return (
    <div className="relative w-full h-full bg-gray-900 overflow-hidden flex flex-col group select-none">
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-2 bg-black/80 p-2 rounded-full backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
         <button onClick={() => setScale(s => Math.max(0.1, s - 0.2))} className="text-white p-1 hover:bg-white/20 rounded" title="Zoom Out"><ZoomOut size={16}/></button>
         <button onClick={() => setScale(s => Math.min(10, s + 0.2))} className="text-white p-1 hover:bg-white/20 rounded" title="Zoom In"><ZoomIn size={16}/></button>
         <button onClick={fitImage} className="text-white p-1 hover:bg-white/20 rounded" title="Einpassen"><RotateCcw size={16}/></button>
         {onDelete && <button onClick={onDelete} className="text-red-400 p-1 border-l border-white/20 pl-2 ml-1 hover:bg-red-500/20 rounded" title="Löschen"><Trash2 size={16}/></button>}
         {mode === 'view' ? <button onClick={() => setMode('crop')} className="text-white p-1 border-l border-white/20 pl-2 ml-1 hover:bg-white/20 rounded" title="Zuschneiden"><Crop size={16}/></button> : 
         <>
            <button onClick={() => setMode('view')} className="text-red-400 p-1 border-l border-white/20 pl-2 ml-1 hover:bg-red-500/20 rounded" title="Abbrechen"><X size={16}/></button>
            <button onClick={() => { const c = getCroppedImage(); onSave(c, true); setMode('view'); }} className="text-blue-400 p-1 hover:bg-blue-500/20 rounded" title="Als neues Werk speichern"><Copy size={16}/></button>
            {onSaveDetail && <button onClick={() => { const c = getCroppedImage(); onSaveDetail(c); setMode('view'); }} className="text-green-400 p-1 hover:bg-green-500/20 rounded" title="Als Detail hinzufügen"><LayoutGrid size={16}/></button>}
         </>}
      </div>
      <button onClick={onClose} className="absolute top-4 left-4 z-20 text-white p-2 bg-black/50 hover:bg-black rounded-full transition-colors"><X size={20}/></button>
      <div 
         ref={containerRef}
         className="flex-1 flex items-center justify-center overflow-hidden cursor-move touch-none"
         onPointerDown={handlePointerDown}
         onPointerMove={handlePointerMove}
         onPointerUp={handlePointerUp}
         onPointerLeave={handlePointerUp}
      >
         <img ref={imgRef} src={src} onLoad={fitImage} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transition: isDragging ? 'none' : 'transform 0.1s' }} className="max-w-none pointer-events-none shadow-2xl" />
      </div>
    </div>
  );
};

const TagInput = ({ tags, onUpdate, label, placeholder }: any) => {
  const [input, setInput] = useState("");
  return (
    <div className="mb-4"><label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</label><div className="flex flex-wrap gap-2 mb-2">{tags.map((tag:string, i:number) => (<span key={i} className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs flex gap-1 items-center">{tag} <button onClick={() => onUpdate(tags.filter((_:any,idx:number) => idx!==i))}><X size={10}/></button></span>))}</div><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&input.trim()){onUpdate([...tags,input.trim()]);setInput("");}}} className="w-full border-b bg-transparent py-1 text-sm outline-none focus:border-blue-500 transition-colors" placeholder={placeholder}/></div>
  );
};

const ClusteredTagInput = ({ clusters, onUpdate }: any) => {
   const [newCat, setNewCat] = useState("");
   return (
      <div className="space-y-4 mb-8">
         <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">Elemente & Details</label>
         {Object.entries(clusters || {}).map(([cat, tags]: any) => (
            <div key={cat} className="bg-gray-50/50 p-3 rounded-lg border border-gray-100"><div className="font-bold text-xs text-gray-700 mb-2">{cat}</div><div className="flex flex-wrap gap-2">{tags.map((t:string)=><span key={t} className="bg-white border px-2 py-1 rounded text-[11px] flex gap-1 items-center">{t}<button onClick={()=>{const n={...clusters}; n[cat]=tags.filter((x:string)=>x!==t); if(!n[cat].length) delete n[cat]; onUpdate(n);}}><X size={10}/></button></span>)}</div><input className="w-full bg-transparent text-[11px] border-b mt-2 outline-none border-transparent focus:border-gray-300 transition-colors" placeholder="+ Element hinzufügen" onKeyDown={(e)=>{if(e.key==='Enter' && e.currentTarget.value){const n={...clusters}; n[cat]=[...tags, e.currentTarget.value]; onUpdate(n); e.currentTarget.value="";}}}/></div>
         ))}
         <div className="flex gap-2"><input value={newCat} onChange={e=>setNewCat(e.target.value)} className="border rounded px-2 py-1 text-xs flex-1 outline-none focus:ring-1 focus:ring-black" placeholder="Neue Kategorie erstellen..." onKeyDown={e=>{if(e.key==='Enter'&&newCat){onUpdate({...clusters,[newCat]:[]});setNewCat("");}}} /><button onClick={()=>{if(newCat){onUpdate({...clusters,[newCat]:[]});setNewCat("");}}} className="bg-gray-900 text-white p-1 rounded-lg hover:bg-black transition-colors"><Plus size={16}/></button></div>
      </div>
   );
};

const ArtworkDetailModal = ({ artwork, artworks, onClose, onUpdate, onCreateArtwork, onDeleteArtwork }: any) => {
  const [activeTab, setActiveTab] = useState<'info' | 'description' | 'analysis' | 'catalog' | 'details'>('info');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisConfig, setShowAnalysisConfig] = useState(false);
  const [analysisHint, setAnalysisHint] = useState("");
  const [focusAreas, setFocusAreas] = useState<string[]>(["artist", "style", "composition"]);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  
  // Fix: Added missing state and ref
  const [confirmConfig, setConfirmConfig] = useState<{title: string, message: string, action: () => void} | null>(null);
  const detailInputRef = useRef<HTMLInputElement>(null);

  const toggleFocus = (area: string) => {
      setFocusAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);
  };

  // Fix: Added handleDeleteDetail function
  const handleDeleteDetail = (id: string) => {
     setConfirmConfig({
        title: "Detail löschen?",
        message: "Dieses Detailbild wird dauerhaft entfernt.",
        action: () => {
            onUpdate({ ...artwork, detailViews: (artwork.detailViews || []).filter((d: any) => d.id !== id) });
            if (selectedDetailId === id) setSelectedDetailId(null);
        }
     });
  };

  // Fix: Added handleDetailUpload function
  const handleDetailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await compressImage(file);
      const newDetail: DetailView = { id: generateId(), imageUrl: base64, title: file.name };
      onUpdate({ ...artwork, detailViews: [...(artwork.detailViews || []), newDetail] });
    }
  };

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setShowAnalysisConfig(false);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const imagePart = {
        inlineData: {
          mimeType: "image/jpeg",
          data: artwork.imageUrl.split(",")[1],
        },
      };
      
      const prompt = `Analysiere dieses Kunstwerk detailliert. Nutze deine Expertise in Kunstgeschichte.
        ${analysisHint ? `SPEZIFISCHE HINWEISE/WÜNSCHE DES NUTZERS: ${analysisHint}` : ''}
        LEG BESONDEREN FOKUS AUF: ${focusAreas.join(", ")}.

        Gib die Antwort im JSON-Format zurück mit folgendem Schema:
        {
          "title": "Vermuteter Titel",
          "artist": "Vermuteter Künstler",
          "year": "Entstehungsjahr",
          "description": "Präzise kunstgeschichtliche Beschreibung",
          "styleTags": ["Epoche", "Stilrichtung"],
          "elementClusters": { "Inhalt/Motivik": ["Motiv1", "Motiv2"], "Technik/Detail": ["Beobachtung1"] },
          "colors": ["#hex1", "#hex2"],
          "medium": "Technik",
          "dimensions": "Maße",
          "formalAnalysis": {
            "composition": "Detaillierte Analyse des Bildaufbaus",
            "lightAndShadow": "Lichtführung und Modellierung",
            "perspective": "Raumkonstruktion",
            "technique": "Farbauftrag und Duktus",
            "visualRhythm": "Visuelle Dynamik",
            "iconography": "Ikonographische Deutung"
          },
          "contextAnalysis": "Historischer und biografischer Kontext"
        }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: { parts: [imagePart, { text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              artist: { type: Type.STRING },
              year: { type: Type.STRING },
              description: { type: Type.STRING },
              styleTags: { type: Type.ARRAY, items: { type: Type.STRING } },
              elementClusters: { type: Type.OBJECT },
              colors: { type: Type.ARRAY, items: { type: Type.STRING } },
              medium: { type: Type.STRING },
              dimensions: { type: Type.STRING },
              formalAnalysis: {
                type: Type.OBJECT,
                properties: {
                  composition: { type: Type.STRING },
                  lightAndShadow: { type: Type.STRING },
                  perspective: { type: Type.STRING },
                  technique: { type: Type.STRING },
                  visualRhythm: { type: Type.STRING },
                  iconography: { type: Type.STRING }
                }
              },
              contextAnalysis: { type: Type.STRING }
            }
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      onUpdate({
        ...artwork,
        ...result,
        analyzed: true,
        elementTags: flattenClusters(result.elementClusters)
      });
      setAnalysisHint("");
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("Fehler bei der KI-Analyse.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveDetail = (img: string) => {
     const newDetail: DetailView = { id: generateId(), imageUrl: img, title: "Detail" };
     onUpdate({ ...artwork, detailViews: [...(artwork.detailViews || []), newDetail] });
  };

  const handleCreateFromCrop = (img: string) => {
      const newArt: Artwork = {
          ...artwork,
          id: generateId(),
          imageUrl: img,
          title: artwork.title + " (Ausschnitt)",
          analyzed: false,
          detailViews: []
      };
      onCreateArtwork(newArt);
  };

  const currentImg = selectedDetailId ? artwork.detailViews?.find((d:any)=>d.id===selectedDetailId)?.imageUrl || artwork.imageUrl : artwork.imageUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex overflow-hidden">
        {/* Left: Image area */}
        <div className="w-1/2 bg-gray-100 relative">
          <ImageWorkspace 
            src={currentImg} 
            onClose={onClose} 
            onSave={handleCreateFromCrop}
            onSaveDetail={handleSaveDetail}
            onDelete={() => selectedDetailId ? onUpdate({...artwork, detailViews: artwork.detailViews.filter((d:any)=>d.id!==selectedDetailId)}) : onDeleteArtwork(artwork.id)}
          />
        </div>

        {/* Right: Content area */}
        <div className="w-1/2 flex flex-col bg-white border-l border-gray-100 relative">
          
          {/* Analysis Setup Overlay */}
          {showAnalysisConfig && (
            <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md p-8 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4">
               <div className="w-full max-w-md space-y-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Sparkles size={32}/>
                    </div>
                    <h3 className="text-xl font-bold">Forschungs-Setup</h3>
                    <p className="text-sm text-gray-500 mt-1">Konkretisieren Sie die Analyse-Ziele für die KI.</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Fokus-Bereiche</label>
                        <div className="flex flex-wrap gap-2">
                           {[
                             {id: 'artist', label: 'Künstler-Identifikation'},
                             {id: 'style', label: 'Epochen-Einordnung'},
                             {id: 'composition', label: 'Komposition'},
                             {id: 'iconography', label: 'Ikonographie'},
                             {id: 'technique', label: 'Technik-Analyse'}
                           ].map(area => (
                             <button 
                                key={area.id}
                                onClick={() => toggleFocus(area.id)}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${focusAreas.includes(area.id) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 hover:border-gray-400'}`}
                             >
                               {area.label}
                             </button>
                           ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Zusätzlicher Kontext / Fragen</label>
                        <textarea 
                           className="w-full border rounded-xl p-3 text-sm min-h-[100px] focus:ring-1 focus:ring-purple-600 outline-none transition-all"
                           placeholder="z.B. Wissen Sie etwas über den Hintergrund? Oder haben Sie eine spezifische Frage zum Bild?"
                           value={analysisHint}
                           onChange={e => setAnalysisHint(e.target.value)}
                        />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                     <button onClick={() => setShowAnalysisConfig(false)} className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors">Abbrechen</button>
                     <button onClick={handleAnalyze} className="flex-1 py-3 bg-purple-600 text-white text-sm font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2">
                        <Sparkles size={16}/> Analyse starten
                     </button>
                  </div>
               </div>
            </div>
          )}

          <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
            <div className="flex-1 min-w-0 mr-4">
              <input 
                value={artwork.title} 
                onChange={e => onUpdate({...artwork, title: e.target.value})}
                className="text-2xl font-bold font-serif w-full border-none outline-none focus:ring-0 bg-transparent p-0"
                placeholder="Titel des Werks"
              />
              <input 
                value={artwork.artist} 
                onChange={e => onUpdate({...artwork, artist: e.target.value})}
                className="text-gray-500 w-full border-none outline-none focus:ring-0 bg-transparent p-0 text-sm"
                placeholder="Künstler / Schule"
              />
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowAnalysisConfig(true)} 
                disabled={isAnalyzing}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all shadow-sm ${isAnalyzing ? 'bg-gray-100 text-gray-400' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
              >
                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isAnalyzing ? "Analysiere..." : "KI-Analyse"}
              </button>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"><X size={24} /></button>
            </div>
          </div>

          <div className="flex border-b border-gray-50 bg-gray-50/50 px-6 shrink-0 scrollbar-hide overflow-x-auto">
             {[
               { id: 'info', label: 'Basisdaten', icon: <FileText size={14}/> },
               { id: 'description', label: 'Beschreibung', icon: <List size={14}/> },
               { id: 'analysis', label: 'Formale Analyse', icon: <Bot size={14}/> },
               { id: 'catalog', label: 'Katalogtext', icon: <BookOpen size={14}/> },
               { id: 'details', label: 'Details', icon: <LayoutGrid size={14}/> }
             ].map(tab => (
               <button 
                 key={tab.id}
                 onClick={() => {setActiveTab(tab.id as any); setSelectedDetailId(null);}}
                 className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 -mb-px whitespace-nowrap ${activeTab === tab.id ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
               >
                 {tab.icon} {tab.label}
               </button>
             ))}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white">
            {activeTab === 'info' && (
              <div className="space-y-8">
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <div className="group border-b border-transparent focus-within:border-gray-200 transition-all">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Jahr / Datierung</label>
                    <input className="w-full py-1 outline-none text-sm" value={artwork.year} onChange={e => onUpdate({...artwork, year: e.target.value})} placeholder="z.B. ca. 1912" />
                  </div>
                  <div className="group border-b border-transparent focus-within:border-gray-200 transition-all">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Technik</label>
                    <input className="w-full py-1 outline-none text-sm" value={artwork.medium} onChange={e => onUpdate({...artwork, medium: e.target.value})} placeholder="z.B. Öl auf Holz" />
                  </div>
                  <div className="group border-b border-transparent focus-within:border-gray-200 transition-all">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Maße</label>
                    <input className="w-full py-1 outline-none text-sm" value={artwork.dimensions} onChange={e => onUpdate({...artwork, dimensions: e.target.value})} placeholder="z.B. 45 x 60 cm" />
                  </div>
                  <div className="group border-b border-transparent focus-within:border-gray-200 transition-all">
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Inventar-Nr.</label>
                    <input className="w-full py-1 outline-none text-sm" value={artwork.inventoryNumber} onChange={e => onUpdate({...artwork, inventoryNumber: e.target.value})} placeholder="Inv. 1234/A" />
                  </div>
                </div>
                
                <TagInput label="Stil / Epoche / Schule" tags={artwork.styleTags || []} onUpdate={(t: string[]) => onUpdate({...artwork, styleTags: t})} placeholder="+ Tag hinzufügen" />
                <ClusteredTagInput clusters={artwork.elementClusters || {}} onUpdate={(c: any) => onUpdate({...artwork, elementClusters: c, elementTags: flattenClusters(c)})} />
                
                <div>
                   <label className="text-[10px] font-bold text-gray-400 uppercase block mb-4">Dominante Farben</label>
                   <div className="flex gap-3">
                      {artwork.colors?.map((c: string, i: number) => (
                         <div key={i} className="w-10 h-10 rounded-full border shadow-sm group relative" style={{ backgroundColor: c }}>
                             <button onClick={() => onUpdate({...artwork, colors: artwork.colors?.filter((_:any,idx:number) => idx !== i)})} className="absolute -top-1 -right-1 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity p-1"><X size={10}/></button>
                         </div>
                      ))}
                      <button onClick={() => { const c = prompt("Hex Farbe (z.B. #ff0000)?"); if(c) onUpdate({...artwork, colors: [...(artwork.colors || []), c]}) }} className="w-10 h-10 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:text-black hover:border-black transition-colors"><Plus size={16}/></button>
                   </div>
                </div>
              </div>
            )}

            {activeTab === 'description' && (
              <div className="space-y-8">
                <div className="relative">
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Beschreibung des Werks</label>
                  <textarea 
                    className="w-full h-80 border border-gray-100 bg-gray-50/30 rounded-xl p-4 text-sm leading-relaxed focus:ring-1 focus:ring-black outline-none transition-all"
                    placeholder="Beschreiben Sie das Werk..."
                    value={artwork.description}
                    onChange={e => onUpdate({...artwork, description: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Provenienz & Besitzgeschichte</label>
                  <textarea className="w-full h-32 border border-gray-100 bg-gray-50/30 rounded-xl p-4 text-sm leading-relaxed outline-none" value={artwork.provenance} onChange={e => onUpdate({...artwork, provenance: e.target.value})} placeholder="Verlauf der Besitzverhältnisse..." />
                </div>
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="space-y-10 pb-12">
                {[
                  {id: 'composition', label: 'Bildkomposition', icon: <LayoutList size={14}/>},
                  {id: 'lightAndShadow', label: 'Licht & Schatten', icon: <Lightbulb size={14}/>},
                  {id: 'perspective', label: 'Perspektive & Raum', icon: <Maximize size={14}/>},
                  {id: 'technique', label: 'Technik & Farbauftrag', icon: <PenTool size={14}/>},
                  {id: 'visualRhythm', label: 'Visueller Rhythmus', icon: <ArrowUpDown size={14}/>},
                  {id: 'iconography', label: 'Ikonographie', icon: <Search size={14}/>}
                ].map(field => (
                  <div key={field.id} className="relative group">
                    <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-2 mb-3">
                       {field.icon} {field.label}
                    </label>
                    <textarea 
                      className="w-full h-32 border border-gray-100 bg-purple-50/5 rounded-xl p-4 text-sm leading-relaxed focus:ring-1 focus:ring-purple-600 outline-none transition-all"
                      value={(artwork.formalAnalysis as any)?.[field.id] || ""}
                      onChange={e => onUpdate({
                        ...artwork, 
                        formalAnalysis: { ...(artwork.formalAnalysis || {}), [field.id]: e.target.value }
                      })}
                      placeholder={`${field.label} beschreiben...`}
                    />
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'catalog' && (
              <div className="h-full">
                <label className="text-[10px] font-bold text-gray-400 uppercase block mb-2">Wissenschaftlicher Katalogeintrag</label>
                <textarea 
                  className="w-full h-[500px] border border-gray-100 bg-stone-50/20 rounded-xl p-8 text-lg font-serif leading-loose focus:ring-1 focus:ring-stone-600 outline-none transition-all shadow-inner"
                  placeholder="Katalogtext verfassen..."
                  value={artwork.catalogText}
                  onChange={e => onUpdate({...artwork, catalogText: e.target.value})}
                />
              </div>
            )}

            {activeTab === 'details' && (
              <div className="space-y-6 pb-12">
                <input type="file" ref={detailInputRef} className="hidden" accept="image/*" onChange={handleDetailUpload} />
                <div className="grid grid-cols-2 gap-4">
                  {(artwork.detailViews || []).map((detail: DetailView) => (
                    <div key={detail.id} onClick={() => setSelectedDetailId(detail.id)} className={`group relative aspect-square bg-gray-100 rounded-lg overflow-hidden border cursor-pointer transition-all ${selectedDetailId === detail.id ? 'ring-2 ring-black border-transparent' : 'hover:border-gray-400'}`}>
                      <img src={detail.imageUrl} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                         <button onClick={(e) => { e.stopPropagation(); handleDeleteDetail(detail.id); }} className="p-2 bg-white rounded-full text-red-500 hover:scale-110 transition-transform"><Trash2 size={16}/></button>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[10px] px-2 py-1 truncate">{detail.title}</div>
                    </div>
                  ))}
                  <button onClick={() => detailInputRef.current?.click()} className="aspect-square border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:border-black hover:text-black hover:bg-gray-50 transition-all">
                     <Plus size={24} />
                     <span className="text-xs font-bold mt-2">Upload</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {confirmConfig && <ConfirmModal title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.action} onClose={() => setConfirmConfig(null)} />}
    </div>
  );
};

// Fix: Added missing WikiConnectionsPanel component
const WikiConnectionsPanel = ({ currentEntry, allEntries, artworks, onUpdateContent }: any) => {
  const [suggestions, setSuggestions] = useState<WikiSuggestion[]>([]);

  useEffect(() => {
    const findSuggestions = () => {
      const s: WikiSuggestion[] = [];
      const content = currentEntry.content.toLowerCase();
      
      artworks.forEach((art: any) => {
        if (content.includes(art.title.toLowerCase()) && !currentEntry.content.includes(`[[${art.title}]]`)) {
          s.push({ targetTitle: art.title, reason: "Im Text gefunden", type: "artwork-match" });
        }
      });

      allEntries.forEach((entry: any) => {
        if (entry.id !== currentEntry.id && content.includes(entry.title.toLowerCase()) && !currentEntry.content.includes(`[[${entry.title}]]`)) {
          s.push({ targetTitle: entry.title, reason: "Im Text gefunden", type: "text-match" });
        }
      });

      setSuggestions(s.slice(0, 5));
    };
    findSuggestions();
  }, [currentEntry, allEntries, artworks]);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-12 pt-8 border-t border-gray-100">
      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
        <Network size={14}/> Verknüpfungsvorschläge
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {suggestions.map((s, i) => (
          <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div>
              <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                {s.type === 'artwork-match' ? <ImageIcon size={12}/> : <File size={12}/>}
                {s.targetTitle}
              </div>
              <div className="text-[10px] text-slate-500">{s.reason}</div>
            </div>
            <button 
              onClick={() => {
                const regex = new RegExp(s.targetTitle, 'gi');
                const newContent = currentEntry.content.replace(regex, `[[${s.targetTitle}]]`);
                onUpdateContent(newContent);
              }}
              className="text-blue-600 hover:bg-blue-100 p-1.5 rounded-md transition-colors"
              title="Link hinzufügen"
            >
              <Plus size={16}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const ContextWiki = ({ project, onUpdate, onSelectArtwork }: any) => {
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [newFolderName, setNewFolderName] = useState("");
  const [creationTargetId, setCreationTargetId] = useState<string | 'root' | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{title: string, message: string, action: () => void} | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const entries = project.wikiEntries || [];
  const folders = project.wikiFolders || [];
  
  const selectedEntry = entries.find((e: any) => e.id === selectedEntryId) || entries[0];

  useEffect(() => { 
      if (Object.keys(expandedFolders).length === 0 && folders.length > 0) {
         const initial: Record<string, boolean> = {};
         folders.forEach((f:any) => initial[f.id] = true);
         setExpandedFolders(initial);
      }
  }, [folders.length]);

  useEffect(() => { if(selectedEntry && !isEditing) { setEditTitle(selectedEntry.title); setEditContent(selectedEntry.content); } }, [selectedEntry, isEditing]);
  
  const handleSave = () => { onUpdate({ ...project, wikiEntries: entries.map((e: any) => e.id === selectedEntry.id ? { ...e, title: editTitle, content: editContent, updatedAt: Date.now() } : e) }); setIsEditing(false); };
  
  const handleCreateEntry = (folderId?: string) => { 
      const newEntry = { id: generateId(), folderId, title: "Neuer Artikel", content: "Inhalt...", createdAt: Date.now(), updatedAt: Date.now(), source: 'user' }; 
      onUpdate({ ...project, wikiEntries: [...entries, newEntry] }); 
      setSelectedEntryId(newEntry.id); 
      setIsEditing(true); 
  };
  
  const handleCreateFolder = () => {
     if(!newFolderName.trim()) return;
     const parentId = creationTargetId === 'root' ? undefined : creationTargetId;
     const newFolder = { id: generateId(), name: newFolderName, parentId };
     onUpdate({ ...project, wikiFolders: [...folders, newFolder] });
     setNewFolderName("");
     setCreationTargetId(null);
     setExpandedFolders(prev => ({...prev, [newFolder.id]: true}));
  };

  const handleGenerateWiki = async () => {
     if(!aiTopic.trim()) return;
     setIsGenerating(true);
     try {
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        const prompt = `Erstelle einen Wiki-Artikel für ein Kunstprojekt über: ${aiTopic}. Nutze Markdown. Schreibe auf Deutsch. Gehe tief in kunstgeschichtliche Details ein.`;
        const r = await ai.models.generateContent({model:'gemini-3-flash-preview', contents: prompt});
        const newEntry = { id: generateId(), title: aiTopic, content: r.text||"", createdAt: Date.now(), updatedAt: Date.now(), source: 'ai' };
        onUpdate({ ...project, wikiEntries: [...entries, newEntry] });
        setSelectedEntryId(newEntry.id);
        setShowAiModal(false);
        setAiTopic("");
     } catch(e) { alert("Fehler bei Generierung"); }
     setIsGenerating(false);
  };

  const handleDeleteEntry = (id: string, e: React.MouseEvent) => {
     e.stopPropagation();
     setConfirmConfig({
        title: "Artikel löschen?",
        message: "Der Artikel wird endgültig entfernt.",
        action: () => {
            onUpdate({ ...project, wikiEntries: entries.filter((x:any) => x.id !== id) });
            if(selectedEntryId === id) setSelectedEntryId(null);
        }
     });
  };

  const handleDeleteFolder = (fid: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setConfirmConfig({
        title: "Ordner löschen?",
        message: "Der Ordner wird gelöscht. Inhalte werden eine Ebene nach oben verschoben.",
        action: () => {
            const folderToDelete = folders.find((f:any) => f.id === fid);
            const newParent = folderToDelete?.parentId;
            onUpdate({ 
                ...project, 
                wikiEntries: entries.map((e:any) => e.folderId === fid ? {...e, folderId: newParent} : e),
                wikiFolders: folders.filter((f:any) => f.id !== fid).map((f:any) => f.parentId === fid ? {...f, parentId: newParent} : f)
            });
        }
      });
  };

  const insertLink = (title: string) => {
    const tag = `[[${title}]]`;
    if (textareaRef.current) {
        const start = textareaRef.current.selectionStart;
        const end = textareaRef.current.selectionEnd;
        const text = editContent;
        const newText = text.substring(0, start) + tag + text.substring(end);
        setEditContent(newText);
        setTimeout(() => {
             if(textareaRef.current) {
                 textareaRef.current.focus();
                 textareaRef.current.setSelectionRange(start + tag.length, start + tag.length);
             }
        }, 0);
    } else {
        setEditContent(prev => prev + tag);
    }
  };

  const renderTree = (parentId: string | undefined) => {
     const subset = folders.filter((f:any) => f.parentId === parentId);
     return subset.map((folder:any) => {
         const isOpen = expandedFolders[folder.id];
         const subFolders = folders.filter((f:any) => f.parentId === folder.id);
         const folderEntries = entries.filter((e:any) => e.folderId === folder.id);
         const isEmpty = subFolders.length === 0 && folderEntries.length === 0;

         return (
             <div key={folder.id} className="mb-1">
                <div onClick={()=>setExpandedFolders(prev=>({...prev, [folder.id]: !prev[folder.id]}))} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-100 cursor-pointer group text-sm text-gray-700 font-medium">
                   <div className="flex items-center gap-2 truncate">{isOpen?<ChevronDown size={14} className="text-gray-400"/>:<ChevronRight size={14}/>}{isOpen?<FolderOpen size={14} className="text-blue-500"/>:<Folder size={14} className="text-blue-500"/>}<span>{folder.name}</span></div>
                   <div className="flex items-center opacity-0 group-hover:opacity-100 bg-gray-100 rounded px-1">
                       <button onClick={e=>{e.stopPropagation();setCreationTargetId(folder.id);setNewFolderName("");setExpandedFolders(p=>({...p,[folder.id]:true}))}} className="p-1 hover:text-green-600" title="Unterordner erstellen"><FolderPlus size={12}/></button>
                       <button onClick={e=>{e.stopPropagation();handleCreateEntry(folder.id);}} className="p-1 hover:text-blue-600" title="Artikel erstellen"><Plus size={12}/></button>
                       <button onClick={e=>handleDeleteFolder(folder.id, e)} className="p-1 hover:text-red-500" title="Löschen"><Trash2 size={12}/></button>
                   </div>
                </div>
                {isOpen && <div className="ml-3 pl-2 border-l border-gray-200 mt-1 space-y-0.5">
                    {creationTargetId === folder.id && (
                        <div className="p-1 mb-1 bg-white rounded border shadow-sm flex items-center gap-1">
                           <input autoFocus className="w-full text-xs outline-none" placeholder="Name..." value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleCreateFolder()} />
                           <button onClick={()=>handleCreateFolder()} className="hover:bg-green-50 rounded p-0.5"><Check size={12} className="text-green-500"/></button>
                           <button onClick={()=>setCreationTargetId(null)} className="hover:bg-gray-50 rounded p-0.5"><X size={12} className="text-gray-400"/></button>
                        </div>
                    )}
                    {renderTree(folder.id)}
                    {folderEntries.map((e:any) => (
                        <div key={e.id} onClick={() => {setSelectedEntryId(e.id); setIsEditing(false);}} className={`px-2 py-1.5 rounded text-sm cursor-pointer flex justify-between group ${selectedEntry?.id === e.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
                            <span className="truncate">{e.title}</span>
                            <button onClick={ev=>handleDeleteEntry(e.id, ev)} className="opacity-0 group-hover:opacity-100 hover:text-red-500"><X size={12}/></button>
                        </div>
                    ))}
                </div>}
             </div>
         )
     });
  };

  return (
     <div className="flex h-[calc(100vh-140px)] bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm relative">
        <div className="w-72 bg-gray-50 border-r border-gray-100 flex flex-col">
           <div className="p-4 border-b bg-white flex justify-between items-center">
               <h3 className="font-bold text-gray-700 flex gap-2"><BookOpen size={16}/> Wiki</h3>
               <div className="flex gap-1">
                   <button onClick={() => {setCreationTargetId('root'); setNewFolderName("");}} className="p-1.5 hover:bg-slate-100 rounded text-gray-500" title="Neuer Hauptordner"><FolderPlus size={16}/></button>
                   <button onClick={() => handleCreateEntry()} className="p-1.5 hover:bg-black hover:text-white bg-gray-100 rounded transition-colors" title="Neuer Artikel"><Plus size={16}/></button>
               </div>
           </div>
           
           <div className="flex-1 overflow-y-auto p-2">
              {creationTargetId === 'root' && (
                  <div className="p-2 mb-2 bg-white rounded border shadow-sm flex items-center gap-1">
                     <input autoFocus className="w-full text-sm outline-none" placeholder="Ordnername..." value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleCreateFolder()} />
                     <button onClick={handleCreateFolder} className="p-1 hover:bg-green-50 rounded text-green-500"><Check size={16}/></button>
                  </div>
              )}
              {renderTree(undefined)}
              <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="px-2 pb-1 text-[10px] font-bold text-gray-400 uppercase">Unsortiert</div>
                  {entries.filter((e:any) => !e.folderId).map((e:any) => (
                     <div key={e.id} onClick={() => {setSelectedEntryId(e.id); setIsEditing(false);}} className={`px-2 py-1.5 rounded text-sm cursor-pointer flex justify-between group ${selectedEntry?.id === e.id ? 'bg-white shadow-sm ring-1 ring-gray-200 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
                        <span className="truncate">{e.title}</span>
                        <div className="flex gap-1">{e.source==='ai'&&<Sparkles size={10} className="text-purple-400"/>}<button onClick={ev=>handleDeleteEntry(e.id, ev)} className="opacity-0 group-hover:opacity-100 hover:text-red-500"><X size={12}/></button></div>
                     </div>
                  ))}
              </div>
           </div>
           <div className="p-3 border-t bg-white"><button onClick={()=>setShowAiModal(true)} className="w-full bg-slate-900 text-white py-2 rounded-lg text-xs font-medium flex justify-center gap-2 transition-transform active:scale-95"><Sparkles size={12}/> KI-Recherche</button></div>
        </div>
        
        <div className="flex-1 flex flex-col bg-white min-w-0">
           {selectedEntry ? (
              <>
                 <div className="h-16 border-b flex items-center justify-between px-8 shrink-0 bg-white">
                    {isEditing ? <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-2xl font-bold w-full outline-none" /> : <h2 className="text-2xl font-bold font-serif truncate">{selectedEntry.title}</h2>}
                    <div className="flex items-center gap-2">
                        <button onClick={() => isEditing ? handleSave() : setIsEditing(true)} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${isEditing ? 'bg-black text-white' : 'border hover:bg-gray-50'}`}>{isEditing ? <><Save size={14}/> Speichern</> : <><Edit3 size={14}/> Bearbeiten</>}</button>
                    </div>
                 </div>
                 <div className="flex-1 overflow-y-auto p-8 bg-white">
                    {isEditing ? (
                        <div className="flex flex-col h-full gap-4">
                            <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                <span className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><LinkIcon size={12}/> Werk verlinken:</span>
                                <select onChange={(e) => { if(e.target.value) insertLink(e.target.value); e.target.value = ""; }} className="text-sm bg-white border border-gray-300 rounded px-2 py-1 outline-none">
                                    <option value="">Auswählen...</option>
                                    {project.artworks.sort((a:any,b:any)=>a.title.localeCompare(b.title)).map((a:any) => (
                                        <option key={a.id} value={a.title}>{a.title}</option>
                                    ))}
                                </select>
                            </div>
                            <textarea ref={textareaRef} value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full flex-1 resize-none outline-none font-mono text-sm leading-relaxed p-2" placeholder="Inhalt..." />
                        </div>
                    ) : 
                    <>
                        <WikiContentRenderer content={selectedEntry.content} onNavigate={(t: string) => { const a = project.artworks.find((x:any)=>x.title.toLowerCase()===t.toLowerCase()); if(a) onSelectArtwork(a); else { const e = entries.find((x:any)=>x.title.toLowerCase()===t.toLowerCase()); if(e) setSelectedEntryId(e.id); } }} artworks={project.artworks} wikiEntries={entries} />
                        <WikiConnectionsPanel currentEntry={selectedEntry} allEntries={entries} artworks={project.artworks} onUpdateContent={(c:string) => {onUpdate({...project, wikiEntries: entries.map((e:any)=>e.id===selectedEntry.id?{...e, content:c}:e)})}} />
                    </>}
                 </div>
              </>
           ) : <div className="flex-1 flex flex-col items-center justify-center text-gray-400"><BookOpen size={48} className="mb-4 opacity-10"/><p>Wähle einen Artikel oder erstelle einen neuen.</p></div>}
        </div>
        
        {showAiModal && (
            <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white p-6 rounded-xl w-full max-w-md shadow-xl">
                    <h3 className="font-bold mb-4 flex gap-2"><Sparkles size={18} className="text-purple-500"/> KI-Recherche</h3>
                    <input autoFocus value={aiTopic} onChange={e=>setAiTopic(e.target.value)} className="w-full border p-2 rounded mb-4 outline-none" placeholder="Thema..." onKeyDown={e=>e.key==='Enter'&&handleGenerateWiki()}/>
                    <div className="flex justify-end gap-2">
                        <button onClick={()=>setShowAiModal(false)} className="px-3 py-2 text-sm text-gray-500">Abbrechen</button>
                        <button onClick={handleGenerateWiki} disabled={isGenerating} className="bg-black text-white px-4 py-2 rounded text-sm flex gap-2 items-center">
                            {isGenerating ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                            Generieren
                        </button>
                    </div>
                </div>
            </div>
        )}
        {confirmConfig && <ConfirmModal title={confirmConfig.title} message={confirmConfig.message} onConfirm={confirmConfig.action} onClose={() => setConfirmConfig(null)} />}
     </div>
  );
};

// Fix: Added missing App component
const App = () => {
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem("art_archive_projects");
    return saved ? JSON.parse(saved) : [];
  });
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [view, setView] = useState<'gallery' | 'wiki'>('gallery');
  const [selectedArtworkId, setSelectedArtworkId] = useState<string | null>(null);
  const [isBackupOpen, setIsBackupOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("art_archive_projects", JSON.stringify(projects));
  }, [projects]);

  const currentProject = projects.find(p => p.id === currentProjectId);

  const updateProject = (updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleCreateProject = () => {
    const name = prompt("Projektname?");
    if (name) {
      const newP: Project = {
        id: generateId(),
        name,
        description: "",
        createdAt: Date.now(),
        artworks: [],
        historicalContext: "",
        wikiEntries: [{ id: generateId(), title: "Index", content: "Willkommen im Wiki.", createdAt: Date.now(), updatedAt: Date.now(), source: 'user' }],
        wikiFolders: []
      };
      setProjects([...projects, newP]);
      setCurrentProjectId(newP.id);
    }
  };

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentProject || !e.target.files) return;
    const files = Array.from(e.target.files);
    const newArtworks: Artwork[] = await Promise.all(files.map(async file => {
      const base64 = await compressImage(file);
      return {
        id: generateId(),
        imageUrl: base64,
        title: file.name.split('.')[0],
        artist: "Unbekannt",
        year: "",
        description: "",
        styleTags: [],
        elementTags: [],
        elementClusters: {},
        analyzed: false,
        inventoryNumber: "",
        medium: "",
        dimensions: "",
        location: "",
        provenance: "",
        catalogText: ""
      };
    }));
    updateProject({ ...currentProject, artworks: [...currentProject.artworks, ...newArtworks] });
  };

  if (!currentProjectId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl">
              <Archive size={32} />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-slate-900 tracking-tight">ArtArchive AI</h1>
              <p className="text-slate-500 font-medium">Digitales Kuratieren & Kunstgeschichtliche Analyse</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map(p => (
              <button 
                key={p.id} 
                onClick={() => setCurrentProjectId(p.id)}
                className="p-6 bg-white border border-slate-200 rounded-2xl text-left hover:border-slate-900 hover:shadow-lg transition-all group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-slate-50 rounded-xl group-hover:bg-slate-900 group-hover:text-white transition-colors">
                    <Database size={24} />
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-slate-900" />
                </div>
                <h3 className="font-bold text-lg text-slate-900">{p.name}</h3>
                <p className="text-slate-500 text-sm mt-1">{p.artworks.length} Kunstwerke</p>
              </button>
            ))}
            <button 
              onClick={handleCreateProject}
              className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-left hover:border-slate-400 hover:bg-white transition-all flex flex-col items-center justify-center text-slate-400 gap-3 min-h-[180px]"
            >
              <Plus size={32} />
              <span className="font-bold">Neues Projekt erstellen</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedArtwork = currentProject?.artworks.find(a => a.id === selectedArtworkId);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <button onClick={() => setCurrentProjectId(null)} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-medium transition-colors">
            <ChevronLeft size={20} /> <Archive size={18}/> ArtArchive
          </button>
          <div className="h-4 w-px bg-slate-200"></div>
          <h2 className="font-bold text-slate-900">{currentProject?.name}</h2>
          <nav className="flex items-center gap-1 ml-4">
             <button onClick={() => setView('gallery')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${view === 'gallery' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><LayoutGrid size={16}/> Galerie</button>
             <button onClick={() => setView('wiki')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${view === 'wiki' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}><BookOpen size={16}/> Wiki</button>
          </nav>
        </div>
        
        <div className="flex items-center gap-3">
          {view === 'gallery' && (
            <label className="cursor-pointer bg-slate-100 text-slate-900 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition-all flex items-center gap-2">
              <Upload size={16} /> Upload
              <input type="file" multiple className="hidden" onChange={handleUploadImages} accept="image/*" />
            </label>
          )}
          <button onClick={() => setIsBackupOpen(true)} className="p-2 text-slate-400 hover:text-slate-900 transition-colors"><Settings size={20}/></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {view === 'gallery' ? (
          <div className="p-8">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {currentProject?.artworks.map(art => (
                <div key={art.id} onClick={() => setSelectedArtworkId(art.id)} className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer">
                  <div className="aspect-[3/4] overflow-hidden bg-slate-100 relative">
                    <img src={art.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    {art.analyzed && <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm p-1.5 rounded-full text-purple-600 shadow-sm"><Sparkles size={14}/></div>}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900 truncate">{art.title}</h3>
                    <p className="text-slate-500 text-xs mt-1 truncate">{art.artist}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-8">
            <ContextWiki project={currentProject} onUpdate={updateProject} onSelectArtwork={(a:any)=>{setSelectedArtworkId(a.id); setView('gallery');}} />
          </div>
        )}
      </main>

      {selectedArtwork && (
        <ArtworkDetailModal 
          artwork={selectedArtwork} 
          artworks={currentProject?.artworks}
          onClose={() => setSelectedArtworkId(null)} 
          onUpdate={(updated: Artwork) => updateProject({ ...currentProject!, artworks: currentProject!.artworks.map(a => a.id === updated.id ? updated : a) })}
          onCreateArtwork={(newArt: Artwork) => updateProject({ ...currentProject!, artworks: [...currentProject!.artworks, newArt] })}
          onDeleteArtwork={(id: string) => { updateProject({ ...currentProject!, artworks: currentProject!.artworks.filter(a => a.id !== id) }); setSelectedArtworkId(null); }}
        />
      )}

      {isBackupOpen && <BackupModal onClose={() => setIsBackupOpen(false)} />}
    </div>
  );
};

// --- Execution ---

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
}

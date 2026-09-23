/**
 * Datenmodell – kompatibel zum Original („art_archive_projects“ im localStorage),
 * damit alte Daten 1:1 importiert werden können. Neue Felder sind optional.
 */

export interface DetailView {
  id: string;
  imageUrl: string;
  title: string;
  description?: string;
}

export interface FormalAnalysis {
  composition?: string;
  lightAndShadow?: string;
  perspective?: string;
  technique?: string;
  visualRhythm?: string;
  iconography?: string;
  miscellaneous?: string;
}

export interface Artwork {
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
  // neu im Nachbau
  createdAt?: number;
  updatedAt?: number;
  analyzedAt?: number;
  analysisModel?: string;
}

export interface WikiDiscussionPost {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface WikiEntry {
  discussion?: WikiDiscussionPost[];
  discussionDraft?: string;
  id: string;
  folderId?: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  source: 'user' | 'ai';
}

export interface WikiFolder {
  id: string;
  name: string;
  parentId?: string;
}

export interface WorkNote {
  id: string;
  title: string;
  content: string;
  kind: 'draft' | 'note' | 'task';
  done: boolean;
  due: string;
  artworkIds: string[];
  comparison?: { projectId: string; artworkId: string; title: string }[];
  source: 'user' | 'ai';
  model?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Project {
  kind?: 'notebook';
  workNotes?: WorkNote[];
  id: string;
  name: string;
  description: string;
  createdAt: number;
  artworks: Artwork[];
  historicalContext: string;
  wikiEntries?: WikiEntry[];
  wikiFolders?: WikiFolder[];
  notes?: string;
  // neu im Nachbau
  updatedAt?: number;
}

export type FocusArea = 'artist' | 'style' | 'composition' | 'iconography' | 'technique';

export interface AnalysisResult {
  title: string;
  artist: string;
  year: string;
  description: string;
  styleTags: string[];
  elementClusters: Record<string, string[]>;
  colors: string[];
  medium: string;
  dimensions: string;
  formalAnalysis: Required<Omit<FormalAnalysis, 'miscellaneous'>>;
  contextAnalysis: string;
}

export interface SessionInfo {
  authenticated: boolean;
  version: string;
  aiAvailable?: boolean;
  mock?: boolean;
  model?: string;
  usage?: { day: string; count: number; limit: number };
  /** Client-seitig: Server nicht erreichbar (z. B. offline). */
  offline?: boolean;
}

export interface WikiSuggestion {
  targetTitle: string;
  reason: string;
  type: 'text-match' | 'artwork-match';
}

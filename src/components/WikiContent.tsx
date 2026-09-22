import { useMemo } from 'react';
import Markdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Image as ImageIcon, Link as LinkIcon, Plus } from 'lucide-react';
import type { Artwork, WikiEntry } from '../types';
import { WIKI_SCHEME, decodeWikiHref, preprocessWikiLinks } from '../lib/wiki';

/**
 * Sichere Darstellung von Wiki-Artikeln: Markdown ohne Roh-HTML (kein XSS),
 * [[Verlinkungen]] zu Werken (indigo), Artikeln (blau) oder noch fehlenden Artikeln (rot, gestrichelt).
 */
export function WikiContent({
  content,
  artworks,
  entries,
  onNavigate,
}: {
  content: string;
  artworks: Artwork[];
  entries: WikiEntry[];
  onNavigate: (title: string) => void;
}) {
  const processed = useMemo(() => preprocessWikiLinks(content), [content]);
  const artworkTitles = useMemo(() => new Set(artworks.map((artwork) => artwork.title.trim().toLowerCase())), [artworks]);
  const entryTitles = useMemo(() => new Set(entries.map((entry) => entry.title.trim().toLowerCase())), [entries]);

  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const target = href ? decodeWikiHref(href) : null;
        if (target !== null) {
          const key = target.trim().toLowerCase();
          const isArtwork = artworkTitles.has(key);
          const isEntry = entryTitles.has(key);
          const tone = isArtwork
            ? 'border border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
            : isEntry
              ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'bg-red-50 text-red-400 decoration-dashed hover:bg-red-100';
          return (
            <button
              type="button"
              onClick={() => onNavigate(target)}
              title={isArtwork ? 'Werk öffnen' : isEntry ? 'Artikel öffnen' : 'Artikel existiert noch nicht – anlegen'}
              className={`${tone} mx-0.5 inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 align-baseline text-sm font-medium no-underline transition-colors hover:underline`}
            >
              {isArtwork ? <ImageIcon size={10} /> : isEntry ? <LinkIcon size={10} /> : <Plus size={10} />}
              {children}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {children}
          </a>
        );
      },
    }),
    [artworkTitles, entryTitles, onNavigate],
  );

  return (
    <div className="prose prose-slate mx-auto max-w-3xl leading-relaxed text-gray-800 prose-headings:font-serif prose-a:text-blue-600">
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith(WIKI_SCHEME) ? url : defaultUrlTransform(url))}
        components={components}
      >
        {processed}
      </Markdown>
    </div>
  );
}

import type { Artwork, WikiEntry, WikiSuggestion } from '../types';
import { escapeRegExp } from './util';

/**
 * Wiki-Verlinkung im Obsidian-Stil: [[Titel]] oder [[Titel|Anzeigetext]].
 * Das Original setzte Wiki-Text per dangerouslySetInnerHTML ein (XSS-Lücke) und zeigte Markdown roh an.
 * Hier: Links werden in Markdown-Links mit eigenem Schema umgewandelt und sicher gerendert.
 */

export const WIKI_SCHEME = 'wiki:';
const LINK_RE = /\[\[([^[\]\n]+?)\]\]/g;

function escapeLinkText(value: string): string {
  return value.replace(/([\\[\]*_`])/g, '\\$1');
}

/** Wandelt [[…]] außerhalb von Code-Blöcken in Markdown-Links um. */
export function preprocessWikiLinks(markdown: string): string {
  const segments = markdown.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) return segment; // Code unverändert lassen
      return segment.replace(LINK_RE, (_match, inner: string) => {
        const [target, alias] = inner.split('|');
        const title = target.trim();
        const label = (alias ?? target).trim();
        if (!title) return _match;
        return `[${escapeLinkText(label)}](${WIKI_SCHEME}${encodeURIComponent(title)})`;
      });
    })
    .join('');
}

export function decodeWikiHref(href: string): string | null {
  if (!href.startsWith(WIKI_SCHEME)) return null;
  try {
    return decodeURIComponent(href.slice(WIKI_SCHEME.length));
  } catch {
    return null;
  }
}

/** Titel, die bereits als [[…]] verlinkt sind (klein geschrieben). */
export function linkedTitles(content: string): Set<string> {
  const titles = new Set<string>();
  for (const match of content.matchAll(LINK_RE)) titles.add(match[1].split('|')[0].trim().toLowerCase());
  return titles;
}

function wordPattern(title: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(title)})(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

/** Teile des Textes, die nicht in [[…]] stehen – nur dort wird gesucht und verlinkt. */
function splitByLinks(content: string): { text: string; isLink: boolean }[] {
  const parts: { text: string; isLink: boolean }[] = [];
  let last = 0;
  for (const match of content.matchAll(LINK_RE)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: content.slice(last, index), isLink: false });
    parts.push({ text: match[0], isLink: true });
    last = index + match[0].length;
  }
  if (last < content.length) parts.push({ text: content.slice(last), isLink: false });
  return parts;
}

export function findLinkSuggestions(entry: WikiEntry, entries: WikiEntry[], artworks: Artwork[]): WikiSuggestion[] {
  const already = linkedTitles(entry.content);
  const plain = splitByLinks(entry.content)
    .filter((part) => !part.isLink)
    .map((part) => part.text)
    .join(' ');
  const suggestions: WikiSuggestion[] = [];
  const seen = new Set<string>();
  const consider = (title: string, type: WikiSuggestion['type']) => {
    const key = title.trim().toLowerCase();
    if (key.length < 3 || seen.has(key) || already.has(key) || key === entry.title.trim().toLowerCase()) return;
    if (wordPattern(title.trim()).test(plain)) {
      seen.add(key);
      suggestions.push({ targetTitle: title.trim(), reason: 'Im Text gefunden', type });
    }
  };
  for (const artwork of artworks) consider(artwork.title, 'artwork-match');
  for (const other of entries) if (other.id !== entry.id) consider(other.title, 'text-match');
  return suggestions.slice(0, 5);
}

/** Verlinkt das erste noch unverlinkte Vorkommen von `title`. */
export function linkFirstOccurrence(content: string, title: string): string {
  const pattern = wordPattern(title);
  let done = false;
  return splitByLinks(content)
    .map((part) => {
      if (done || part.isLink) return part.text;
      const replaced = part.text.replace(pattern, (_match, prefix: string) => `${prefix}[[${title}]]`);
      if (replaced !== part.text) done = true;
      return replaced;
    })
    .join('');
}

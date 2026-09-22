import type { Artwork, Project } from '../types';
import { flattenClusters, safeFilename, todayIso } from './util';

/** Export eines Werks als Obsidian-Notiz (Markdown mit YAML-Frontmatter). */

const yamlString = (value: string) => JSON.stringify(value ?? '');
const yamlList = (values: string[]) => `[${values.map(yamlString).join(', ')}]`;

const FORMAL_SECTIONS: { key: keyof NonNullable<Artwork['formalAnalysis']>; label: string }[] = [
  { key: 'composition', label: 'Bildkomposition' },
  { key: 'lightAndShadow', label: 'Licht und Schatten' },
  { key: 'perspective', label: 'Perspektive und Raum' },
  { key: 'technique', label: 'Technik und Farbauftrag' },
  { key: 'visualRhythm', label: 'Visueller Rhythmus' },
  { key: 'iconography', label: 'Ikonographie' },
  { key: 'miscellaneous', label: 'Weitere Beobachtungen' },
];

export function artworkToMarkdown(artwork: Artwork, project?: Project): string {
  const lines: string[] = [
    '---',
    `titel: ${yamlString(artwork.title)}`,
    `kuenstler: ${yamlString(artwork.artist)}`,
    `datierung: ${yamlString(artwork.year)}`,
    `technik: ${yamlString(artwork.medium)}`,
    `masse: ${yamlString(artwork.dimensions)}`,
    `inventarnummer: ${yamlString(artwork.inventoryNumber)}`,
    `standort: ${yamlString(artwork.location)}`,
    `stil: ${yamlList(artwork.styleTags ?? [])}`,
    `elemente: ${yamlList(flattenClusters(artwork.elementClusters))}`,
    `farben: ${yamlList(artwork.colors ?? [])}`,
    ...(project ? [`projekt: ${yamlString(project.name)}`] : []),
    `ki_analysiert: ${artwork.analyzed ? 'true' : 'false'}`,
    ...(artwork.analysisModel ? [`ki_modell: ${yamlString(artwork.analysisModel)}`] : []),
    `exportiert: ${todayIso()}`,
    'tags: [kunstwerk]',
    '---',
    '',
    `# ${artwork.title || 'Ohne Titel'}`,
    '',
  ];

  const section = (title: string, body?: string) => {
    if (body && body.trim()) lines.push(`## ${title}`, '', body.trim(), '');
  };

  section('Beschreibung', artwork.description);
  section('Historischer und biografischer Kontext', artwork.contextAnalysis);

  const formal = artwork.formalAnalysis ?? {};
  const formalParts = FORMAL_SECTIONS.filter(({ key }) => formal[key]?.trim());
  if (formalParts.length > 0) {
    lines.push('## Formale Analyse', '');
    for (const { key, label } of formalParts) lines.push(`### ${label}`, '', formal[key]!.trim(), '');
  }

  const clusters = Object.entries(artwork.elementClusters ?? {}).filter(([, items]) => items.length > 0);
  if (clusters.length > 0) {
    lines.push('## Elemente und Details', '');
    for (const [category, items] of clusters) lines.push(`- **${category}:** ${items.join(', ')}`);
    lines.push('');
  }

  section('Provenienz und Besitzgeschichte', artwork.provenance);
  section('Katalogtext', artwork.catalogText);
  section('Notizen', artwork.notes);

  return `${lines.join('\n').trim()}\n`;
}

export function artworkMarkdownFilename(artwork: Artwork): string {
  return `${safeFilename(artwork.title, 'Kunstwerk')}.md`;
}

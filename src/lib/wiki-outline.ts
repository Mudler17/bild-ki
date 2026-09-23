/** One Markdown AST supplies both heading IDs and the table of contents.
 * Fenced code, Setext headings, inline emphasis and duplicate headings therefore
 * behave exactly like the rendered article, without a separate regex parser. */
type Node = { type: string; value?: string; alt?: string; depth?: number; url?: string; children?: Node[]; data?: { hName?: string; hProperties?: Record<string, unknown> } };
const plainText = (node: Node): string => node.value ?? node.alt ?? (node.children ?? []).map(plainText).join('');
export function buildWikiOutline(tree: Node, prefix: string): void {
  const headings: { id: string; title: string; depth: number }[] = [];
  const visit = (node: Node) => {
    if (node.type === 'heading') {
      const id = `${prefix}-section-${headings.length + 1}`;
      headings.push({ id, title: plainText(node) || 'Abschnitt', depth: node.depth ?? 1 });
      node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id, tabIndex: -1, className: 'scroll-mt-4' } };
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  if (!headings.length) return;
  const minimum = Math.min(...headings.map(h => h.depth));
  const indents = ['ml-0', 'ml-3', 'ml-6', 'ml-9', 'ml-12', 'ml-12'];
  const toc: Node = {
    type: 'blockquote', data: { hName: 'nav', hProperties: { 'aria-label': 'Inhaltsverzeichnis', className: 'not-prose mb-8 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm' } },
    children: [
      { type: 'paragraph', children: [{ type: 'strong', children: [{ type: 'text', value: 'Inhaltsverzeichnis' }] }] },
      { type: 'list', data: { hProperties: { className: 'mt-3 space-y-2 list-none' } }, children: headings.map(h => ({
        type: 'listItem', data: { hProperties: { className: indents[Math.min(5, h.depth - minimum)] } }, children: [{ type: 'paragraph', children: [{ type: 'link', url: `#${h.id}`, children: [{ type: 'text', value: h.title }] }] }],
      })) },
    ],
  };
  tree.children = [toc, ...(tree.children ?? [])];
}

export function remarkWikiOutline(options: { prefix: string }) {
  return (tree: unknown) => buildWikiOutline(tree as Node, options.prefix);
}

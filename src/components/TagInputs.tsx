import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export function TagInput({
  tags,
  onUpdate,
  label,
  placeholder,
}: {
  tags: string[];
  onUpdate: (tags: string[]) => void;
  label: string;
  placeholder: string;
}) {
  const [input, setInput] = useState('');
  const add = () => {
    const value = input.trim();
    if (!value) return;
    if (!tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) onUpdate([...tags, value]);
    setInput('');
  };
  return (
    <div className="mb-4">
      <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</label>
      <div className="mb-2 flex flex-wrap gap-2">
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-800">
            {tag}
            <button onClick={() => onUpdate(tags.filter((_, i) => i !== index))} aria-label={`${tag} entfernen`}>
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add();
          }
        }}
        onBlur={add}
        enterKeyHint="done"
        className="w-full border-b bg-transparent py-1 text-sm outline-none transition-colors focus:border-blue-500"
        placeholder={placeholder}
      />
    </div>
  );
}

export function ClusteredTagInput({
  clusters,
  onUpdate,
}: {
  clusters: Record<string, string[]>;
  onUpdate: (clusters: Record<string, string[]>) => void;
}) {
  const [newCategory, setNewCategory] = useState('');

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name || clusters[name]) return;
    onUpdate({ ...clusters, [name]: [] });
    setNewCategory('');
  };

  const addItem = (category: string, value: string) => {
    const item = value.trim();
    if (!item) return;
    const items = clusters[category] ?? [];
    if (items.some((existing) => existing.toLowerCase() === item.toLowerCase())) return;
    onUpdate({ ...clusters, [category]: [...items, item] });
  };

  const removeItem = (category: string, item: string) => {
    const next = { ...clusters, [category]: (clusters[category] ?? []).filter((existing) => existing !== item) };
    if (next[category].length === 0) delete next[category];
    onUpdate(next);
  };

  return (
    <div className="mb-8 space-y-4">
      <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Elemente &amp; Details</label>
      {Object.entries(clusters).map(([category, items]) => (
        <div key={category} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
          <div className="mb-2 text-xs font-bold text-gray-700">{category}</div>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <span key={item} className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-[11px]">
                {item}
                <button onClick={() => removeItem(category, item)} aria-label={`${item} entfernen`}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <input
            className="mt-2 w-full border-b border-transparent bg-transparent text-[11px] outline-none transition-colors focus:border-gray-300"
            placeholder="+ Element hinzufügen"
            enterKeyHint="done"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.currentTarget.value.trim()) {
                event.preventDefault();
                addItem(category, event.currentTarget.value);
                event.currentTarget.value = '';
              }
            }}
          />
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={newCategory}
          onChange={(event) => setNewCategory(event.target.value)}
          className="flex-1 rounded border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-black"
          placeholder="Neue Kategorie erstellen..."
          enterKeyHint="done"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCategory();
            }
          }}
        />
        <button onClick={addCategory} className="rounded-lg bg-gray-900 p-1 text-white transition-colors hover:bg-black" aria-label="Kategorie hinzufügen">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

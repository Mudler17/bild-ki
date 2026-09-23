import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateProject } from '../dist-server/projects.js';
const dir = await mkdtemp(join(tmpdir(), 'wiki-test-'));
let moveWikiItem, canMoveFolder, folderPath, buildWikiOutline, normalizeProjects;
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--skipLibCheck', '--outDir', dir, 'src/lib/wiki-structure.ts', 'src/lib/wiki-outline.ts', 'src/lib/normalize.ts']);
  await writeFile(join(dir, 'package.json'), '{"type":"module"}');
  const file = join(dir, 'lib/normalize.js'); await writeFile(file, (await readFile(file,'utf8')).replace("'./util'", "'./util.js'"));
  ({ moveWikiItem, canMoveFolder, folderPath } = await import(pathToFileURL(join(dir,'lib/wiki-structure.js'))));
  ({ buildWikiOutline } = await import(pathToFileURL(join(dir,'lib/wiki-outline.js'))));
  ({ normalizeProjects } = await import(pathToFileURL(file)));
} finally { await rm(dir, { recursive:true, force:true }); }
const project = () => ({ id:'p',name:'Wiki',description:'',historicalContext:'',createdAt:1,artworks:[],
 wikiFolders:[{id:'a',name:'A'},{id:'b',name:'B',parentId:'a'},{id:'c',name:'C',parentId:'b'},{id:'d',name:'D'}],
 wikiEntries:[{id:'e',title:'Artikel',content:'## Licht',folderId:'c',createdAt:42,updatedAt:43,source:'user',discussionDraft:'Frage',discussion:[{id:'post',content:'Einwand',createdAt:44,updatedAt:45}]}] });
test('Moving a folder retains its descendants, article, creation date and discussion',()=>{
 const p=project(); const moved=moveWikiItem(p,{kind:'folder',id:'b'},'d');
 assert.equal(folderPath(moved.wikiFolders,'c'),'D / B / C');
 assert.deepEqual(moved.wikiEntries,p.wikiEntries);
 assert.equal(p.wikiFolders[1].parentId,'a');
 const root=moveWikiItem(moved,{kind:'folder',id:'b'}); assert.equal(root.wikiFolders[1].parentId,undefined);
 const unsorted=moveWikiItem(root,{kind:'article',id:'e'});assert.equal(unsorted.wikiEntries[0].folderId,undefined);
 assert.equal(unsorted.wikiEntries[0].createdAt,42);
});
test('Self/descendant moves, stale targets and cyclic destinations are rejected',()=>{
 const p=project();
 for(const destination of ['a','b','c']) assert.throws(()=>moveWikiItem(p,{kind:'folder',id:'a'},destination));
 assert.throws(()=>moveWikiItem(p,{kind:'article',id:'e'},'gone'));
 assert.throws(()=>moveWikiItem(p,{kind:'article',id:'gone'},'a'));
 assert.equal(canMoveFolder([{id:'x',name:'X',parentId:'y'},{id:'y',name:'Y',parentId:'x'}],'z','x'),false);
 assert.equal(folderPath([{id:'x',name:'X',parentId:'x'}],'x'),'X');
});
test('Backup roundtrip preserves discussion and draft; malformed discussion rejected',()=>{
 const p=project(); const restored=normalizeProjects(JSON.parse(JSON.stringify({projects:[p]}))).projects[0];
 assert.deepEqual(restored.wikiEntries,p.wikiEntries);
 assert.doesNotThrow(()=>validateProject(restored,'p'));
 assert.throws(()=>validateProject({...p,wikiEntries:[{...p.wikiEntries[0],discussion:[{id:'bad',content:5}]}]},'p'));
 assert.throws(()=>validateProject({...p,wikiEntries:[{...p.wikiEntries[0],discussionDraft:42}]},'p'));
});
test('Outline links use exact unique heading IDs and plain inline labels',()=>{
 const tree={type:'root',children:[{type:'heading',depth:2,children:[{type:'text',value:'Licht '},{type:'emphasis',children:[{type:'text',value:'und Farbe'}]}]},{type:'code',value:'# Kein Abschnitt'},{type:'heading',depth:3,children:[{type:'text',value:'Licht und Farbe'}]}]};
 buildWikiOutline(tree,'article'); const [toc,first,,second]=tree.children;
 assert.equal(toc.data.hName,'nav');assert.equal(first.data.hProperties.id,'article-section-1');assert.equal(second.data.hProperties.id,'article-section-2');
 const links=toc.children[1].children.map(n=>n.children[0].children[0]);
 assert.deepEqual(links.map(n=>n.url),['#article-section-1','#article-section-2']);
 assert.equal(links[0].children[0].value,'Licht und Farbe');
 const empty={type:'root',children:[{type:'paragraph',children:[{type:'text',value:'Ohne Überschrift'}]}]};buildWikiOutline(empty,'empty');assert.equal(empty.children.length,1);
});

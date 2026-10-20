const SOURCES = [
  { file: 'data/fedora-core.json', id: 'Fedora', icon: 'F' },
  { file: 'data/kde-plasma.json', id: 'KDE Plasma', icon: 'K' },
  { file: 'data/gnome.json', id: 'GNOME', icon: 'G' },
];
let libraries = [], selected = 'All libraries', query = '', category = '';
const $ = (s) => document.querySelector(s);
async function load() {
  libraries = await Promise.all(SOURCES.map(async (source) => {
    const data = await fetch(source.file).then(r => { if (!r.ok) throw new Error(`Could not load ${source.file}`); return r.json(); });
    if (!Array.isArray(data.commands) || data.commands.some(c => !Array.isArray(c.searchTerms))) throw new Error(`${source.file} is missing required searchTerms on one or more commands.`);
    return { ...data, icon: source.icon };
  }));
  renderLibraries(); fillCategories(); render();
}
function renderLibraries() {
  const all = libraries.reduce((n,l) => n + l.commands.length, 0);
  $('#library-count').textContent = String(libraries.length).padStart(2,'0');
  const items = [{id:'All libraries',name:'All libraries',icon:'✳',commands:libraries.flatMap(l=>l.commands)},...libraries];
  $('#library-list').innerHTML = items.map(l => `<button class="library-button ${selected===l.id?'active':''}" data-library="${esc(l.id)}"><span class="lib-icon">${esc(l.icon)}</span>${esc(l.name)}<span class="lib-count">${String(l.commands.length).padStart(2,'0')}</span></button>`).join('');
  document.querySelectorAll('.library-button').forEach(b => b.onclick=()=>{selected=b.dataset.library;renderLibraries();render()});
  $('#result-count').textContent = `${all} commands`;
}
function fillCategories(){const cats=[...new Set(libraries.flatMap(l=>l.commands.map(c=>c.category)))].sort();$('#category-filter').innerHTML='<option value="">All topics</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');}
function editDistanceAtMostOne(a,b){
  if(a===b)return true;
  if(Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,differences=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++differences>1)return false;
    if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}
  }
  return differences+(i<a.length||j<b.length?1:0)<=1;
}
function searchable(c){
  const text=[c.name,c.category,c.summary,c.usage,...c.flags,...c.examples,c.platform,...c.searchTerms].join(' ').toLocaleLowerCase();
  const q=query.trim().toLocaleLowerCase();
  if(!q)return true;
  if(text.includes(q))return true;
  const wanted=q.match(/[\p{L}\p{N}]+/gu)||[];
  if(!wanted.length)return false;
  const words=new Set(text.match(/[\p{L}\p{N}]+/gu)||[]);
  return wanted.every(token=>words.has(token)||(token.length>=5&&[...words].some(word=>Math.abs(word.length-token.length)<=1&&editDistanceAtMostOne(token,word))));
}
function render(){let libs=selected==='All libraries'?libraries:libraries.filter(l=>l.id===selected);let commands=libs.flatMap(l=>l.commands).filter(c=>(!category||c.category===category)&&(!query||searchable(c))).sort((a,b)=>a.name.localeCompare(b.name));const selectedName=selected==='All libraries'?'All libraries':(libraries.find(l=>l.id===selected)?.name||selected);$('#active-eyebrow').textContent=selectedName.toUpperCase();$('#results-title').textContent=selected==='All libraries'?'Command index':selectedName;$('#result-count').textContent=`${commands.length} command${commands.length===1?'':'s'}`;$('#empty').hidden=commands.length!==0;$('#cards').innerHTML=commands.map((c,i)=>card(c,i)).join('');document.querySelectorAll('.card-main').forEach(el=>el.onclick=()=>{const d=el.nextElementSibling;const open=!d.hidden;d.hidden=open;el.querySelector('.expand').textContent=open?'+':'−'});document.querySelectorAll('.copy').forEach(b=>b.onclick=async e=>{e.stopPropagation();try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent='COPIED';setTimeout(()=>b.textContent='COPY',1100)}catch{b.textContent='SELECT TO COPY'}})}
function card(c,i){return `<article class="command-card"><div class="card-main" role="button" tabindex="0"><div class="command-name">${esc(c.name)}</div><div class="command-info"><div class="command-desc">${esc(c.summary)}</div><div class="badges"><span class="badge">${esc(c.category)}</span><span class="badge platform">${esc(c.platform)}</span></div></div><span class="expand">+</span></div><div class="card-detail" hidden><div class="detail-content"><div class="detail-label">USAGE</div><div class="usage">${esc(c.usage)}</div><div class="detail-label">COMMON OPTIONS <span style="letter-spacing:0">· ${c.flags.length} listed</span></div><div class="flag-list">${c.flags.map(f=>{const description=c.optionDescriptions?.[f]||`See ${c.name} --help for the description of ${f}.`;return `<span class="flag" tabindex="0" data-tooltip="${esc(description)}" aria-label="${esc(f)}: ${esc(description)}">${esc(f)}</span>`}).join('')}</div><div class="detail-label">EXAMPLE</div>${c.examples.map(x=>`<div class="example"><code>${esc(x)}</code><button class="copy" data-copy="${esc(x)}">COPY</button></div>`).join('')}</div></div></article>`}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('#search').addEventListener('input',e=>{query=e.target.value;render()});$('#category-filter').addEventListener('change',e=>{category=e.target.value;render()});document.querySelectorAll('.hint').forEach(b=>b.onclick=()=>{$('#search').value=b.dataset.query;query=b.dataset.query;render();$('#search').focus()});document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus()}if(e.key==='Escape'){$('#search').value='';query='';render();$('#search').blur()}});
load().catch(e=>{$('#cards').innerHTML=`<div class="scope-note"><p><b>Could not load the offline catalog.</b> ${esc(e.message)} Open this project through a local web server, or use a browser that permits local JSON fetches. See README.md.</p></div>`});

const themeToggle = $('#theme-toggle');
const themeLabel = $('#theme-label');
const themeIcon = document.querySelector('.theme-icon');
function setTheme(theme) {
  const terminal = theme === 'terminal';
  document.body.dataset.theme = terminal ? 'terminal' : 'light';
  themeToggle.setAttribute('aria-pressed', String(terminal));
  themeToggle.setAttribute('aria-label', terminal ? 'Switch to light mode' : 'Switch to old-school terminal dark mode');
  themeLabel.textContent = terminal ? 'LIGHT MODE' : 'DARK MODE';
  themeIcon.textContent = terminal ? '☀' : '☾';
  document.querySelector('meta[name="theme-color"]').content = terminal ? '#080d0a' : '#f3f4ee';
}
let savedTheme = 'light';
try { savedTheme = localStorage.getItem('fedora-command-atlas-theme') || 'light'; } catch {}
setTheme(savedTheme);
themeToggle.addEventListener('click', () => {
  const next = document.body.dataset.theme === 'terminal' ? 'light' : 'terminal';
  setTheme(next);
  try { localStorage.setItem('fedora-command-atlas-theme', next); } catch {}
});

const historyEl = document.querySelector('#history');
const input = document.querySelector('#command-input');
const body = document.querySelector('#terminal-body');
let catalog = new Map();
let commandHistory = [];
let historyIndex = 0;
let sessionRecords = [];
let currentDirectory = '/home/fedora';
let previousDirectory = null;
let simulatorMode = 'guide';
let virtualFs = createVirtualFilesystem();

const builtins = new Map([
  ['pwd', { summary: 'Print the current simulated working directory.', usage: 'pwd [OPTION]...', flags: [], optionDescriptions: {}, examples: ['pwd'] }],
  ['cd', { summary: 'Change the simulated working directory for this practice session.', usage: 'cd [DIRECTORY]', flags: [], optionDescriptions: {}, examples: ['cd Documents'] }],
  ['whoami', { summary: 'Print the effective user name.', usage: 'whoami', flags: [], optionDescriptions: {}, examples: ['whoami'] }],
  ['echo', { summary: 'Print text or variable values to standard output.', usage: 'echo [OPTION]... [STRING]...', flags: [], optionDescriptions: {}, examples: ['echo Hello, Fedora'] }],
  ['date', { summary: 'Display or set the system date and time.', usage: 'date [OPTION]... [+FORMAT]', flags: [], optionDescriptions: {}, examples: ['date'] }],
]);
for (const [name, command] of builtins) command.name = name;

const canned = {
  ls: 'Desktop  Documents  Downloads  Music  Pictures  Public  Templates  Videos',
  pwd: '/home/fedora',
  whoami: 'fedora',
  date: 'Tue Oct 20 12:00:00 EDT 2026  [illustrative]',
  uname: 'Linux fedora-lab 6.x.x #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux  [illustrative]',
  free: '               total        used        free      shared  buff/cache   available\nMem:           15Gi       5.1Gi       6.8Gi       612Mi       3.7Gi       9.9Gi\nSwap:         8.0Gi          0B       8.0Gi',
  df: 'Filesystem          Size  Used Avail Use% Mounted on\n/dev/mapper/fedora  120G   48G   72G  40% /\n/dev/nvme0n1p2       1.0G  310M  714M  31% /boot  [illustrative]',
  ip: 'lo               UNKNOWN        127.0.0.1/8 ::1/128\nenp1s0           UP             192.0.2.42/24  [documentation address]',
  ss: 'State   Recv-Q Send-Q Local Address:Port   Peer Address:Port\nLISTEN  0      4096   127.0.0.1:631       0.0.0.0:*  [illustrative]',
  ps: '  PID TTY          TIME CMD\n 1042 ?        00:00:02 systemd\n 2081 pts/0    00:00:00 bash  [illustrative]',
  lsblk: 'NAME        SIZE TYPE MOUNTPOINTS\nnvme0n1   476.9G disk\n├─nvme0n1p1   1G part /boot\n└─nvme0n1p2 476G part /  [illustrative]',
};


function makeDirectory() { return { type: 'directory', children: Object.create(null), content: '' }; }
function makeFile(content='') { return { type: 'file', content }; }
function createVirtualFilesystem() {
  const root = makeDirectory();
  const addDirectory = path => {
    let node = root;
    for (const part of path.split('/').filter(Boolean)) {
      if (!node.children[part]) node.children[part] = makeDirectory();
      node = node.children[part];
    }
    return node;
  };
  const addFile = (path, content) => {
    const parts = path.split('/').filter(Boolean), name = parts.pop();
    addDirectory('/' + parts.join('/')).children[name] = makeFile(content);
  };
  for (const dir of ['/home/fedora/Desktop','/home/fedora/Documents','/home/fedora/Downloads','/home/fedora/Music','/home/fedora/Pictures','/home/fedora/Public','/home/fedora/Templates','/home/fedora/Projects','/tmp','/var/tmp','/etc']) addDirectory(dir);
  addFile('/home/fedora/.bashrc', '# ~/.bashrc — simulated practice file\n');
  addFile('/home/fedora/Documents/readme.txt', 'Welcome to the Fedora Command Atlas practice filesystem.\n');
  addFile('/home/fedora/Documents/notes.txt', 'Try mkdir, touch, echo > file, cat, cp, mv, and rm.\n');
  addFile('/home/fedora/Projects/hello.txt', 'Hello from the virtual filesystem!\n');
  addFile('/etc/hostname', 'fedora-lab\n');
  return root;
}
function normalizeVirtualPath(path, base=currentDirectory) {
  let value = path || base;
  if (value === '~') value = '/home/fedora';
  else if (value.startsWith('~/')) value = `/home/fedora/${value.slice(2)}`;
  else if (!value.startsWith('/')) value = `${base}/${value}`;
  const parts = [];
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return '/' + parts.join('/');
}
function getVirtualNode(path) {
  const normalized = normalizeVirtualPath(path);
  let node = virtualFs;
  for (const part of normalized.split('/').filter(Boolean)) {
    if (!node || node.type !== 'directory') return null;
    node = node.children[part];
  }
  return node || null;
}
function virtualParent(path, create=false) {
  const normalized = normalizeVirtualPath(path);
  if (normalized === '/') return null;
  const parts = normalized.split('/').filter(Boolean), name = parts.pop();
  let parent = virtualFs;
  for (const part of parts) {
    if (!parent.children[part] && create) parent.children[part] = makeDirectory();
    parent = parent.children[part];
    if (!parent || parent.type !== 'directory') return null;
  }
  return { parent, name, path: normalized };
}
function childPath(parent, name) { return parent === '/' ? `/${name}` : `${parent}/${name}`; }
function virtualError(response, message) { appendSection(response, 'VIRTUAL FILESYSTEM', message, 'warning'); }
function cloneVirtualNode(node) {
  if (node.type === 'file') return makeFile(node.content);
  const copy = makeDirectory();
  for (const [name, child] of Object.entries(node.children)) copy.children[name] = cloneVirtualNode(child);
  return copy;
}
function serializeVirtualNode(node) {
  if (node.type === 'file') return { type: 'file', content: node.content };
  const children = {};
  for (const [name, child] of Object.entries(node.children)) children[name] = serializeVirtualNode(child);
  return { type: 'directory', children };
}
function virtualFilesystemEntries(root) {
  const entries = new Map();
  const visit = (node, path) => {
    entries.set(path, node);
    if (node.type === 'directory') {
      for (const [name, child] of Object.entries(node.children)) visit(child, path === '/' ? `/${name}` : `${path}/${name}`);
    }
  };
  visit(root, '/');
  return entries;
}
function describeFilesystemChanges(before, after) {
  const prior = virtualFilesystemEntries(before), next = virtualFilesystemEntries(after), changes = [];
  for (const [path, node] of next) {
    const old = prior.get(path);
    if (!old) changes.push(`Created ${node.type}: ${path}${node.type === 'file' ? ` (${node.content.length} characters)` : ''}`);
    else if (node.type === 'file' && old.type === 'file' && node.content !== old.content) changes.push(`Updated file: ${path} (${old.content.length} → ${node.content.length} characters)`);
    else if (node.type !== old.type) changes.push(`Replaced ${old.type} with ${node.type}: ${path}`);
  }
  for (const [path, node] of prior) if (!next.has(path)) changes.push(`Removed ${node.type}: ${path}`);
  return changes.sort((a,b) => a.localeCompare(b));
}
function sanitizeVirtualNode(value, depth=0, count={nodes:0}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 64 || ++count.nodes > 20000) throw new Error('Invalid or oversized filesystem data.');
  if (value.type === 'file') {
    if (typeof value.content !== 'string' || value.content.length > 2000000) throw new Error('Invalid or oversized file content.');
    return makeFile(value.content);
  }
  if (value.type !== 'directory' || !value.children || typeof value.children !== 'object' || Array.isArray(value.children)) throw new Error('Invalid filesystem node.');
  const directory = makeDirectory();
  for (const [name, child] of Object.entries(value.children)) {
    if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.length > 255) throw new Error('Invalid filename in saved state.');
    directory.children[name] = sanitizeVirtualNode(child, depth + 1, count);
  }
  return directory;
}
function removeVirtualPath(path, recursive=false, force=false) {
  const normalized = normalizeVirtualPath(path), location = virtualParent(normalized);
  if (!location) return 'Refusing to remove the virtual filesystem root.';
  const node = location.parent.children[location.name];
  if (!node) return force ? '' : `rm: cannot remove '${path}': No such file or directory`;
  if (node.type === 'directory' && !recursive) return `rm: cannot remove '${path}': Is a directory (use -r to remove directories)`;
  delete location.parent.children[location.name];
  if (currentDirectory === normalized || currentDirectory.startsWith(normalized + '/')) currentDirectory = normalizeVirtualPath('..', normalized);
  return '';
}
function virtualList(path, all=false, long=false) {
  const node = getVirtualNode(path);
  if (!node) return { error: `ls: cannot access '${path}': No such file or directory` };
  if (node.type === 'file') return { text: long ? `-rw-r--r-- 1 fedora fedora ${node.content.length} ${path.split('/').pop()}` : path.split('/').pop() };
  let names = Object.keys(node.children).sort((a,b) => a.localeCompare(b));
  if (all) names = ['.', '..', ...names];
  if (!names.length) return { text: '(empty directory)' };
  if (!long) return { text: names.join('  ') };
  return { text: names.map(name => {
    if (name === '.' || name === '..') return `drwxr-xr-x 1 fedora fedora 0 ${name}`;
    const child = node.children[name], directory = child.type === 'directory';
    return `${directory ? 'drwxr-xr-x' : '-rw-r--r--'} 1 fedora fedora ${directory ? 0 : child.content.length} ${name}${directory ? '/' : ''}`;
  }).join('\n') };
}
function virtualTree(path, depth=0) {
  const node = getVirtualNode(path);
  if (!node) return `tree: '${path}': No such file or directory`;
  const lines = [path === '.' ? '.' : path];
  const walk = (dir, prefix, level) => {
    if (level >= 5) return;
    const names = Object.keys(dir.children).sort((a,b) => a.localeCompare(b));
    names.forEach((name,index) => {
      const last = index === names.length - 1, child = dir.children[name];
      lines.push(`${prefix}${last ? '└── ' : '├── '}${name}${child.type === 'directory' ? '/' : ''}`);
      if (child.type === 'directory') walk(child, prefix + (last ? '    ' : '│   '), level + 1);
    });
  };
  if (node.type === 'directory') walk(node, '', depth);
  return lines.join('\n');
}
function runInteractiveFilesystem(line, tokens) {
  const name = tokens[0];
  const args = tokens.slice(1);
  const supported = new Set(['pwd','cd','ls','dir','mkdir','touch','cat','rm','rmdir','cp','mv','echo','tree','find','stat']);
  if (!supported.has(name)) return false;
  const commandPath = currentDirectory;
  addEntry(line, response => {
    if (name === 'pwd') { appendSection(response, 'SIMULATED OUTPUT', currentDirectory); return; }
    if (name === 'cd') {
      if (args.length > 1) { virtualError(response, 'cd: use cd with zero or one directory argument.'); return; }
      const old = currentDirectory, destination = args[0] || '~', target = destination === '-' ? (previousDirectory || '/home/fedora') : normalizeVirtualPath(destination);
      const node = getVirtualNode(target);
      if (!node) { virtualError(response, `cd: ${destination}: No such directory in the virtual filesystem`); return; }
      if (node.type !== 'directory') { virtualError(response, `cd: ${destination}: Not a directory`); return; }
      currentDirectory = target; previousDirectory = old;
      updatePromptDirectory();
      return;
    }
    if (name === 'ls' || name === 'dir' || name === 'tree') {
      const all = args.some(x => x.includes('a') && x.startsWith('-')) || args.includes('--all');
      const long = args.some(x => x.includes('l') && x.startsWith('-')) || args.includes('--long');
      const target = args.find(x => !x.startsWith('-')) || '.';
      const result = name === 'tree' ? { text: virtualTree(target) } : virtualList(target, all, long);
      result.error ? virtualError(response, result.error) : appendSection(response, 'VIRTUAL OUTPUT', result.text);
      return;
    }
    if (name === 'mkdir') {
      const parents = args.includes('-p') || args.includes('--parents'), paths = args.filter(x => !x.startsWith('-'));
      if (!paths.length) { virtualError(response, 'mkdir: missing directory operand'); return; }
      const errors = [];
      for (const path of paths) {
        const normalized = normalizeVirtualPath(path), existing = getVirtualNode(normalized);
        if (existing) { if (!parents) errors.push(`mkdir: cannot create directory '${path}': File exists`); continue; }
        const location = virtualParent(normalized, parents);
        if (!location) { errors.push(`mkdir: cannot create directory '${path}': No such file or directory`); continue; }
        location.parent.children[location.name] = makeDirectory();
      }
      if (errors.length) virtualError(response, errors.join('\n'));
      return;
    }
    if (name === 'touch') {
      const paths = args.filter(x => !x.startsWith('-'));
      if (!paths.length) { virtualError(response, 'touch: missing file operand'); return; }
      const errors = [];
      for (const path of paths) {
        const normalized = normalizeVirtualPath(path), existing = getVirtualNode(normalized);
        if (existing) { if (existing.type === 'directory') errors.push(`touch: '${path}': Is a directory`); continue; }
        const location = virtualParent(normalized);
        if (!location) { errors.push(`touch: cannot touch '${path}': No such file or directory`); continue; }
        location.parent.children[location.name] = makeFile('');
      }
      if (errors.length) virtualError(response, errors.join('\n'));
      return;
    }
    if (name === 'cat') {
      if (!args.length) { virtualError(response, 'cat: provide a file path to read'); return; }
      const outputs = [], errors = [];
      for (const path of args) {
        const node = getVirtualNode(path);
        if (!node) errors.push(`cat: ${path}: No such file or directory`);
        else if (node.type === 'directory') errors.push(`cat: ${path}: Is a directory`);
        else outputs.push(node.content);
      }
      if (errors.length) virtualError(response, errors.join('\n'));
      else appendSection(response, 'FILE CONTENT', outputs.join(''));
      return;
    }
    if (name === 'echo') { appendSection(response, 'SIMULATED OUTPUT', args.join(' ')); return; }
    if (name === 'rm' || name === 'rmdir') {
      const recursive = name === 'rmdir' ? false : args.some(x => x === '-r' || x === '-R' || x === '--recursive' || /^-[^-]*r/.test(x));
      const force = args.some(x => x === '-f' || x === '--force' || /^-[^-]*f/.test(x));
      const paths = args.filter(x => !x.startsWith('-'));
      if (!paths.length) { virtualError(response, `${name}: missing operand`); return; }
      const errors = [];
      for (const path of paths) {
        const normalized = normalizeVirtualPath(path), node = getVirtualNode(normalized);
        if (name === 'rmdir' && node?.type === 'directory' && Object.keys(node.children).length) { errors.push(`rmdir: failed to remove '${path}': Directory not empty`); continue; }
        if (name === 'rmdir' && node?.type !== 'directory') { errors.push(`rmdir: failed to remove '${path}': Not a directory`); continue; }
        if (name === 'rm' && node?.type === 'directory' && !recursive) { errors.push(`rm: cannot remove '${path}': Is a directory (use -r)`); continue; }
        const error = removeVirtualPath(path, name === 'rmdir' ? true : recursive, force);
        if (error) errors.push(error);
      }
      if (errors.length) virtualError(response, errors.join('\n'));
      return;
    }
    if (name === 'cp' || name === 'mv') {
      const recursive = args.some(x => x === '-r' || x === '-R' || x === '--recursive' || /^-[^-]*r/.test(x));
      const paths = args.filter(x => !x.startsWith('-'));
      if (paths.length !== 2) { virtualError(response, `${name}: provide one source and one destination`); return; }
      const [source,destination] = paths, sourcePath = normalizeVirtualPath(source), sourceNode = getVirtualNode(sourcePath);
      if (!sourceNode) { virtualError(response, `${name}: cannot stat '${source}': No such file or directory`); return; }
      if (sourceNode.type === 'directory' && !recursive) { virtualError(response, `${name}: '${source}' is a directory (use -r)`); return; }
      const destinationPath = normalizeVirtualPath(destination), destinationNode = getVirtualNode(destinationPath);
      const finalPath = destinationNode?.type === 'directory' ? childPath(destinationPath, sourcePath.split('/').pop()) : destinationPath;
      if ((name === 'mv' || name === 'cp') && (finalPath === sourcePath || (sourceNode.type === 'directory' && finalPath.startsWith(sourcePath + '/')))) { virtualError(response, `${name}: cannot place a directory inside itself`); return; }
      const location = virtualParent(finalPath);
      if (!location) { virtualError(response, `${name}: cannot create '${destination}': No such directory`); return; }
      location.parent.children[location.name] = cloneVirtualNode(sourceNode);
      if (name === 'mv') removeVirtualPath(sourcePath, true);
      return;
    }
    if (name === 'find') {
      const start = args.find(x => !x.startsWith('-')) || '.';
      const rootNode = getVirtualNode(start);
      if (!rootNode) { virtualError(response, `find: '${start}': No such file or directory`); return; }
      const nameIndex = args.indexOf('-name'), pattern = nameIndex >= 0 ? args[nameIndex + 1] : '*';
      const output = [];
      const walk = (node, path) => {
        const base = path.split('/').pop() || '/';
        const matches = pattern === '*' || pattern === base || (pattern.startsWith('*') && base.endsWith(pattern.slice(1))) || (pattern.endsWith('*') && base.startsWith(pattern.slice(0,-1)));
        if (matches) output.push(path);
        if (node.type === 'directory') for (const [child,entry] of Object.entries(node.children)) walk(entry, childPath(path, child));
      };
      walk(rootNode, normalizeVirtualPath(start));
      appendSection(response, 'FIND RESULTS IN SANDBOX', output.join('\n') || '(no matches)');
      return;
    }
    if (name === 'stat') {
      const path = args.find(x => !x.startsWith('-')) || '.';
      const node = getVirtualNode(path);
      if (!node) { virtualError(response, `stat: cannot stat '${path}': No such file or directory`); return; }
      appendSection(response, 'VIRTUAL FILE DETAILS', `File: ${path}\nType: ${node.type}\nOwner: fedora\nPermissions: ${node.type === 'directory' ? 'drwxr-xr-x' : '-rw-r--r--'}\nSize: ${node.type === 'file' ? node.content.length : Object.keys(node.children).length}`);
    }
  }, commandPath);
  return true;
}
function handleEchoRedirect(line, match) {
  const commandPath = currentDirectory;
  const text = tokenize(match[1]).join(' ');
  const destination = tokenize(match[3])[0];
  addEntry(line, response => {
    const path = normalizeVirtualPath(destination), existing = getVirtualNode(path);
    if (existing?.type === 'directory') { virtualError(response, `bash: ${destination}: Is a directory`); return; }
    const location = virtualParent(path);
    if (!location) { virtualError(response, `bash: ${destination}: No such directory`); return; }
    const prior = existing?.content || '';
    location.parent.children[location.name] = makeFile(match[2] === '>>' ? prior + text + '\n' : text + '\n');
  }, commandPath);
}
function resetVirtualFilesystem() {
  virtualFs = createVirtualFilesystem();
  currentDirectory = '/home/fedora';
  previousDirectory = null;
}
function setSimulatorMode(mode) {
  simulatorMode = mode;
  const terminal = document.querySelector('.terminal');
  const toggle = document.querySelector('#mode-toggle');
  const interactive = mode === 'interactive';
  terminal.dataset.mode = mode;
  toggle.setAttribute('aria-checked', String(interactive));
  toggle.setAttribute('aria-label', interactive ? 'Switch to guide mode' : 'Switch to interactive filesystem mode');
  toggle.querySelector('span').textContent = interactive ? 'FILESYSTEM MODE' : 'GUIDE MODE';
  document.querySelector('#reset-button').hidden = !interactive;
  document.querySelector('.terminal-foot>span:first-child').lastChild.textContent = interactive ? ' SANDBOX READY' : ' READY';
  document.querySelector('.terminal-foot>span:last-child').innerHTML = interactive ? 'IN-MEMORY FILESYSTEM <b>·</b> RESET OR RELOAD TO DISCARD' : 'ENTER TO SUBMIT <b>·</b> ↑ PREVIOUS COMMAND';
  document.querySelector('.welcome>p').textContent = interactive ? 'Interactive mode is active. File changes stay in this temporary virtual filesystem.' : 'Guide mode is active. Switch to Interactive mode to work in an in-memory virtual filesystem.';
  updatePromptDirectory();
}

async function loadCatalog() {
  const manifest = await fetch('modules.json').then(r => {
    if (!r.ok) throw new Error('Could not read modules.json');
    return r.json();
  });
  const modules = await Promise.all(manifest.modules.map(async module => {
    const data = await fetch(module.file).then(r => {
      if (!r.ok) throw new Error(`Could not read ${module.file}`);
      return r.json();
    });
    return data.commands || [];
  }));
  for (const command of [...modules.flat(), ...builtins.entries()].flatMap(item => Array.isArray(item) ? [item[1]] : [item])) {
    if (command.name) catalog.set(command.name, command);
  }
}
function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function appendSection(parent, title, text, cls='') {
  const section = el('section', `response ${cls}`.trim());
  if (title) section.append(el('div', 'response-title', title));
  if (text !== undefined) section.append(el('p', '', text));
  parent.append(section);
  return section;
}
function displayDirectory(path) {
  if (path === '/home/fedora') return '~';
  if (path.startsWith('/home/fedora/')) return `~/${path.slice('/home/fedora/'.length)}`;
  return path;
}
function updatePromptDirectory() {
  const path = document.querySelector('.prompt-line .path');
  if (path) path.textContent = displayDirectory(currentDirectory);
}
function addPrompt(command, path=currentDirectory) {
  const line = el('div', 'entered-command');
  line.append(el('span', 'prompt-user', `fedora:${displayDirectory(path)}$`));
  line.append(el('code', '', command));
  historyEl.append(line);
  return line;
}
function addEntry(command, renderer, promptDirectory=currentDirectory) {
  const entry = el('article', 'history-entry');
  entry.dataset.mode = simulatorMode;
  entry.dataset.promptDirectory = promptDirectory;
  entry.append(addPrompt(command, promptDirectory));
  const response = el('div', 'response');
  const beforeFs = simulatorMode === 'interactive' ? cloneVirtualNode(virtualFs) : null;
  const beforeDirectory = currentDirectory;
  renderer(response);
  const outputCopy = response.cloneNode(true);
  if (simulatorMode === 'interactive') outputCopy.querySelectorAll('.response-title').forEach(title => title.remove());
  const record = {
    command, promptDirectory, mode: simulatorMode,
    output: domText(outputCopy).trim(),
    effects: beforeFs ? describeFilesystemChanges(beforeFs, virtualFs) : [],
    directoryBefore: beforeDirectory,
    directoryAfter: currentDirectory,
  };
  entry.sessionRecord = record;
  sessionRecords.push(record);
  entry.append(response);
  historyEl.append(entry);
  body.scrollTop = body.scrollHeight;
}
function domText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const text = [...node.childNodes].map(domText).join('');
  return ['P','PRE','DIV','SECTION'].includes(node.tagName) ? `${text.trim()}\n` : text;
}
function printUsage(response, command) {
  if (simulatorMode === 'interactive') {
    const lines = [`${command.name} — ${command.summary}`, `Usage: ${command.usage}`];
    if (command.flags?.length) {
      lines.push('', 'Options:');
      for (const flag of command.flags) lines.push(`  ${flag.padEnd(20)} ${command.optionDescriptions?.[flag] || 'See the command manual on Fedora for this option.'}`);
    }
    appendTerminalText(response, lines.join('\n'));
    return;
  }
  appendSection(response, 'COMMAND GUIDE', command.summary);
  const usage = appendSection(response, 'USAGE');
  usage.append(el('pre', '', command.usage));
  if (command.flags?.length) {
    const options = appendSection(response, 'OPTIONS IN THIS LIBRARY');
    for (const flag of command.flags) {
      options.append(el('p', 'option-line', ''));
      const row = options.lastChild;
      row.append(el('code', '', flag));
      row.append(el('span', '', command.optionDescriptions?.[flag] || 'See the command manual on Fedora for this option.'));
    }
  }
}
function appendTerminalText(response, text, type='stdout') {
  response.classList.add('terminal-response');
  response.append(el('pre', `terminal-output ${type}`, text));
}
function renderSavedHistoryRecord(record) {
  const entry = el('article', 'history-entry');
  entry.dataset.mode = record.mode === 'interactive' ? 'interactive' : 'guide';
  entry.dataset.promptDirectory = record.promptDirectory || '/home/fedora';
  entry.append(addPrompt(record.command || '', entry.dataset.promptDirectory));
  const response = el('div', 'response');
  if (record.output) {
    if (entry.dataset.mode === 'interactive') appendTerminalText(response, record.output);
    else response.append(el('pre', '', record.output));
  }
  entry.sessionRecord = record;
  entry.append(response);
  historyEl.append(entry);
}
function markdownFence(text) {
  const runs = text.match(/`+/g) || [];
  return '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
}
function sessionMarkdown() {
  const lines = [
    '# Fedora Command Atlas session log',
    '',
    `- Saved: ${new Date().toLocaleString()}`,
    `- Session entries: ${sessionRecords.length}`,
    '- Filesystem changes in this log refer only to the browser sandbox.',
    '',
  ];
  sessionRecords.forEach((record, index) => {
    const command = record.command || '(session event)';
    lines.push(`## ${index + 1}. ${record.mode === 'interactive' ? 'Interactive' : 'Guide'} session`, '', `**Prompt:** \`${displayDirectory(record.promptDirectory || '/home/fedora')}$\``, '', `$ ${command}`, '');
    if (record.output) {
      const fence = markdownFence(record.output);
      lines.push('**Output**', '', fence + 'text', record.output, fence, '');
    } else lines.push('_No output._', '');
    if (record.directoryBefore !== record.directoryAfter) lines.push(`**Working directory:** \`${record.directoryBefore}\` → \`${record.directoryAfter}\``, '');
    if (record.effects?.length) {
      lines.push('**Virtual filesystem effects**', '');
      for (const effect of record.effects) lines.push(`- ${effect}`);
      lines.push('');
    }
  });
  return lines.join('\n');
}
function downloadFile(filename, contents, mimeType) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function timestampForFilename() { return new Date().toISOString().replace(/[:.]/g, '-'); }
function saveSessionLog() {
  downloadFile(`fedora-atlas-session-${timestampForFilename()}.md`, sessionMarkdown(), 'text/markdown;charset=utf-8');
}
function saveSimulatorState() {
  const visibleHistory = [...historyEl.querySelectorAll(':scope > .history-entry')].map(entry => entry.sessionRecord).filter(Boolean);
  const state = {
    format: 'fedora-command-atlas-state',
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    mode: simulatorMode,
    currentDirectory,
    previousDirectory,
    filesystem: serializeVirtualNode(virtualFs),
    commandHistory: commandHistory.slice(-1000),
    historyIndex,
    inputValue: input.value,
    scrollTop: body.scrollTop,
    visibleHistory,
    sessionRecords,
  };
  downloadFile(`fedora-atlas-state-${timestampForFilename()}.json`, JSON.stringify(state, null, 2), 'application/json;charset=utf-8');
}
function safeSavedRecord(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid session history entry.');
  const text = (candidate, limit=200000) => typeof candidate === 'string' ? candidate.slice(0, limit) : '';
  return {
    command: text(value.command, 10000),
    promptDirectory: text(value.promptDirectory, 2000) || '/home/fedora',
    mode: value.mode === 'interactive' ? 'interactive' : 'guide',
    output: text(value.output),
    effects: Array.isArray(value.effects) ? value.effects.slice(0, 1000).map(effect => text(effect, 4000)) : [],
    directoryBefore: text(value.directoryBefore, 2000),
    directoryAfter: text(value.directoryAfter, 2000),
  };
}
function findNodeAt(root, path) {
  let node = root;
  for (const part of path.split('/').filter(Boolean)) {
    if (!node || node.type !== 'directory') return null;
    node = node.children[part];
  }
  return node || null;
}
async function loadSimulatorState(file) {
  if (!file) return;
  if (file.size > 10_000_000) throw new Error('State file is larger than 10 MB.');
  const data = JSON.parse(await file.text());
  if (data.format !== 'fedora-command-atlas-state' || data.schemaVersion !== 1) throw new Error('This is not a supported Fedora Command Atlas state file.');
  const restoredFs = sanitizeVirtualNode(data.filesystem);
  if (restoredFs.type !== 'directory') throw new Error('The saved filesystem root is invalid.');
  const restoredMode = data.mode === 'interactive' ? 'interactive' : 'guide';
  const restoredDirectory = typeof data.currentDirectory === 'string' && data.currentDirectory.startsWith('/') ? normalizeVirtualPath(data.currentDirectory, '/') : '/home/fedora';
  if (restoredMode === 'interactive' && findNodeAt(restoredFs, restoredDirectory)?.type !== 'directory') throw new Error('The saved working directory is missing from its filesystem.');
  const previousCandidate = typeof data.previousDirectory === 'string' && data.previousDirectory.startsWith('/') ? normalizeVirtualPath(data.previousDirectory, '/') : null;
  const restoredPrevious = restoredMode === 'interactive'
    ? (previousCandidate && findNodeAt(restoredFs, previousCandidate)?.type === 'directory' ? previousCandidate : null)
    : previousCandidate;
  const visible = Array.isArray(data.visibleHistory) ? data.visibleHistory.slice(-1000).map(safeSavedRecord) : [];
  const records = Array.isArray(data.sessionRecords) ? data.sessionRecords.slice(-5000).map(safeSavedRecord) : visible.slice();
  const restoredCommands = Array.isArray(data.commandHistory) ? data.commandHistory.slice(-1000).filter(item => typeof item === 'string').map(item => item.slice(0,10000)) : [];

  virtualFs = restoredFs;
  currentDirectory = restoredDirectory;
  previousDirectory = restoredPrevious;
  simulatorMode = restoredMode;
  commandHistory = restoredCommands;
  historyIndex = Math.max(0, Math.min(Number.isInteger(data.historyIndex) ? data.historyIndex : commandHistory.length, commandHistory.length));
  input.value = typeof data.inputValue === 'string' ? data.inputValue.slice(0,10000) : '';
  sessionRecords = records;
  historyEl.replaceChildren();
  for (const record of visible) renderSavedHistoryRecord(record);
  setSimulatorMode(simulatorMode);
  body.scrollTop = Number.isFinite(data.scrollTop) ? Math.max(0, data.scrollTop) : body.scrollHeight;
  return file.name;
}
function requestLoadState() { document.querySelector('#load-state-input').click(); }
function words(text) { return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []; }
function phraseMatches(phrase, terms) {
  const q = words(phrase);
  const haystack = new Set(words(terms));
  return q.length > 0 && q.every(word => haystack.has(word));
}
function tokenize(line) {
  const tokens = [];
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = regex.exec(line))) tokens.push(match[1] ?? match[2] ?? match[3]);
  return tokens;
}
function getCommand(tokens) {
  let index = 0;
  let elevated = false;
  if (tokens[index] === 'sudo') {
    elevated = true;
    index++;
    while (tokens[index]?.startsWith('-')) index++;
  }
  const requested = (tokens[index] || '').split('/').pop();
  return { name: requested, command: catalog.get(requested), args: tokens.slice(index + 1), elevated };
}
function matchedOptions(command, args) {
  const descriptions = command.optionDescriptions || {};
  const found = new Map();
  for (const token of args) {
    const exact = Object.keys(descriptions).find(flag => token === flag || (flag.startsWith('--') && token.startsWith(flag + '=')));
    if (exact) { found.set(exact, descriptions[exact]); continue; }
    if (/^-[A-Za-z]{2,}$/.test(token)) {
      for (const letter of token.slice(1)) {
        const flag = `-${letter}`;
        if (descriptions[flag]) found.set(flag, descriptions[flag]);
      }
    }
  }
  return [...found.entries()];
}
function isDestructive(name, args) {
  const line = [name, ...args].join(' ').toLowerCase();
  return /^(rm|mkfs|wipefs|dd|shred)\b/.test(line) ||
    (/^(dnf|rpm|flatpak)\b/.test(line) && /\b(remove|erase|uninstall)\b/.test(line)) ||
    name === 'chown' || name === 'chmod';
}
function previewFor(name, args, raw) {
  if (name === 'echo') return args.join(' ');
  if (name === 'pwd') return currentDirectory;
  if (name === 'clear') return '';
  if (name === 'ls' && args.includes('-a')) return '.  ..  .bashrc  .config  Desktop  Documents  Downloads  Pictures  [illustrative]';
  if (name === 'systemctl' && args.includes('--failed')) return 'UNIT LOAD ACTIVE SUB DESCRIPTION\n0 loaded units listed.  [illustrative practice output]';
  if (name === 'systemctl' && args[0] === 'status') return '● example.service - Example background service\n     Loaded: loaded (example.service; enabled)\n     Active: active (running)  [illustrative]';
  if (name === 'dnf') return 'DNF would contact configured repositories and report matching packages or planned changes. Repository access is not simulated.';
  if (name === 'rpm') return 'RPM would print package query or verification results for the selected package. This preview uses no installed package database.';
  if (name === 'journalctl') return '-- Logs begin at a simulated boot --\nOct 20 12:00:00 fedora-lab systemd[1]: Started Example Service.\n[illustrative log line]';
  if (name === 'gsettings' || name === 'dconf') return 'The value shown here depends on this user’s desktop profile. No real preferences were read or changed.';
  if (name === 'mkdir' || name === 'cp' || name === 'mv' || name === 'rm' || name === 'chown' || name === 'chmod' || name === 'systemctl') return 'Preview: the requested operation would be handled by this command. No file or system changes were made.';
  if (canned[name]) return canned[name];
  if (name === 'python3') return 'Python would start the requested script or module. Scripts are never executed in this practice simulator.';
  if (name === 'curl' || name === 'ping' || name === 'ssh' || name === 'nmcli' || name === 'firewall-cmd') return 'This command normally depends on live network or firewall state. That state is not queried in the simulator.';
  const command = catalog.get(name);
  const sample = command?.examples?.[0];
  return sample ? `The catalog’s example is: ${sample}\nActual output depends on the files, services, devices, or settings on your Fedora system.` : `Actual output depends on your local Fedora system. Try “${name} --help” to review its available options.`;
}
function simulatedCatalogOutput(name, args, raw, command) {
  const explicit = typeof command.simulation === 'string' && command.simulation.trim();
  let output = explicit ? command.simulation.trim() : previewFor(name, args, raw);
  if (!explicit && /The catalog’s example is:|Actual output depends on your local Fedora system/i.test(output)) {
    output = `# ${name}: ${command.summary}\n# Arguments: ${args.join(' ') || '(none)'}\n# Exact output depends on this Fedora system's local state.`;
  }
  const note = isDestructive(name, args)
    ? '[simulation only — no host files, packages, settings, or system state changed]'
    : '[simulation only — no host command or host data used]';
  return `${output}\n\n${note}`;
}
function handle(commandLine) {
  const line = commandLine.trim();
  if (!line) return;
  if (line === '/loadstate') {
    addEntry(line, response => appendTerminalText(response, 'Choose a Fedora Command Atlas state file to load.'));
    requestLoadState();
    return;
  }
  const redirect = simulatorMode === 'interactive' ? /^echo\s+(.+?)\s*(>>|>)\s*(\S+)\s*$/.exec(line) : null;
  if (redirect) { handleEchoRedirect(line, redirect); return; }
  if (/[|;&><`]|\$\(/.test(line)) {
    addEntry(line, response => {
      appendSection(response, 'ONE COMMAND AT A TIME', simulatorMode === 'interactive' ? 'Pipes, command chaining, and shell substitutions are not supported. In Interactive mode, echo TEXT > FILE and echo TEXT >> FILE write only to the virtual filesystem.' : 'Pipes, redirection, command chaining, and shell substitutions are not interpreted in Guide mode. Submit one plain command to see its practice preview.');
    });
    return;
  }
  if (line === 'clear') { historyEl.replaceChildren(); return; }
  if (/^(exit|quit)$/.test(line)) {
    addEntry(line, response => simulatorMode === 'interactive'
      ? appendTerminalText(response, 'logout')
      : appendSection(response, 'SESSION READY', 'This is a browser practice page. Type another command whenever you like.'));
    return;
  }
  if (line === 'help') {
    addEntry(line, response => {
      if (simulatorMode === 'interactive') {
        appendTerminalText(response, 'Atlas practice shell\nFilesystem commands use the temporary sandbox. Other library commands show safe simulated output.\n\nTry: pwd, ls -la, mkdir Projects/demo, touch file.txt, cat file.txt, help dnf\nUse /loadstate to restore a saved state. SAVE LOG downloads this session as Markdown; SAVE STATE downloads a restorable snapshot.');
        return;
      }
      appendSection(response, 'PRACTICE HELP', simulatorMode === 'interactive' ? 'Interactive mode runs filesystem commands against a temporary virtual filesystem. Every command in the loaded libraries is also available: commands without a filesystem handler receive a metadata-based simulation preview. No host shell is run.' : 'Guide mode explains commands, options, and task phrases with illustrative output. Switch to Interactive mode to work in a temporary virtual filesystem.');
      const samples = appendSection(response, 'TRY THESE');
      samples.append(el('pre', '', simulatorMode === 'interactive' ? 'pwd\nls -la\nmkdir Projects/demo\ntouch Projects/demo/notes.txt\necho Hello Fedora > Projects/demo/notes.txt\ncat Projects/demo/notes.txt\nrm Projects/demo/notes.txt' : 'ls -lah\ncd Documents\npwd\ndf -h\nchown alex report.txt\nsystemctl --failed\nchange who owns a file\nman gsettings'));
      appendSection(response, 'BUILT-IN SHORTCUTS', 'help   show this guide\nman NAME   read the Atlas summary for a command\ncd DIR   change the simulated directory\npwd   print the simulated directory\nclear   clear the practice history');
    });
    return;
  }
  if (line.startsWith('help ')) {
    const name = line.slice(5).trim().split(/\s+/)[0];
    const command = catalog.get(name);
    addEntry(line, response => command ? printUsage(response, command) : appendSection(response, 'HELP NOT IN LIBRARY', `No local Atlas or Bash builtin entry was found for “${name}”.`));
    return;
  }
  if (line.startsWith('man ')) {
    const name = line.slice(4).trim().split(/\s+/)[0];
    const command = catalog.get(name);
    addEntry(line, response => command ? printUsage(response, command) : appendSection(response, 'MANUAL NOT IN LIBRARY', `No local Atlas entry was found for “${name}”.`));
    return;
  }
  const parsed = tokenize(line);
  if (simulatorMode === 'interactive' && runInteractiveFilesystem(line, parsed)) return;
  if (parsed[0] === 'cd') {
    const oldDirectory = currentDirectory;
    if (parsed.length > 2) {
      addEntry(line, response => appendSection(response, 'CD USAGE', 'Use cd with zero or one directory argument.'), oldDirectory);
      return;
    }
    let destination = parsed[1] || '~';
    if (destination === '-') destination = previousDirectory || '~';
    if (destination === '~') destination = '/home/fedora';
    else if (destination.startsWith('~/')) destination = `/home/fedora/${destination.slice(2)}`;
    else if (!destination.startsWith('/')) destination = `${currentDirectory}/${destination}`;
    const parts = [];
    for (const part of destination.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    currentDirectory = `/${parts.join('/')}`;
    previousDirectory = oldDirectory;
    updatePromptDirectory();
    addEntry(line, response => appendSection(response, 'SIMULATED DIRECTORY CHANGED', `The practice prompt is now at ${displayDirectory(currentDirectory)}. No real folders were checked or changed.`), oldDirectory);
    return;
  }
  if ((parsed[0] === 'apropos' || parsed[0] === 'what') && parsed.length > 1) {
    const phrase = parsed.slice(1).join(' ').replace(/^does\s+/, '');
    showPhraseMatches(line, phrase);
    return;
  }
  const phraseCandidate = catalog.has(parsed[0]) || parsed[0] === 'sudo' || builtins.has(parsed[0]);
  if (!phraseCandidate) {
    showPhraseMatches(line, line);
    return;
  }
  const { name, command, args, elevated } = getCommand(parsed);
  if (!command) {
    addEntry(line, response => appendSection(response, 'COMMAND NOT IN THESE LIBRARIES', `“${name}” is not in the loaded Fedora, KDE Plasma, or GNOME catalogs. Try “help”, or search the Atlas for a related command.`));
    return;
  }
  if (args.includes('--help') || args.includes('-h')) {
    addEntry(line, response => printUsage(response, command));
    return;
  }
  const options = matchedOptions(command, args);
  addEntry(line, response => {
    const interactive = simulatorMode === 'interactive';
    if (interactive) {
      appendTerminalText(response, simulatedCatalogOutput(name, args, line, command));
      return;
    }
    const section = appendSection(response, interactive ? 'SIMULATED COMMAND' : 'COMMAND RECOGNIZED');
    section.append(el('p', '', `${name} — ${command.summary}`));
    if (elevated) appendSection(response, 'PRIVILEGE NOTE', 'The sudo prefix requests administrator privileges in a real terminal. This simulator does not elevate permissions.');
    if (options.length) {
      const optionSection = appendSection(response, 'OPTIONS FOUND');
      for (const [flag, description] of options) {
        const row = el('p', 'option-line');
        row.append(el('code', '', flag), el('span', '', description));
        optionSection.append(row);
      }
    }
    if (isDestructive(name, args)) appendSection(response, 'CAUTION', 'This kind of command can change or remove files, permissions, packages, or system services when run for real. In this simulator, no host changes are made.', 'warning');
    const output = appendSection(response, interactive ? 'SIMULATED OUTPUT' : 'ILLUSTRATIVE OUTPUT — NOT RUN');
    output.append(el('pre', '', interactive ? simulatedCatalogOutput(name, args, line, command) : previewFor(name, args, line)));
    const usage = appendSection(response, 'USAGE');
    usage.append(el('pre', '', command.usage));
  });
}
function showPhraseMatches(original, phrase) {
  const intent = phrase.toLocaleLowerCase().replace(/^(what does|what is|how do i|how can i|how to|i need to|i want to|command for)\s+/, '').replace(/\s+do\??$/, '').trim();
  const matches = [...catalog.values()].filter(command => phraseMatches(intent, [command.name, command.summary, ...(command.searchTerms || [])].join(' '))).slice(0, 6);
  addEntry(original, response => {
    if (simulatorMode === 'interactive') {
      if (!matches.length) {
        appendTerminalText(response, `bash: ${original}: no command or close task match found`, 'stderr');
        return;
      }
      const lines = matches.flatMap(command => [
        `${command.name} — ${command.summary}`,
        ...(command.examples?.[0] ? [`  ${command.examples[0]}`] : []),
      ]);
      appendTerminalText(response, lines.join('\n'));
      return;
    }
    if (!matches.length) {
      appendSection(response, 'NO CLOSE MATCH', 'I could not match that task phrase to a command in the loaded libraries. Try a shorter phrase or search the Atlas.');
      return;
    }
    appendSection(response, 'TASK MATCHES', `Commands that may help with “${phrase}”:`);
    for (const command of matches) {
      const card = appendSection(response, command.name, command.summary);
      if (command.examples?.[0]) card.append(el('pre', '', command.examples[0]));
    }
  });
}
function submit(event) {
  event.preventDefault();
  const value = input.value;
  if (!value.trim()) return;
  commandHistory.push(value);
  historyIndex = commandHistory.length;
  handle(value);
  input.value = '';
  input.focus();
}
document.querySelector('#command-form').addEventListener('submit', submit);
document.querySelector('#clear-button').addEventListener('click', () => { historyEl.replaceChildren(); input.focus(); });
document.querySelector('#mode-toggle').addEventListener('click', () => {
  if (simulatorMode === 'guide') {
    if (!getVirtualNode(currentDirectory)) currentDirectory = '/home/fedora';
    setSimulatorMode('interactive');
  } else setSimulatorMode('guide');
  input.focus({ preventScroll: true });
});
document.querySelector('#reset-button').addEventListener('click', () => {
  const beforeFs = cloneVirtualNode(virtualFs);
  const beforeDirectory = currentDirectory;
  resetVirtualFilesystem();
  updatePromptDirectory();
  historyEl.replaceChildren();
  const record = {
    command: 'RESET FS', promptDirectory: beforeDirectory, mode: simulatorMode,
    output: 'Sandbox reset. The starter virtual filesystem has been restored.',
    effects: describeFilesystemChanges(beforeFs, virtualFs),
    directoryBefore: beforeDirectory, directoryAfter: currentDirectory,
  };
  sessionRecords.push(record);
  renderSavedHistoryRecord(record);
  body.scrollTop = body.scrollHeight;
  input.focus();
});
document.querySelector('#save-log-button').addEventListener('click', saveSessionLog);
document.querySelector('#save-state-button').addEventListener('click', saveSimulatorState);
document.querySelector('#load-state-button').addEventListener('click', requestLoadState);
document.querySelector('#load-state-input').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    await loadSimulatorState(file);
  } catch (error) {
    addEntry('/loadstate', response => appendTerminalText(response, `loadstate: ${error.message}`, 'stderr'));
  }
  input.focus({ preventScroll: true });
});
setSimulatorMode('guide');
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.command; input.focus(); if (button.dataset.command.startsWith('change ')) { handle(input.value); input.value = ''; } }));
input.addEventListener('keydown', event => {
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (historyIndex > 0) historyIndex--;
    input.value = commandHistory[historyIndex] || '';
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (historyIndex < commandHistory.length) historyIndex++;
    input.value = commandHistory[historyIndex] || '';
  }
});
loadCatalog().catch(error => {
  const response = el('div', 'response');
  response.append(el('div', 'response-title', 'CATALOG UNAVAILABLE'), el('p', '', `${error.message}. Start the Atlas with ./launch-atlas.sh and try again.`));
  historyEl.append(response);
});

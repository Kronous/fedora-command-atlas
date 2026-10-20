const historyEl = document.querySelector('#history');
const input = document.querySelector('#command-input');
const body = document.querySelector('#terminal-body');
let catalog = new Map();
let commandHistory = [];
let historyIndex = 0;
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
  const supported = new Set(['pwd','cd','ls','mkdir','touch','cat','rm','rmdir','cp','mv','echo','tree','find','stat']);
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
      appendSection(response, 'DIRECTORY CHANGED', `Now at ${displayDirectory(currentDirectory)} in the virtual filesystem.`); return;
    }
    if (name === 'ls' || name === 'tree') {
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
      errors.length ? virtualError(response, errors.join('\n')) : appendSection(response, 'DIRECTORY CREATED', `Created ${paths.join(', ')} in the virtual filesystem.`);
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
      errors.length ? virtualError(response, errors.join('\n')) : appendSection(response, 'FILE CREATED', `Created or updated ${paths.join(', ')} in the virtual filesystem.`);
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
      errors.length ? virtualError(response, errors.join('\n')) : appendSection(response, 'REMOVED FROM SANDBOX', `Removed ${paths.join(', ')} from the virtual filesystem.`);
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
      appendSection(response, name === 'mv' ? 'MOVED IN SANDBOX' : 'COPIED IN SANDBOX', `Simulated ${name} ${source} → ${destination}.`);
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
    appendSection(response, 'FILE WRITTEN IN SANDBOX', `${match[2] === '>>' ? 'Appended to' : 'Wrote'} ${destination} in the virtual filesystem.`);
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
function addPrompt(command, path=currentDirectory) {
  const line = el('div', 'entered-command');
  line.append(el('span', 'prompt-user', `fedora:${displayDirectory(path)}$`));
  line.append(el('code', '', command));
  historyEl.append(line);
  return line;
}
function addEntry(command, renderer, promptDirectory=currentDirectory) {
  const entry = el('article', 'history-entry');
  entry.append(addPrompt(command, promptDirectory));
  const response = el('div', 'response');
  renderer(response);
  entry.append(response);
  historyEl.append(entry);
  body.scrollTop = body.scrollHeight;
}
function printUsage(response, command) {
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
function handle(commandLine) {
  const line = commandLine.trim();
  if (!line) return;
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
    addEntry(line, response => appendSection(response, 'SESSION READY', 'This is a browser practice page. Type another command whenever you like.'));
    return;
  }
  if (line === 'help') {
    addEntry(line, response => {
      appendSection(response, 'PRACTICE HELP', simulatorMode === 'interactive' ? 'Interactive mode applies supported file commands to a temporary virtual filesystem. Try mkdir, touch, echo text > file, cat, cp, mv, rm, ls, and cd. Other catalog commands show guide previews.' : 'Guide mode explains commands, options, and task phrases with illustrative output. Switch to Interactive mode to work in a temporary virtual filesystem.');
      const samples = appendSection(response, 'TRY THESE');
      samples.append(el('pre', '', simulatorMode === 'interactive' ? 'pwd\nls -la\nmkdir Projects/demo\ntouch Projects/demo/notes.txt\necho Hello Fedora > Projects/demo/notes.txt\ncat Projects/demo/notes.txt\nrm Projects/demo/notes.txt' : 'ls -lah\ncd Documents\npwd\ndf -h\nchown alex report.txt\nsystemctl --failed\nchange who owns a file\nman gsettings'));
      appendSection(response, 'BUILT-IN SHORTCUTS', 'help   show this guide\nman NAME   read the Atlas summary for a command\ncd DIR   change the simulated directory\npwd   print the simulated directory\nclear   clear the practice history');
    });
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
    const section = appendSection(response, 'COMMAND RECOGNIZED');
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
    if (isDestructive(name, args)) appendSection(response, 'CAUTION', 'This kind of command can change or remove files, permissions, packages, or system services when run for real. Here it only produces a learning preview.', 'warning');
    const output = appendSection(response, 'ILLUSTRATIVE OUTPUT — NOT RUN');
    output.append(el('pre', '', previewFor(name, args, line)));
    const usage = appendSection(response, 'USAGE');
    usage.append(el('pre', '', command.usage));
  });
}
function showPhraseMatches(original, phrase) {
  const intent = phrase.toLocaleLowerCase().replace(/^(what does|what is|how do i|how can i|how to|i need to|i want to|command for)\s+/, '').replace(/\s+do\??$/, '').trim();
  const matches = [...catalog.values()].filter(command => phraseMatches(intent, [command.name, command.summary, ...(command.searchTerms || [])].join(' '))).slice(0, 6);
  addEntry(original, response => {
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
  input.focus();
});
document.querySelector('#reset-button').addEventListener('click', () => {
  resetVirtualFilesystem();
  historyEl.replaceChildren();
  historyEl.append(el('div', 'mode-notice', 'Sandbox reset. The starter virtual filesystem has been restored.'));
  body.scrollTop = body.scrollHeight;
  input.focus();
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

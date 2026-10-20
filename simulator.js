const historyEl = document.querySelector('#history');
const input = document.querySelector('#command-input');
const body = document.querySelector('#terminal-body');
let catalog = new Map();
let commandHistory = [];
let historyIndex = 0;
let currentDirectory = '/home/fedora';
let previousDirectory = null;

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
  if (/[|;&><`]|\$\(/.test(line)) {
    addEntry(line, response => {
      appendSection(response, 'ONE COMMAND AT A TIME', 'Pipes, redirection, command chaining, and shell substitutions are not interpreted here. Submit one plain command to see its practice preview.');
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
      appendSection(response, 'PRACTICE HELP', 'Enter a command, a command with options, or a plain-language task. The simulator explains it and shows an illustrative output preview.');
      const samples = appendSection(response, 'TRY THESE');
      samples.append(el('pre', '', 'ls -lah\ncd Documents\npwd\ndf -h\nchown alex report.txt\nsystemctl --failed\nchange who owns a file\nman gsettings'));
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

# Fedora Command Atlas

An offline-friendly, searchable command reference for Fedora 44, KDE Plasma, and GNOME. It has no runtime dependencies or external assets.

## Run it

Execute `./launch-atlas.sh` (or double-click it in your file manager) to start the local server and open the Atlas in your browser. The script can be run from any working directory. It uses port `8765` by default; set `ATLAS_PORT=8080 ./launch-atlas.sh` to choose another port. The server binds to localhost and stays running after the launcher exits.

For manual startup, modern browsers restrict `fetch()` from `file://` pages. From this directory, run Python's built-in local server:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open <http://localhost:8080>. The app and catalog data are served from this computer; no internet connection is needed.

## Practice terminal

Open `simulator.html` from the Atlas or navigate to it directly to use the separate terminal-style practice page. It recognizes commands and task phrases from the registered modules, explains matched options, and shows clearly labeled illustrative output. It does not execute shell commands or access system state.

## Module layout

Each command library lives in its own folder. `modules.json` is the registry the app reads to discover libraries.

```text
modules.json
modules/
├── fedora-core/
│   └── catalog.json
├── kde-plasma/
│   └── catalog.json
└── gnome/
    └── catalog.json
```

This keeps libraries separate while allowing them to ship together in this repository. Adding a catalog does not require editing application code.

## Add a module

1. Create a folder such as `modules/audio-tools/` and add a `catalog.json` file containing the library metadata and commands:

```json
{
  "id": "audio-tools",
  "name": "Audio tools",
  "version": "Fedora 44 package snapshot",
  "commands": [
    {
      "name": "pw-cli",
      "category": "Audio",
      "summary": "Inspect and control PipeWire objects.",
      "usage": "pw-cli [options] COMMAND [ARGS...]",
      "flags": ["-h", "--help"],
      "optionDescriptions": {
        "-h": "Show concise command-line help.",
        "--help": "Print command usage and available options."
      },
      "searchTerms": [
        "inspect audio graph nodes",
        "list PipeWire devices and objects"
      ],
      "examples": ["pw-cli ls Node"],
      "platform": "Fedora",
      "library": "Audio tools",
      "source": "PipeWire 1.x pw-cli(1) manual"
    }
  ]
}
```

2. Register the catalog in `modules.json`:

```json
{
  "id": "audio-tools",
  "name": "Audio tools",
  "version": "Fedora 44 package snapshot",
  "file": "modules/audio-tools/catalog.json",
  "icon": "A"
}
```

The app reads registered modules at startup and adds them to the library filter and search index. Use a unique `id` and a one-letter `icon`. Catalog files must include a `commands` array.

### Command entry standards

- Set `platform` to `Fedora`, `KDE Plasma`, `GNOME`, or the relevant frontend label.
- Include `searchTerms` on every command: plain-language tasks, questions, and synonyms someone might search for when they do not know the command name. For example, `chown` should include “change file ownership” and “change who owns a file.” Add phrases for the command’s main uses.
- Include an `optionDescriptions` entry for every value in `flags`, so each option has a useful hover and keyboard-focus tooltip.
- Add correct usage, practical examples, category, and a source/version for the command reference.

Search covers command names, summaries, flags, examples, and `searchTerms`; it matches words across a phrase and tolerates a one-character typo.

## Coverage and accuracy

The included catalogs are a curated starter reference, not a dump of every executable installed by every Fedora package. Option lists show commonly used flags, not every option. Complete options can vary with the installed package version and build. For precise details, consult the local `man COMMAND` page or `COMMAND --help`; these are the authoritative, version-matched references on the user's machine.

A complete, package-specific library can be added in its own module folder using manuals and help output collected from the exact Fedora package versions. The module format supports this without changing app code.

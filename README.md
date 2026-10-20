# Fedora Command Atlas

A standalone, offline-friendly command reference for Fedora 44 with separate Fedora core, KDE Plasma, and GNOME libraries. It has no runtime dependencies or external assets.

## Run it

Execute `./launch-atlas.sh` (or double-click it in your file manager) to start the local server and open the Atlas in your browser. The script can be run from any working directory. It uses port `8765` by default; set `ATLAS_PORT=8080 ./launch-atlas.sh` to choose another port. The server binds to localhost only and stays running after the launcher exits.

To start the server manually, modern browsers restrict `fetch()` from `file://` pages. From this directory, run Python's built-in local server:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open <http://localhost:8080>. The app and catalog data are served from this computer; no internet connection is needed. You can also host the directory on any static web server.

## Add a library

1. Add a JSON file under `data/` using this structure:

```json
{
  "id": "Audio tools",
  "name": "Audio tools",
  "version": "Fedora 44 package snapshot",
  "commands": [
    {
      "name": "pw-cli",
      "category": "Audio",
      "summary": "Inspect and control PipeWire objects.",
      "usage": "pw-cli [options] COMMAND [ARGS...]",
      "flags": ["-h", "--help"],
      "optionDescriptions": {"-h": "Show concise command-line help.", "--help": "Print command usage and available options."},
      "searchTerms": ["inspect audio graph nodes", "list PipeWire devices and objects"],
      "examples": ["pw-cli ls Node"],
      "platform": "Fedora",
      "library": "Audio tools",
      "source": "PipeWire 1.x pw-cli(1) manual"
    }
  ]
}
```

2. Add a matching entry to `SOURCES` at the top of `app.js`, including its library ID and one-letter icon. The new library appears in the sidebar and its commands are indexed automatically.

`platform` is the frontend label shown on each command (for example `Fedora`, `KDE Plasma`, or `GNOME`). For commands shared across desktops, use `Fedora` or add separate entries with clear applicability notes.

Every command entry must include `searchTerms`: a list of plain-language tasks, questions, and synonyms describing what people might type when they do not know the command name. For example, `chown` should include phrases such as `change file ownership` and `change who owns a file`. Add enough varied phrases to cover the command’s main uses. The search index checks command names, descriptions, flags, examples, and these phrases; phrase matching tolerates a one-character typo. Add `optionDescriptions` for every item in `flags` so each option has an explanatory tooltip.

## Coverage and accuracy

The included files are a curated starter catalog of common Fedora 44 and desktop commands, not a dump of every executable installed by every Fedora package. Option lists show commonly used flags, not every option. Complete options can vary with the installed package version and build. For precise details, consult the local `man COMMAND` page or `COMMAND --help`; these are the authoritative, version-matched references on the user's machine.

To publish a complete, package-specific library, generate entries from the Fedora 44 package set and include each command's exact version and locally collected manual/help text. The current schema is ready to grow with such libraries. It deliberately does not imply that a generic option list is exhaustive.

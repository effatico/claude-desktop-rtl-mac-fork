# Claude Desktop RTL Patch for macOS

Improves right-to-left (RTL) text in [Claude Desktop](https://claude.ai/download) on macOS, for Persian, Arabic and Hebrew mixed with English. Each paragraph, list and table takes the direction of the language most of it is written in, in the chat and in the Code tab, while code blocks stay left-to-right.

> **Based on [claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch) by [@shraga100](https://github.com/shraga100)**, which provides RTL support for Windows. The RTL JavaScript started from that project; this repository adapts the patching mechanism for macOS (different app structure, Electron fuses, code signing).

Claude Desktop now has RTL handling of its own. It picks the direction of a block from its **first** letter, so a Persian list whose first item starts with an English word or a `code` span is laid out left-to-right. This patch replaces that rule; see [Direction rule](#direction-rule).

## What it does

- **Mixed text**: a block is RTL when most of its words are RTL, even if it starts with an English word
- **Lists and tables**: one direction per list or table, so bullets, numbers and columns stay on one side; a table with a Persian header starts at the right edge, with its first column (the row number) on the right
- **Claude's responses**: direction is updated as responses stream in
- **Interface text**: session titles in the sidebar, option buttons and labels follow the same rule and start from the right when they are RTL; icons and buttons around them stay where they are
- **Code blocks**: always stay LTR — code formatting is never affected
- **Math expressions**: LaTeX/KaTeX, MathJax, and MathML always stay LTR — equations are never mirrored
- **Persian/Arabic font**: RTL letters use the bundled Vazirmatn font by default; pick another font or none (see below)
- **Non-destructive**: creates a patched *copy* of Claude.app — the original is never modified
- **Distinct icon**: the patched app has an "RTL" badge on its icon so you can tell them apart at a glance

## Before & After

| Without patch | With patch |
|:---:|:---:|
| Hebrew/Arabic text left-aligned, hard to read | Hebrew/Arabic text properly right-aligned |
| `שלום עולם` / `مرحبا بالعالم` stuck to the left | `שלום עולם` / `مرحبا بالعالم` aligned to the right |

## Requirements

- **macOS** (tested on macOS 15 Sequoia / macOS 26 Tahoe)
- **Claude Desktop** installed at `/Applications/Claude.app`
- **Node.js** (v22.12+) — needed for `npx` which runs `@electron/asar` and `@electron/fuses` (each pinned to a fixed version in `patch.sh`)
  - Install via [nodejs.org](https://nodejs.org/) or `brew install node`

## Quick Start

```bash
# Clone the repo
git clone https://github.com/soguy/claude-desktop-rtl-mac.git
cd claude-desktop-rtl-mac

# Install the patch
./patch.sh --install
```

> **Downloaded the ZIP instead of cloning?** You may need to make the script executable first: `chmod +x patch.sh`

That's it. A patched copy is created at `~/Applications/Claude-RTL.app` (your home folder, not `/Applications/`) and launches automatically.

## Usage

```bash
# Install (or update after Claude updates)
./patch.sh --install

# Remove the patched copy
./patch.sh --uninstall

# Check status
./patch.sh --status

# Interactive menu
./patch.sh

# Show help
./patch.sh --help
```

### Font for RTL text

Claude has no Persian/Arabic font of its own, so that text falls back to a system font. By default the patch uses the bundled [Vazirmatn](https://fonts.google.com/specimen/Vazirmatn) font for RTL letters; [Parastoo](https://fonts.google.com/specimen/Parastoo) is bundled too. Choose another font, or none, with `--font`:

```bash
# Default: bundled Vazirmatn (Persian/Arabic, OFL licensed — see fonts/OFL-Vazirmatn.txt)
./patch.sh --install

# Bundled Parastoo (Persian/Arabic, OFL licensed — see fonts/OFL-Parastoo.txt)
./patch.sh --install --font Parastoo

# No RTL font: keep what Claude and the system pick
./patch.sh --install --font none

# Use any font already installed on your system
./patch.sh --install --font "B Nazanin"
```

Bundled fonts are embedded in the patched app, so they work even if not installed on the system and the app makes no request to a font server. To bundle a different font, drop your own `.woff2/.woff/.ttf/.otf` files into `fonts/` and pass `--font "<family-name>"`. Files are matched to the name by their file name: `Vazirmatn-Bold.woff2` and `Vazirmatn.ttf` belong to `Vazirmatn`. With no matching file, the installed font of that name is used. The name may contain letters, digits, spaces, dots, dashes and underscores.

The chosen font is used for RTL letters only. English text, code and Claude's own fonts are not changed, including English words inside a Persian sentence.

A variable font is one file for all weights; name it with `Variable` or `wght` in the file name (`Parastoo-Variable.woff2`) so it is registered for every weight.

> **Hebrew users:** Parastoo and Vazirmatn don't ship Hebrew glyphs, so Hebrew still uses the system Hebrew font and nothing changes for it. For a Hebrew font, bundle one with Hebrew glyphs (e.g. Heebo, Rubik, Assistant) in `fonts/` and pass its name to `--font`.

## Direction rule

For each block the patch counts words, leaving out code, URLs, paths and file names:

- **40% or more of the words are RTL** → the block is right-to-left.
- **Under 30%** → left-to-right.
- **In between** → the first word decides.
- **No RTL words** → the block is left exactly as Claude rendered it.

A list or a table gets one direction from all of its text. An item in the other language keeps the list's side and is ordered from its own first letter, so `Node.js (v18) only.` reads correctly inside a Persian list. A table whose header row is RTL is always RTL, so the first column sits on the right even when the cells are mostly numbers or English terms.

Only the first 4,000 characters of a block are read to decide its direction.

Known limits:

- In a message that keeps its line breaks (a multi-line message you typed), each line is ordered by its own first letter. A Persian line that starts with an English word is ordered left-to-right.
- The patch does not rewrite what you type in the prompt box. While you type, each paragraph follows its first letter, which is Claude's own behaviour. The prompt box does use the RTL font, and with it Claude's standard sans font for Latin text, whatever font you chose in Claude's settings.
- Plain text fields (search boxes, simple inputs) get a direction from the same rule as you type.
- Text that is already on screen keeps the font stack it had. After you change Claude's font setting, reload the window to see it on that text.

## How it works

The patcher performs these steps:

1. **Verifies** that `/Applications/Claude.app` has an intact signature from Anthropic, and stops if it does not
2. **Copies** `/Applications/Claude.app` → `~/Applications/Claude-RTL.app`
3. **Extracts** the Electron `app.asar` archive
4. **Prepends** the RTL JavaScript to the scripts the app loads into its windows (about 15 files in `.vite/build/`); main-process and worker code is not touched
5. **Repacks** the `app.asar` archive
6. **Disables** the `EnableEmbeddedAsarIntegrityValidation` Electron fuse — this is required because the modified archive has a different hash, and Electron would crash on startup without this step
7. **Re-signs** the app with an ad-hoc code signature, keeping the Hardened Runtime

The original `/Applications/Claude.app` is **never touched**.

### Why a copy instead of patching in-place?

Unlike the [Windows version](https://github.com/shraga100/claude-desktop-rtl-patch) which patches the original installation directly, the macOS version creates a separate copy. This is safer because:

- **No sudo required** — `~/Applications/` is user-writable, so the script never needs elevated privileges
- **Original stays intact** — `/Applications/Claude.app` is never touched; you can always fall back to it
- **Auto-updates keep working** — Anthropic's updates go to the original app and won't conflict with the patch
- **No risk of breaking Claude** — if anything goes wrong, just delete the patched copy and the original is still there
- **macOS protections respected** — `/Applications/Claude.app` is protected by macOS App Management and on many machines owned by root; modifying it would mean bypassing macOS security features and breaking its signature

## Security

The injected JavaScript ([rtl-payload.js](rtl-payload.js)) makes no network requests and uses no IPC, storage or `eval`. It reads text and sets direction attributes and a font. It is short enough to read in full before you install.

Patching an app still costs some of its protection. Compared with the original Claude.app, the patched copy:

- **Has no ASAR integrity check.** The original refuses to start if `app.asar` was changed. The patched copy cannot have that check, so a program already running under your user account could change the copy's code and it would still start. That code would run with the permissions you granted Claude-RTL.
- **Is not signed by Anthropic.** It carries an ad-hoc signature, lives in your home folder and is writable by your user.
- **Loads libraries without a team check.** The Hardened Runtime is kept, which blocks library injection through `DYLD_*` environment variables and debugger attachment. An ad-hoc signature has no team, so the rule that libraries must come from the app's own team has to be switched off for the app and its helper processes. Apart from that one exception, every helper keeps exactly the entitlements it has in the original.
- **Does not update itself.** It stays on the version it was built from and misses later fixes, security fixes included. `./patch.sh --status` warns when the copy is behind the original.

These follow from modifying the app at all; the patcher cannot remove them. If that is not acceptable on your machine, use the original app, whose own RTL handling covers most plain Persian/Arabic/Hebrew text.

What the patcher does to limit the risk: it checks that the source app and the copy carry an intact Developer ID signature from Anthropic before changing anything, pins the versions of the two npm tools it runs (their own dependencies are still resolved by npm at install time), never asks for `sudo`, never touches the original app, and injects into as few files as possible.

## After Claude updates

When Claude Desktop auto-updates, it updates the original at `/Applications/Claude.app`. Your patched copy at `~/Applications/Claude-RTL.app` is a separate, independent app — it won't receive auto-updates. After Claude updates, re-run the patcher to create a fresh patched copy from the new version:

```bash
./patch.sh --install
```

This creates a fresh patched copy from the updated original.

**Tip:** Keep the original `Claude.app` around for updates. Let it update itself normally, then re-run the patcher. The patched copy may show update prompts, but updates won't apply correctly to it — always update via the original app.

## Uninstalling

```bash
./patch.sh --uninstall
```

This removes `~/Applications/Claude-RTL.app`. The original Claude.app is unaffected.

## Troubleshooting

### "Claude quit unexpectedly" on launch
The ASAR integrity fuse was not properly disabled. Re-run `./patch.sh --install` — it handles this automatically. If the problem persists, check that `npx` works: `npx --yes @electron/fuses@2.1.3 --help`.

### "Missing required dependencies: Node.js 22.12 or newer"
Install or update Node.js: `brew install node` or download from [nodejs.org](https://nodejs.org/).

### "... is not an intact app signed by Anthropic" or "did not pass signature verification"
The patcher only works from a genuine, unmodified Claude.app. Reinstall Claude Desktop from [claude.ai/download](https://claude.ai/download) and run the patcher again.

### The patch doesn't seem to work (no RTL alignment)
- Make sure you're running `Claude-RTL.app` from `~/Applications/`, not the original `Claude.app`
- Ask Claude for a Persian list whose first item starts with an English word; the numbers should sit on the right
- Check Console.app for `[Claude RTL]` log messages

### Keychain prompt: "Claude wants to use your confidential information"
On first launch, macOS will show a dialog asking for your password to allow access to **"Claude Safe Storage"** in your keychain. **This is safe to approve.** Claude Desktop uses Electron's `safeStorage` API to encrypt local data (like your login session). Since the patched copy has a different code signature than the original, macOS asks you to re-authorize access. This is a one-time prompt — macOS remembers the approval for future launches.

### Blank window on the very first launch
After approving the keychain prompt, you may see a blank/black window that never finishes loading. This is a one-time startup quirk: the renderer process is blocked while the keychain dialog is on screen, and on a fresh signature it sometimes doesn't recover from that pause. **Quit `Claude-RTL` and reopen it** — the second launch finds the keychain entries already approved and comes up normally. You should not see this again on subsequent launches.

### macOS Gatekeeper warning
Since the app is ad-hoc signed (not signed by Anthropic), macOS may show a warning on first launch. Right-click → Open to bypass it, or go to System Settings → Privacy & Security → Open Anyway.

## App icon

The patched `Claude-RTL.app` has a custom icon with a visible **"RTL" badge** in the bottom-right corner, making it easy to distinguish from the original Claude.app in the Dock and Finder. The badge uses a white background with a dark border, so it's visible on both light and dark wallpapers/themes.

## Project structure

```
claude-desktop-rtl-mac/
├── patch.sh          # Main patcher script
├── rtl-payload.js    # RTL direction JS (injected into Claude)
├── fonts/            # RTL font files (Vazirmatn and Parastoo bundled) and their licences
├── icon.icns         # RTL-badged app icon
├── README.md
└── LICENSE
```

## Credits

- **Original RTL detection logic**: [@shraga100](https://github.com/shraga100) — [claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch)
- **macOS adaptation**: this project

## License

MIT — see [LICENSE](LICENSE).

The RTL JavaScript (`rtl-payload.js`) is based on [claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch), which is also MIT licensed.

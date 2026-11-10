#!/bin/bash
# ============================================================================
# Claude Desktop RTL Patcher for macOS
#
# Improves RTL (right-to-left) text in Claude Desktop on macOS. Each block of
# Persian/Arabic/Hebrew text mixed with English takes the direction of the
# language most of it is written in, while code blocks stay LTR.
#
# Based on: https://github.com/shraga100/claude-desktop-rtl-patch (Windows)
# RTL detection JS payload by @shraga100, adapted for macOS by this project.
#
# How it works:
#   1. Verifies the original Claude.app is intact and signed by Anthropic
#   2. Copies Claude.app to ~/Applications/Claude-RTL.app (original untouched)
#   3. Extracts the app.asar archive
#   4. Prepends the RTL JS to the scripts the app loads into its windows
#   5. Repacks the archive
#   6. Disables the Electron ASAR integrity fuse (required to load modified archive)
#   7. Re-signs the app with an ad-hoc signature, keeping the Hardened Runtime
#
# Requirements: Node.js 22.12+ (for npx) — see README for details
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PAYLOAD_FILE="$SCRIPT_DIR/rtl-payload.js"
ICON_FILE="$SCRIPT_DIR/icon.icns"
FONTS_DIR="$SCRIPT_DIR/fonts"

# Font used for RTL (Persian/Arabic/Hebrew) letters. The default is Vazirmatn.
# Claude has no Persian/Arabic font of its own, so without one that text falls
# back to whatever the system picks. Choose another font, or none, either way:
#   * Command line:  ./patch.sh --install --font Parastoo
#                    ./patch.sh --install --font none
#   * Environment:   RTL_FONT_FAMILY=Parastoo ./patch.sh --install
#                    RTL_FONT_FAMILY= ./patch.sh --install      (none)
# Vazirmatn and Parastoo (both Persian/Arabic, OFL) are bundled in fonts/. To
# use a different font, drop your own .woff2/.woff/.ttf/.otf files in fonts/
# and pass --font "<family-name>" (the embedded files mean it works even if the
# font isn't installed on the system). With no matching files in fonts/ the
# patch falls back to an already-installed font of that name.
# The --font flag overrides RTL_FONT_FAMILY when both are set.
DEFAULT_RTL_FONT="Vazirmatn"
RTL_FONT_FAMILY="${RTL_FONT_FAMILY-$DEFAULT_RTL_FONT}"

# Family name the chosen font is registered under inside the app. The payload
# reads it from window.__claudeRtlFont, so it is defined in this one place.
RTL_FONT_ALIAS="Claude RTL Font"
# Code points the RTL font covers: Hebrew, Arabic and their extensions and
# presentation forms, plus ZWNJ/ZWJ. Latin text never uses the RTL font.
RTL_UNICODE_RANGE="U+0590-08FF,U+FB1D-FDFF,U+FE70-FEFF,U+200C-200D"

# npm tools are fetched with npx on demand. The versions are pinned so that an
# install never runs a release nobody has looked at. Bump them deliberately.
ASAR_PKG="@electron/asar@4.3.1"
FUSES_PKG="@electron/fuses@2.1.3"
MIN_NODE="22.12"

# Anthropic's Developer ID team. The source app must carry a valid signature
# from this team before it is copied and patched.
EXPECTED_TEAM_ID="Q6L2SF6YDW"

SOURCE_APP="/Applications/Claude.app"
PATCHED_APP="$HOME/Applications/Claude-RTL.app"
PATCHED_ASAR="$PATCHED_APP/Contents/Resources/app.asar"

TMP_DIR=""

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()     { echo -e "  ${CYAN}[*]${NC} $1"; }
success() { echo -e "  ${GREEN}[+]${NC} $1"; }
warn()    { echo -e "  ${YELLOW}[!]${NC} $1"; }
err()     { echo -e "  ${RED}[X]${NC} $1"; }
step()    { echo -e "\n${BOLD}${CYAN}► $1${NC}"; }

die() { err "$1"; exit 1; }

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
    if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
        rm -rf "$TMP_DIR" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Dependency helpers
# ---------------------------------------------------------------------------
asar_cmd() {
    command -v npx &>/dev/null || die "Bug: asar_cmd called without npx available."
    npx --yes "$ASAR_PKG" "$@"
}

fuses_cmd() {
    command -v npx &>/dev/null || die "Bug: fuses_cmd called without npx available."
    npx --yes "$FUSES_PKG" "$@"
}

check_dependencies() {
    local missing=()

    if ! command -v npx &>/dev/null || ! command -v node &>/dev/null; then
        missing+=("Node.js $MIN_NODE or newer (provides npx, needed for $ASAR_PKG and $FUSES_PKG)")
    else
        local node_ok
        node_ok=$(node -p "var v=process.versions.node.split('.').map(Number),m='$MIN_NODE'.split('.').map(Number);(v[0]>m[0]||(v[0]===m[0]&&v[1]>=m[1]))?1:0" 2>/dev/null || echo 0)
        if [ "$node_ok" != "1" ]; then
            missing+=("Node.js $MIN_NODE or newer (found $(node --version 2>/dev/null))")
        fi
    fi

    if ! command -v codesign &>/dev/null; then
        missing+=("Xcode Command Line Tools (provides codesign)")
    fi

    if [ ${#missing[@]} -gt 0 ]; then
        err "Missing required dependencies:"
        for dep in "${missing[@]}"; do
            echo -e "    - $dep"
        done
        echo ""
        echo "  Install Node.js: https://nodejs.org/ or 'brew install node'"
        echo "  Install Xcode CLI tools: xcode-select --install"
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Source app verification
# ---------------------------------------------------------------------------
# The patched copy inherits everything in the bundle it is made from, so that
# bundle must be the genuine app: an intact signature, made with a Developer ID
# certificate that Apple issued to Anthropic's team. The team is checked through
# a code requirement, which ties it to the certificate chain; the team name
# printed by "codesign -dv" alone would not.
ANTHROPIC_REQUIREMENT="anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = \"$EXPECTED_TEAM_ID\""

is_genuine_claude() {
    codesign --verify --deep --strict -R="$ANTHROPIC_REQUIREMENT" "$1" 2>/dev/null
}

verify_source_app() {
    step "Verifying the original Claude.app..."
    if ! is_genuine_claude "$SOURCE_APP"; then
        die "$SOURCE_APP is not an intact app signed by Anthropic ($EXPECTED_TEAM_ID). Reinstall Claude Desktop from https://claude.ai/download and try again."
    fi
    success "Signature is valid and belongs to Anthropic ($EXPECTED_TEAM_ID)."
}

# ---------------------------------------------------------------------------
# Claude process management
# ---------------------------------------------------------------------------
quit_claude_rtl() {
    # Only quit the patched RTL copy, not the original Claude or Claude Code
    if pgrep -f "Claude-RTL.app" &>/dev/null; then
        step "Quitting Claude-RTL..."
        # Use bundle identifier approach to be precise
        osascript -e 'tell application "Claude-RTL" to quit' 2>/dev/null || true
        sleep 2
        # If still running, force kill only the exact process
        pkill -f "Claude-RTL.app/Contents/MacOS" 2>/dev/null || true
        sleep 1
        success "Claude-RTL stopped."
    fi
}

# ---------------------------------------------------------------------------
# Font injector
# ---------------------------------------------------------------------------
# Appends a self-contained IIFE to the given header file that (a) registers the
# chosen font under $RTL_FONT_ALIAS with the FontFace API, from the bytes of the
# files in fonts/ or, with no files, from an installed font called
# $RTL_FONT_FAMILY, and (b) stores the alias in window.__claudeRtlFont. The RTL payload then puts that family first in the
# font stack of every element that holds RTL text. The faces are limited to
# $RTL_UNICODE_RANGE, so Latin text, code and the app's own fonts are unchanged.
# The font is the user's choice: replace the files in fonts/ and/or set
# RTL_FONT_FAMILY.
# All CSS uses single quotes so it embeds safely in a double-quoted JS string.
build_font_injector() {
    local header="$1"

    local family="$RTL_FONT_FAMILY"

    if [ -z "$family" ]; then
        log "No RTL font (--font none) — RTL text keeps the font Claude and the system pick."
        return 0
    fi

    # The name is written into CSS inside a JS string in the app's own scripts.
    # Accept only characters that cannot end either of them.
    case "$family" in
        *[!A-Za-z0-9\ ._-]*)
            die "Font name \"$family\" has unsupported characters. Use letters, digits, spaces, dots, dashes and underscores." ;;
    esac

    # Embed each font file in fonts/ as an @font-face for "$family". Weight and
    # style are guessed from the filename (e.g. "...-Bold", "...-Light-Italic").
    local face_css=""
    local faces_js=""
    local embedded=0
    local family_key
    family_key=$(printf '%s' "$family" | tr '[:upper:]' '[:lower:]' | tr -d ' _')
    if [ -d "$FONTS_DIR" ]; then
        shopt -s nullglob nocaseglob
        local f
        for f in "$FONTS_DIR"/*.woff2 "$FONTS_DIR"/*.woff "$FONTS_DIR"/*.ttf "$FONTS_DIR"/*.otf; do
            [ -f "$f" ] || continue
            local lc weight style ext fmt mime b64
            lc=$(basename "$f" | tr '[:upper:]' '[:lower:]')

            # Only files of the chosen family: "Vazirmatn-Bold.woff2" belongs
            # to "Vazirmatn", "B Nazanin.ttf" to "B Nazanin". Other fonts in
            # fonts/ are ignored, so --font with an installed font's name is
            # not silently replaced by a bundled one.
            case "$(printf '%s' "$lc" | tr -d ' _')" in
                "$family_key".*|"$family_key"-*|"$family_key"\[*) ;;
                *) continue ;;
            esac

            # A variable font holds every weight in one file. Its name says
            # so: "Parastoo-Variable.woff2", "Vazirmatn[wght].woff2".
            weight=400
            case "$lc" in
                *variable*|*wght*)         weight="100 900" ;;
                *thin*)                    weight=100 ;;
                *extralight*|*ultralight*) weight=200 ;;
                *light*)                   weight=300 ;;
                *medium*)                  weight=500 ;;
                *semibold*|*demibold*)     weight=600 ;;
                *extrabold*|*ultrabold*)   weight=800 ;;
                *black*|*heavy*)           weight=900 ;;
                *bold*)                    weight=700 ;;
            esac

            style=normal
            case "$lc" in *italic*|*oblique*) style=italic ;; esac

            ext="${lc##*.}"
            case "$ext" in
                woff2) fmt=woff2;    mime="font/woff2" ;;
                woff)  fmt=woff;     mime="font/woff" ;;
                ttf)   fmt=truetype; mime="font/ttf" ;;
                otf)   fmt=opentype; mime="font/otf" ;;
                *) continue ;;
            esac

            b64=$(base64 < "$f" | tr -d '\n')
            faces_js+="{w:\"${weight}\",s:\"${style}\",d:\"${b64}\"},"
            embedded=$((embedded + 1))
        done
        shopt -u nullglob nocaseglob
    fi

    # No files to embed: register the alias from an installed font of that name.
    if [ "$embedded" -eq 0 ]; then
        faces_js+="{w:\"100 900\",s:\"normal\",l:\"local('${family}')\"},"
    fi

    # The payload never writes inside rich text editors, so the prompt box gets
    # the font from CSS. ".ProseMirror" is the editor Claude uses for it.
    face_css+=".ProseMirror{font-family:'${RTL_FONT_ALIAS}',var(--font-anthropic-sans,system-ui),sans-serif!important}"

    {
        printf '\n// --- CLAUDE RTL FONT START ---\n'
        # The faces are registered with the FontFace API from the font's
        # bytes, not with an @font-face rule: Claude's CSP has no "data:" in
        # font-src, so a data: URI in CSS is refused, while a font built from
        # bytes already in memory is not a fetch and is not subject to it.
        printf ';(function(){if(typeof document==="undefined"||typeof window==="undefined"||typeof FontFace==="undefined"||!document.fonts)return;var N="%s",R="%s",F=[%s];function bytes(b){var s=atob(b),n=s.length,a=new Uint8Array(n);for(var i=0;i<n;i++)a[i]=s.charCodeAt(i);return a.buffer;}var ok=0;for(var i=0;i<F.length;i++){try{var f=new FontFace(N,F[i].l||bytes(F[i].d),{weight:F[i].w,style:F[i].s,unicodeRange:R,display:"swap"});document.fonts.add(f);f.load().catch(function(e){console.error("[Claude RTL] font",e);});ok++;}catch(e){console.error("[Claude RTL] font",e);}}if(!ok)return;window.__claudeRtlFont=N;function add(){if(document.getElementById("claude-rtl-font"))return;if(!document.head&&!document.documentElement)return;var s=document.createElement("style");s.id="claude-rtl-font";s.textContent="%s";(document.head||document.documentElement).appendChild(s);}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",add);}else{add();}})();\n' "$RTL_FONT_ALIAS" "$RTL_UNICODE_RANGE" "$faces_js" "$face_css"
        printf '// --- CLAUDE RTL FONT END ---\n'
    } >> "$header"

    if [ "$embedded" -gt 0 ]; then
        success "RTL font: \"$family\" — embedded $embedded file(s) from fonts/."
    else
        warn "RTL font: \"$family\" — no files in fonts/, relying on an installed font of that name."
    fi
}

# ---------------------------------------------------------------------------
# Entitlements
# ---------------------------------------------------------------------------
# Writes the entitlements for re-signing one bundle to $2: those of the same
# bundle in the original app ($1), without the three keys that name Anthropic's
# team (macOS rejects them under an ad-hoc signature), plus
# disable-library-validation (see the re-signing step). Returns 1 when the
# original's entitlements could not be read; $2 then holds only the exception.
write_entitlements() {
    local src="$1" out="$2" status=0
    if ! codesign -d --entitlements :- "$src" > "$out" 2>/dev/null || [ ! -s "$out" ] \
        || ! /usr/libexec/PlistBuddy -c "Print" "$out" >/dev/null 2>&1; then
        printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' \
            '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
            '<plist version="1.0"><dict/></plist>' > "$out"
        status=1
    fi
    /usr/libexec/PlistBuddy -c "Delete :com.apple.application-identifier" "$out" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.team-identifier" "$out" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Delete :keychain-access-groups" "$out" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Add :com.apple.security.cs.disable-library-validation bool true" "$out" 2>/dev/null \
        || /usr/libexec/PlistBuddy -c "Set :com.apple.security.cs.disable-library-validation true" "$out"
    return $status
}

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------
install_patch() {
    echo -e "\n${BOLD}${CYAN}=======================================================${NC}"
    echo -e "${BOLD}${CYAN}     Claude Desktop RTL Patcher — Install${NC}"
    echo -e "${BOLD}${CYAN}=======================================================${NC}\n"

    # --- Preflight ---
    [ ! -d "$SOURCE_APP" ] && die "Claude.app not found at $SOURCE_APP. Is Claude Desktop installed?"
    [ ! -f "$PAYLOAD_FILE" ] && die "rtl-payload.js not found at $PAYLOAD_FILE. Re-clone the repository."

    check_dependencies

    verify_source_app

    quit_claude_rtl

    # --- Copy ---
    step "Creating patched copy..."
    mkdir -p "$HOME/Applications"

    if [ -d "$PATCHED_APP" ]; then
        log "Removing previous patched copy..."
        rm -rf "$PATCHED_APP"
    fi

    log "Copying Claude.app → Claude-RTL.app (this may take a moment)..."
    cp -R "$SOURCE_APP" "$PATCHED_APP"
    # Check the copy as well: it is what gets patched, and the original could
    # have been swapped between the first check and the copy.
    if ! is_genuine_claude "$PATCHED_APP"; then
        rm -rf "$PATCHED_APP"
        die "The copy of Claude.app did not pass signature verification. Nothing was installed."
    fi
    success "Created $PATCHED_APP"

    # --- Replace icon ---
    if [ -f "$ICON_FILE" ]; then
        step "Replacing app icon..."
        cp "$ICON_FILE" "$PATCHED_APP/Contents/Resources/electron.icns"
        # macOS prefers CFBundleIconName (asset catalog) over CFBundleIconFile (icns).
        # Remove CFBundleIconName so our custom .icns is used instead.
        /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$PATCHED_APP/Contents/Info.plist" 2>/dev/null || true
        success "Icon replaced with RTL-badged version."
    fi

    # --- Rename app in Dock / window title ---
    step "Renaming app to Claude-RTL..."
    # Use CFBundleDisplayName (cosmetic only) — changing CFBundleName breaks Electron's fuse lookup.
    /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Claude-RTL" "$PATCHED_APP/Contents/Info.plist" 2>/dev/null \
        || /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Claude-RTL" "$PATCHED_APP/Contents/Info.plist"
    success "App will show as \"Claude-RTL\" in Dock and Finder."

    # --- Extract ASAR ---
    TMP_DIR=$(mktemp -d)
    step "Extracting app.asar..."
    asar_cmd extract "$PATCHED_ASAR" "$TMP_DIR/app"
    success "Extracted."

    # --- Build the combined header (RTL JS + Vazirmatn @font-face) ---
    # The font's bytes are embedded in the header (base64) rather than loaded
    # from a CDN or a local file, so the patched app makes no extra request.
    HEADER_FILE="$TMP_DIR/rtl-header.js"
    cp "$PAYLOAD_FILE" "$HEADER_FILE"
    build_font_injector "$HEADER_FILE"

    # --- Inject RTL JS ---
    step "Injecting RTL code..."
    BUILD_DIR="$TMP_DIR/app/.vite/build"
    if [ ! -d "$BUILD_DIR" ]; then
        die ".vite/build/ not found in extracted ASAR. Claude Desktop may have changed its internal structure."
    fi

    # Detect Electron's main-process entry from package.json ("main" field).
    # The RTL payload is a renderer-side script: prepending it to the main
    # process file causes Electron to fail to spawn any BrowserWindow at
    # startup (black screen / silent crash). As of Claude Desktop 1.9255.2
    # the entry is ".vite/build/index.pre.js"; reading it from package.json
    # keeps the patcher forward-compatible if Anthropic renames it.
    # node is guaranteed to be present here — check_dependencies requires npx,
    # which only ships with node.
    MAIN_BASENAME=""
    if [ -f "$TMP_DIR/app/package.json" ]; then
        MAIN_ENTRY=$(node -p "require('$TMP_DIR/app/package.json').main || ''" 2>/dev/null || echo "")
        if [ -z "$MAIN_ENTRY" ]; then
            die "Could not read \"main\" field from $TMP_DIR/app/package.json. Claude Desktop's package layout may have changed."
        fi
        MAIN_BASENAME=$(basename "$MAIN_ENTRY")
    fi

    # Inject only into the files the app loads into its windows. The main
    # process names each of them by its ".vite/build/<name>.js" path (the
    # preload script of a window or view), so that string is how they are
    # found. Everything else in .vite/build/ is main-process or worker code
    # where the payload has nothing to do; leaving those files untouched keeps
    # the change to the app as small as it can be.
    INJECTED=0
    SKIPPED=0
    while IFS= read -r target; do
        [ -n "$target" ] || continue
        js_file="$BUILD_DIR/$target"
        [ -f "$js_file" ] || continue

        # Skip Electron main-process entry — injecting there crashes startup.
        if [ -n "$MAIN_BASENAME" ] && [ "$target" = "$MAIN_BASENAME" ]; then
            log "Skipping $target (Electron main process)"
            SKIPPED=$((SKIPPED + 1))
            continue
        fi

        # Main-process bundles are all named index*.js. None is a window
        # script, whatever path strings the build mentions.
        case "$target" in
            index.js|index.*.js) continue ;;
        esac

        # Skip already-patched files (idempotent)
        if grep -q "CLAUDE RTL PATCH START" "$js_file" 2>/dev/null; then
            SKIPPED=$((SKIPPED + 1))
            continue
        fi

        # Prepend the combined header (RTL payload + font) to the file. A
        # file that opens with a "use strict" directive must still open with
        # it, or the app's own code in that file would stop running in strict
        # mode.
        if [ "$(head -c 13 "$js_file")" = '"use strict";' ]; then
            { printf '"use strict";\n'; cat "$HEADER_FILE" "$js_file"; } > "$TMP_DIR/merged.js"
        else
            cat "$HEADER_FILE" "$js_file" > "$TMP_DIR/merged.js"
        fi
        mv "$TMP_DIR/merged.js" "$js_file"
        INJECTED=$((INJECTED + 1))
        log "Injected into: $target"
    done < <(grep -ohE '\.vite/build/[A-Za-z0-9_.-]+\.js' "$BUILD_DIR"/*.js 2>/dev/null | sed 's|.*/||' | sort -u)

    if [ "$INJECTED" -eq 0 ] && [ "$SKIPPED" -eq 0 ]; then
        die "No window scripts found in .vite/build/. Claude Desktop structure may have changed."
    fi
    if [ "$INJECTED" -eq 0 ]; then
        die "Found no window script to inject into (only the main process entry). Claude Desktop structure may have changed."
    fi

    [ "$INJECTED" -gt 0 ] && success "Injected RTL JS into $INJECTED file(s)."
    [ "$SKIPPED" -gt 0 ] && log "Skipped $SKIPPED already-patched file(s)."

    # --- Repack ASAR ---
    step "Repacking app.asar..."
    asar_cmd pack "$TMP_DIR/app" "$TMP_DIR/app.asar.new"
    cp "$TMP_DIR/app.asar.new" "$PATCHED_ASAR"
    success "Repacked."

    # --- Disable ASAR integrity fuse ---
    step "Disabling ASAR integrity validation..."
    log "Electron embeds a fuse that validates the ASAR archive hash at startup."
    log "Since we modified the archive, this fuse must be disabled or the app will crash."
    fuses_cmd write --app "$PATCHED_APP" EnableEmbeddedAsarIntegrityValidation=off 2>&1 | while IFS= read -r line; do
        log "$line"
    done
    success "ASAR integrity fuse disabled."

    # --- Re-sign ---
    step "Re-signing with ad-hoc signature..."
    log "The original code signature is invalidated by our changes."
    log "An ad-hoc signature allows macOS to run the modified app."

    # Preserve entitlements from the original. Without these, features that
    # check for entitlements at runtime fail — notably Cowork, which calls
    # @ant/claude-swift's VM check and shows "installation appears to be
    # corrupted" when com.apple.security.virtualization is missing.
    #
    # The three team-id-coupled keys are stripped: they reference Anthropic's
    # team ID Q6L2SF6YDW and macOS rejects them under an ad-hoc signature.
    # Every part keeps the entitlements it has in the original, and no more:
    # the renderer and GPU helpers, which handle web content, stay limited to
    # what Anthropic gave them instead of inheriting the main app's camera,
    # microphone and automation entitlements.
    #
    # --options runtime keeps the Hardened Runtime of the original. It stops
    # other processes from injecting libraries through DYLD_* environment
    # variables and from attaching a debugger. One exception has to be granted
    # to the app and its helpers: an ad-hoc signature has no team ID, and the
    # Hardened Runtime refuses to load frameworks that are not signed by the
    # app's own team, so without disable-library-validation they cannot load
    # Electron itself.
    ENTITLEMENTS_FILE="$TMP_DIR/entitlements.plist"
    mkdir -p "$TMP_DIR"

    # 1. Everything inside the bundle, each item with its own entitlements.
    codesign --force --deep --sign - --options runtime --preserve-metadata=entitlements "$PATCHED_APP" 2>&1 | while IFS= read -r line; do
        log "$line"
    done

    # 2. The Electron helper apps.
    local helper rel
    for helper in "$PATCHED_APP/Contents/Frameworks"/*.app; do
        [ -d "$helper" ] || continue
        rel="${helper#"$PATCHED_APP"/}"
        if ! write_entitlements "$SOURCE_APP/$rel" "$ENTITLEMENTS_FILE"; then
            warn "Could not read entitlements of $(basename "$helper") — it gets none."
        fi
        codesign --force --sign - --options runtime --entitlements "$ENTITLEMENTS_FILE" "$helper" 2>&1 | while IFS= read -r line; do
            log "$line"
        done
    done

    # 3. The app itself, last, so that its seal covers the re-signed helpers.
    if ! write_entitlements "$SOURCE_APP" "$ENTITLEMENTS_FILE"; then
        warn "Could not extract entitlements from original — Cowork will not work."
    fi
    log "Preserving entitlements from original (incl. virtualization for Cowork)..."
    codesign --force --sign - --options runtime --entitlements "$ENTITLEMENTS_FILE" "$PATCHED_APP" 2>&1 | while IFS= read -r line; do
        log "$line"
    done

    codesign --verify --deep --strict "$PATCHED_APP" 2>/dev/null \
        || die "The patched app failed signature verification after re-signing."
    success "App re-signed (ad-hoc, Hardened Runtime kept)."

    # --- Cleanup temp ---
    rm -rf "$TMP_DIR" 2>/dev/null || true
    TMP_DIR=""

    # --- Launch ---
    step "Launching Claude-RTL..."
    open "$PATCHED_APP"

    echo -e "\n${BOLD}${GREEN}=======================================================${NC}"
    echo -e "${BOLD}${GREEN}     PATCH INSTALLED SUCCESSFULLY!${NC}"
    echo -e "${BOLD}${GREEN}=======================================================${NC}"
    echo ""
    echo -e "  Patched app:  ${BOLD}$PATCHED_APP${NC}"
    echo -e "  Original app: ${BOLD}$SOURCE_APP${NC} (untouched)"
    echo ""
    echo "  You can keep both apps. The original Claude.app is not modified."
    echo "  To remove the patch, run: $0 --uninstall"
    echo ""
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
uninstall_patch() {
    echo -e "\n${BOLD}${CYAN}=======================================================${NC}"
    echo -e "${BOLD}${CYAN}     Claude Desktop RTL Patcher — Uninstall${NC}"
    echo -e "${BOLD}${CYAN}=======================================================${NC}\n"

    if [ ! -d "$PATCHED_APP" ]; then
        warn "No patched app found at $PATCHED_APP. Nothing to remove."
        exit 0
    fi

    quit_claude_rtl

    step "Removing patched app..."
    rm -rf "$PATCHED_APP"
    success "Removed $PATCHED_APP"

    echo -e "\n${BOLD}${GREEN}=======================================================${NC}"
    echo -e "${BOLD}${GREEN}     UNINSTALL COMPLETED${NC}"
    echo -e "${BOLD}${GREEN}=======================================================${NC}"
    echo ""
    echo "  The original Claude.app at $SOURCE_APP was never modified."
    echo ""
}

# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
show_status() {
    echo ""
    echo -e "${BOLD}Claude Desktop RTL Patch — Status${NC}"
    echo ""

    if [ -d "$SOURCE_APP" ]; then
        local version
        version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$SOURCE_APP/Contents/Info.plist" 2>/dev/null || echo "unknown")
        success "Original Claude.app: installed (v$version)"
    else
        warn "Original Claude.app: not found"
    fi

    if [ -d "$PATCHED_APP" ]; then
        local patched_version
        patched_version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$PATCHED_APP/Contents/Info.plist" 2>/dev/null || echo "unknown")

        # Check if it's actually patched (fuse disabled)
        local fuse_status
        fuse_status=$(npx --yes "$FUSES_PKG" read --app "$PATCHED_APP" 2>/dev/null | grep "EnableEmbeddedAsarIntegrityValidation" || echo "unknown")

        if echo "$fuse_status" | grep -q "Disabled"; then
            success "Patched Claude-RTL.app: installed (v$patched_version, fuse disabled)"
        else
            warn "Patched Claude-RTL.app: found (v$patched_version) but fuse status unclear"
        fi

        # The patched copy is never auto-updated. When the original has moved
        # on, the copy is missing whatever that update fixed.
        local build patched_build
        build=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$SOURCE_APP/Contents/Info.plist" 2>/dev/null || echo "unknown")
        patched_build=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$PATCHED_APP/Contents/Info.plist" 2>/dev/null || echo "unknown")
        if [ -d "$SOURCE_APP" ] && { [ "$patched_version" != "$version" ] || [ "$patched_build" != "$build" ]; }; then
            warn "Claude-RTL (v$patched_version) is behind Claude.app (v$version) and is missing its fixes, including security fixes."
            warn "Run '$0 --install' to rebuild it from the current version."
        fi
    else
        log "Patched Claude-RTL.app: not installed"
    fi

    echo ""
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
    echo ""
    echo -e "${BOLD}Claude Desktop RTL Patcher for macOS${NC}"
    echo ""
    echo "Usage: $0 [OPTION] [--font NAME]"
    echo ""
    echo "Options:"
    echo "  --install         Install the RTL patch (creates ~/Applications/Claude-RTL.app)"
    echo "  --uninstall       Remove the patched app"
    echo "  --status          Show current patch status"
    echo "  --font NAME       Use NAME as the font for RTL (Persian/Arabic/Hebrew) letters."
    echo "                    Default: $DEFAULT_RTL_FONT. Bundled in fonts/: Vazirmatn, Parastoo."
    echo "                    --font none keeps the font Claude and the system pick."
    echo "                    Drop your own .woff2/.woff/.ttf/.otf files in fonts/ to bundle"
    echo "                    other fonts. Equivalent: RTL_FONT_FAMILY=NAME ./patch.sh --install"
    echo "  --help            Show this help message"
    echo ""
    echo "If no option is given, an interactive menu is shown."
    echo ""
}

# ---------------------------------------------------------------------------
# Interactive menu
# ---------------------------------------------------------------------------
interactive_menu() {
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}║   Claude Desktop RTL Patcher (macOS)            ║${NC}"
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "  1. Install RTL Patch"
    echo "  2. Uninstall (remove patched app)"
    echo "  3. Show Status"
    echo "  4. Exit"
    echo ""
    read -rp "Enter your choice (1-4): " choice

    case "$choice" in
        1) install_patch ;;
        2) uninstall_patch ;;
        3) show_status ;;
        4) exit 0 ;;
        *) err "Invalid choice."; exit 1 ;;
    esac
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
# Parse args. --font NAME may appear before or after the action flag and
# overrides RTL_FONT_FAMILY. Action flags are mutually exclusive.
ACTION=""
FONT_FLAG=0
while [ $# -gt 0 ]; do
    case "$1" in
        --install|--uninstall|--status)
            [ -n "$ACTION" ] && { err "Multiple action flags given: $ACTION and $1"; exit 1; }
            ACTION="$1"; shift ;;
        --help|-h)
            usage; exit 0 ;;
        --font)
            [ $# -lt 2 ] && { err "--font requires a font family name (e.g. --font Vazirmatn) or \"none\""; exit 1; }
            RTL_FONT_FAMILY="$2"; FONT_FLAG=1; shift 2 ;;
        --font=*)
            RTL_FONT_FAMILY="${1#--font=}"; FONT_FLAG=1; shift ;;
        "")
            shift ;;
        *)
            err "Unknown option: $1"; usage; exit 1 ;;
    esac
done

# "none" turns the RTL font off.
case "$RTL_FONT_FAMILY" in
    none|None|NONE) RTL_FONT_FAMILY="" ;;
esac

case "$ACTION" in
    --install)   install_patch ;;
    --uninstall) uninstall_patch ;;
    --status)    show_status ;;
    "")
        # If --font was given without an action, the user clearly wanted a
        # flag-driven invocation — don't silently drop into the menu.
        if [ "$FONT_FLAG" -eq 1 ]; then
            err "--font requires an action flag (e.g. --install --font ${RTL_FONT_FAMILY:-none})."
            exit 1
        fi
        interactive_menu ;;
esac

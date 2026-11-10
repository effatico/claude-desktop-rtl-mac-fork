#!/bin/bash
# ============================================================================
# Claude Code RTL — build and install the local VS Code extension.
#
#   ./install.sh               Package the extension and install it in VS Code
#   ./install.sh --package [F] Only build the .vsix (to F, default a temp file)
#   ./install.sh --uninstall   Restore Claude Code's files, then uninstall
#
# rtl-payload.js and fonts/ stay at the repo root; they are copied into
# media/ (gitignored) at package time.
# ============================================================================
set -euo pipefail

EXT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$EXT_DIR/.." && pwd)"
MEDIA_DIR="$EXT_DIR/media"
EXT_ID="local.claude-code-rtl"
# Pinned on purpose so a build never runs an unreviewed release. Bump deliberately.
VSCE_PKG="@vscode/vsce@3.9.2"

die() { printf '\033[0;31mError:\033[0m %s\n' "$*" >&2; exit 1; }
log() { printf '%s\n' "$*"; }

need() {
    command -v "$1" >/dev/null 2>&1 || die "$1 not found. $2"
}

sync_media() {
    [ -f "$REPO_DIR/rtl-payload.js" ] || die "rtl-payload.js not found in $REPO_DIR"
    [ -d "$REPO_DIR/fonts" ] || die "fonts/ not found in $REPO_DIR"
    rm -rf "$MEDIA_DIR"
    mkdir -p "$MEDIA_DIR/fonts"
    cp "$REPO_DIR/rtl-payload.js" "$MEDIA_DIR/"
    cp "$REPO_DIR"/fonts/* "$MEDIA_DIR/fonts/"
}

package() {
    local out="$1"
    case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
    need node "Install Node.js (https://nodejs.org)."
    need npx "npx ships with Node.js; reinstall Node.js."
    sync_media
    mkdir -p "$(dirname "$out")"
    log "Packaging with $VSCE_PKG..."
    (cd "$EXT_DIR" && npx --yes "$VSCE_PKG" package \
        --allow-missing-repository --skip-license --no-dependencies -o "$out")
    log "Built $out"
}

install() {
    need code "Install the 'code' command: VS Code > Command Palette > 'Shell Command: Install code command in PATH'."
    local tmp
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    package "$tmp/claude-code-rtl.vsix"
    code --install-extension "$tmp/claude-code-rtl.vsix" --force
    log ""
    log "Installed. Reload VS Code (Developer: Reload Window) to patch Claude Code's chat."
}

uninstall() {
    need node "Install Node.js (https://nodejs.org)."
    need code "Install the 'code' command: VS Code > Command Palette > 'Shell Command: Install code command in PATH'."
    node "$EXT_DIR/uninstall.js"
    code --uninstall-extension "$EXT_ID" || true
    log ""
    log "Removed. Reload VS Code to load Claude Code's original chat."
}

case "${1:-}" in
    "")          install ;;
    --package)   out="${2:-$(mktemp -d)/claude-code-rtl.vsix}"; package "$out" ;;
    --uninstall) uninstall ;;
    -h|--help)   sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//' ;;
    *)           die "Unknown option: $1 (use --help)" ;;
esac

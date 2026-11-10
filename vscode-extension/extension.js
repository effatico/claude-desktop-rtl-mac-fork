'use strict';
// Claude Code RTL — keeps the RTL header in Claude Code's chat webview bundle.
// The file logic is in lib/patcher.js; this file only wires it to VS Code.

const vscode = require('vscode');
const patcher = require('./lib/patcher');

let log;

function say(msg) {
    log.appendLine('[' + new Date().toISOString() + '] ' + msg);
}

function config() {
    const c = vscode.workspace.getConfiguration('claudeRtl');
    return {
        family: patcher.normalizeFamily(c.get('font', patcher.DEFAULT_RTL_FONT)),
        autoApply: c.get('autoApply', true)
    };
}

function claudeCode() {
    const ext = vscode.extensions.getExtension(patcher.CLAUDE_CODE_ID);
    if (!ext) return null;
    return {
        version: (ext.packageJSON && ext.packageJSON.version) || '?',
        path: ext.extensionPath,
        target: patcher.targetOf(ext.extensionPath)
    };
}

function header(family) {
    const assets = patcher.assetPaths(__dirname);
    return patcher.buildHeader({ payloadPath: assets.payload, fontsDir: assets.fonts, family: family });
}

// The webview reads index.js only when it is created, so a change shows up
// after a reload.
async function offerReload(text) {
    const pick = await vscode.window.showInformationMessage(text, 'Reload Window');
    if (pick === 'Reload Window') vscode.commands.executeCommand('workbench.action.reloadWindow');
}

// Make sure Claude Code's webview carries the current header.
// `manual` reports every outcome; the automatic runs only report changes.
async function ensure(manual) {
    const cc = claudeCode();
    if (!cc) {
        say('Claude Code (' + patcher.CLAUDE_CODE_ID + ') is not installed.');
        if (manual) vscode.window.showWarningMessage('Claude RTL: Claude Code is not installed.');
        return;
    }
    const cfg = config();
    try {
        const res = patcher.apply(cc.target, header(cfg.family));
        say('Claude Code ' + cc.version + ': ' + res.reason + ' (' + cc.target + ', font: ' + (cfg.family || 'none') + ')');
        if (res.changed) await offerReload('Claude RTL: RTL support was ' + res.reason + ' in Claude Code ' + cc.version + '. Reload the window to use it.');
        else if (manual) vscode.window.showInformationMessage('Claude RTL: already applied to Claude Code ' + cc.version + '.');
    } catch (e) {
        say('Apply failed: ' + e.message);
        vscode.window.showErrorMessage('Claude RTL: ' + e.message);
    }
}

async function removePatch() {
    const cc = claudeCode();
    if (!cc) { vscode.window.showWarningMessage('Claude RTL: Claude Code is not installed.'); return; }
    try {
        const res = patcher.remove(cc.target);
        say('Claude Code ' + cc.version + ': ' + res.reason + ' (' + cc.target + ')');
        if (res.changed) {
            const auto = config().autoApply ? ' Turn off "claudeRtl.autoApply" or it is applied again on the next start.' : '';
            await offerReload('Claude RTL: removed from Claude Code ' + cc.version + '.' + auto + ' Reload the window to finish.');
        } else {
            vscode.window.showInformationMessage('Claude RTL: Claude Code ' + cc.version + ' is not patched.');
        }
    } catch (e) {
        say('Remove failed: ' + e.message);
        vscode.window.showErrorMessage('Claude RTL: ' + e.message);
    }
}

function showStatus() {
    const cc = claudeCode();
    const cfg = config();
    if (!cc) {
        vscode.window.showInformationMessage('Claude RTL: Claude Code is not installed.');
        return;
    }
    const st = patcher.status(cc.target);
    let current = false;
    try { current = st.patched && st.hash === patcher.hashOf(header(cfg.family)); } catch (e) { /* bad font name */ }
    const lines = [
        'Claude Code ' + cc.version,
        'File: ' + cc.target,
        'Patched: ' + (st.patched ? (current ? 'yes' : 'yes (out of date)') : 'no') + (st.error ? ' (' + st.error + ')' : ''),
        'Backup: ' + (st.backup ? 'yes' : 'no'),
        'Font: ' + (cfg.family || 'none'),
        'Auto apply: ' + (cfg.autoApply ? 'on' : 'off')
    ];
    lines.forEach(say);
    log.show(true);
    vscode.window.showInformationMessage('Claude RTL: ' + lines.join(' | '));
}

function activate(context) {
    log = vscode.window.createOutputChannel('Claude RTL');
    context.subscriptions.push(log);

    let timer = null;
    const later = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; if (config().autoApply) ensure(false); }, 500);
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('claudeRtl.apply', () => ensure(true)),
        vscode.commands.registerCommand('claudeRtl.remove', removePatch),
        vscode.commands.registerCommand('claudeRtl.status', showStatus),
        // Claude Code updated (a new versioned folder without the patch).
        vscode.extensions.onDidChange(later),
        vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('claudeRtl')) later(); }),
        { dispose: () => { if (timer) clearTimeout(timer); } }
    );

    if (config().autoApply) ensure(false);
}

function deactivate() {}

module.exports = { activate, deactivate };

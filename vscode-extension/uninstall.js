#!/usr/bin/env node
'use strict';
// Restores Claude Code's webview bundle in every editor's extensions folder.
// VS Code runs this with plain node ("vscode:uninstall") after Claude Code RTL
// is uninstalled; install.sh --uninstall runs it too. No vscode API here.

const fs = require('fs');
const os = require('os');
const path = require('path');
const patcher = require('./lib/patcher');

function roots() {
    const home = os.homedir();
    const list = [
        path.join(home, '.vscode', 'extensions'),
        path.join(home, '.vscode-insiders', 'extensions'),
        path.join(home, '.cursor', 'extensions')
    ];
    if (process.env.VSCODE_EXTENSIONS) list.push(process.env.VSCODE_EXTENSIONS);
    return Array.from(new Set(list.map((p) => path.resolve(p))));
}

function main() {
    let restored = 0, failed = 0;
    for (const root of roots()) {
        let names;
        try { names = fs.readdirSync(root); } catch (e) { continue; }
        for (const name of names) {
            if (!name.startsWith(patcher.CLAUDE_CODE_ID + '-')) continue;
            const target = patcher.targetOf(path.join(root, name));
            const st = patcher.status(target);
            if (!st.exists || !st.patched) continue;
            try {
                const res = patcher.remove(target);
                console.log('[Claude RTL] ' + res.reason + ': ' + target);
                if (res.changed) restored++;
            } catch (e) {
                console.error('[Claude RTL] could not restore ' + target + ': ' + e.message);
                failed++;
            }
        }
    }
    console.log('[Claude RTL] restored ' + restored + ' file(s)' + (failed ? ', ' + failed + ' failed' : ''));
    process.exitCode = failed ? 1 : 0;
}

main();

<div dir="rtl">

# Claude Code فارسی در VS Code

برای استفادهٔ داخلی تیم. در Marketplace منتشر نمی‌شود.

متن فارسی و انگلیسی در گفت‌وگوی Claude Code همان جهت و فونتی را می‌گیرد که Claude-RTL در Claude Desktop دارد. پاراگراف، فهرست و جدول جهتِ زبانِ غالب را می‌گیرند. کد چپ‌به‌راست می‌ماند. حروف فارسی با وزیرمتن نمایش داده می‌شوند.

## نصب

پیش‌نیاز: Node.js و فرمان `code` در PATH (Command Palette ← `Shell Command: Install 'code' command in PATH`).

</div>

```bash
cd claude-desktop-rtl-mac/vscode-extension
./install.sh
```

<div dir="rtl">

بعد `Developer: Reload Window` را بزنید. وقتی پیام اعمال پچ آمد، یک بار دیگر **Reload Window** را بزنید.

## استفاده

- `Claude RTL: Status`: وضعیت پچ و فونت. لاگ در Output ← `Claude RTL`
- `Claude RTL: Apply patch` / `Claude RTL: Remove patch`
- تنظیم `claudeRtl.font`: `Vazirmatn` (پیش‌فرض)، `Parastoo`، نام هر فونت نصب‌شده، یا `none`

بعد از هر به‌روزرسانی Claude Code، پچ خودکار دوباره اعمال می‌شود و پیام Reload می‌آید.

## حذف

</div>

```bash
./install.sh --uninstall
```

<div dir="rtl">

## نکته‌ها

- این افزونه فایل `webview/index.js` افزونهٔ Claude Code را تغییر می‌دهد و نسخهٔ اصلی را با نام `index.js.crtl-orig` کنار آن نگه می‌دارد. Anthropic از این تغییر پشتیبانی نمی‌کند. اگر گفت‌وگو درست باز نشد، `Claude RTL: Remove patch` را اجرا کنید.
- هیچ درخواست شبکه‌ای نمی‌فرستد. فونت داخل خود فایل است.
- با Remote SSH و Dev Container آزمایش نشده است.
- آزمون: `node test/patcher.test.js` و `node test/browser.test.js`

</div>

---

# Claude Code RTL for VS Code

For internal team use. Not published to the Marketplace.

Brings Claude-RTL's direction rule and Persian font to the Claude Code chat in VS Code: paragraphs, lists and tables take the direction of their dominant language, code stays left-to-right, Persian letters use Vazirmatn.

**Install:** needs Node.js and the `code` command on PATH. Run `./install.sh` in this folder, then `Developer: Reload Window`, and reload once more when the extension says the patch was applied.

**Use:** `Claude RTL: Status`, `Claude RTL: Apply patch`, `Claude RTL: Remove patch`; setting `claudeRtl.font` (`Vazirmatn`, `Parastoo`, an installed font name, or `none`). The patch is re-applied automatically after Claude Code updates.

**Remove:** `./install.sh --uninstall`.

**Caveats:** it edits the Claude Code extension's `webview/index.js` (original kept as `index.js.crtl-orig`), which Anthropic does not support; run `Claude RTL: Remove patch` if the chat misbehaves. No network requests; the font is embedded. Not tested with remote workspaces. Tests: `node test/patcher.test.js`, `node test/browser.test.js`.

MIT ([LICENSE](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/LICENSE)); fonts under OFL ([Vazirmatn](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/fonts/OFL-Vazirmatn.txt), [Parastoo](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/fonts/OFL-Parastoo.txt)).

<div dir="rtl">

# Claude Code فارسی در VS Code

**فارسی** · [English](#english)

این افزونهٔ محلی همان قاعدهٔ جهتِ این مخزن را به گفت‌وگوی افزونهٔ [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) در VS Code می‌آورد: هر پاراگراف، فهرست و جدول جهتِ زبانی را می‌گیرد که بیشترِ آن به آن زبان نوشته شده، کد چپ‌به‌راست می‌ماند و حروف فارسی با وزیرمتن نمایش داده می‌شوند. کادر نوشتن پیام هم برای هر خط جهتِ خود همان خط را می‌گیرد.

این افزونه در Marketplace منتشر نمی‌شود و فقط از همین مخزن نصب می‌شود.

## چطور کار می‌کند

گفت‌وگوی Claude Code یک webview است که فقط اسکریپت‌های خودِ Claude Code را اجرا می‌کند و فقط از پوشهٔ خودش فایل می‌خواند. بنابراین افزونهٔ دیگری از راه API نمی‌تواند چیزی به آن اضافه کند. این افزونه فایل `webview/index.js` در پوشهٔ Claude Code را تغییر می‌دهد: کد RTL (`rtl-payload.js`) و فونت را به اول آن اضافه می‌کند و نسخهٔ اصلی را کنار آن با نام `index.js.crtl-orig` نگه می‌دارد.

## پیش‌نیازها

- VS Code نسخهٔ 1.90 یا بالاتر، با افزونهٔ Claude Code
- Node.js (برای `npx`)
- فرمان `code` در PATH (در VS Code: Command Palette ← `Shell Command: Install 'code' command in PATH`)

## نصب

</div>

```bash
cd claude-desktop-rtl-mac/vscode-extension
./install.sh
```

<div dir="rtl">

بعد VS Code را یک بار Reload کنید (`Developer: Reload Window`). افزونه در شروع کار پچ را اعمال می‌کند و پیامی با دکمهٔ **Reload Window** نشان می‌دهد؛ گفت‌وگو بعد از Reload با پچ باز می‌شود.

## فرمان‌ها

- `Claude RTL: Apply patch`: اعمال پچ (حتی وقتی اعمال خودکار خاموش است)
- `Claude RTL: Remove patch`: برگرداندن فایل اصلی Claude Code
- `Claude RTL: Status`: نسخهٔ Claude Code، مسیر فایل، وضعیت پچ و فونت. گزارش کامل در Output ← `Claude RTL`

## فونت

تنظیم `claudeRtl.font`. پیش‌فرض `Vazirmatn` است. `Parastoo` هم همراه افزونه است. نام هر فونت نصب‌شدهٔ دیگری هم کار می‌کند (مثلاً `B Nazanin`). با `none` یا مقدار خالی فونتی اضافه نمی‌شود. فونت فقط روی حروف فارسی، عربی و عبری اثر دارد و متن انگلیسی و کد فونت خودشان را نگه می‌دارند. بعد از تغییر، افزونه پچ را با فونت تازه دوباره اعمال می‌کند؛ پنجره را Reload کنید.

## به‌روزرسانی Claude Code

هر به‌روزرسانی Claude Code پوشهٔ تازه‌ای با فایل‌های دست‌نخورده نصب می‌کند و پچ از بین می‌رود. وقتی `claudeRtl.autoApply` روشن است (پیش‌فرض)، افزونه پس از به‌روزرسانی و در هر شروع VS Code پچ را دوباره اعمال می‌کند و برای Reload پیام می‌دهد.

## حذف

</div>

```bash
./install.sh --uninstall
```

<div dir="rtl">

این فرمان فایل اصلی Claude Code را در `~/.vscode/extensions`، `~/.vscode-insiders/extensions`، `~/.cursor/extensions` و `$VSCODE_EXTENSIONS` برمی‌گرداند و افزونه را حذف می‌کند. اگر افزونه را از خودِ VS Code حذف کنید، VS Code همین کار را با `uninstall.js` انجام می‌دهد. نصب دوبارهٔ Claude Code هم فایل اصلی را برمی‌گرداند.

## محدودیت‌ها و امنیت

- این افزونه **فایل‌های افزونهٔ دیگری را تغییر می‌دهد**. VS Code امضای فایل‌های webview را بررسی نمی‌کند، پس Claude Code با فایل تغییرکرده کار می‌کند، اما این تغییر از دید Anthropic پشتیبانی‌شده نیست. اگر گفت‌وگو درست باز نشد، `Claude RTL: Remove patch` را اجرا کنید.
- افزونه فقط در پوشهٔ `webview` افزونهٔ Claude Code می‌نویسد (`index.js`، نسخهٔ پشتیبان و یک فایل موقت). مسیرهای symbolic link را رد می‌کند.
- کد افزونه و کد تزریق‌شده هیچ درخواست شبکه‌ای نمی‌فرستند، `eval` ندارند و چیزی ذخیره نمی‌کنند. فونت از بایت‌های داخل خود فایل ساخته می‌شود (`FontFace`)، نه از اینترنت.
- در VS Code روی یک سرور دیگر (Remote SSH، Dev Container) آزمایش نشده است.

## آزمون

</div>

```bash
node test/patcher.test.js   # روی یک کپی موقت از پوشهٔ webview واقعی
node test/browser.test.js   # Chrome بدون رابط، با index.css واقعی Claude Code
```

<div dir="rtl">

## مجوز

MIT — فایل [LICENSE](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/LICENSE). فونت‌ها مجوز OFL دارند: [وزیرمتن](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/fonts/OFL-Vazirmatn.txt)، [پرستو](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/fonts/OFL-Parastoo.txt).

</div>

---

<a name="english"></a>

# Claude Code RTL for VS Code

[فارسی](#claude-code-فارسی-در-vs-code) · **English**

A local VS Code extension that brings this repo's direction rule to the chat of the [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) extension: each paragraph, list and table takes the direction of the language most of it is written in, code stays left-to-right, and Persian letters use Vazirmatn. Each line of the prompt box takes the direction of its own text.

It is not published to the Marketplace; install it from this repo.

## How it works

Claude Code's chat is a webview whose CSP runs only scripts carrying Claude Code's own nonce and loads files only from Claude Code's own folder, so another extension cannot add a script through the VS Code API. This extension edits `webview/index.js` in the Claude Code folder instead: it prepends the RTL code (`rtl-payload.js`) and the font injector, and keeps the original next to it as `index.js.crtl-orig`. The first line of the patched file is a marker with a SHA-256 of what was added, so a changed payload or font is detected and re-applied from the backup.

## Requirements

- VS Code 1.90 or newer, with the Claude Code extension
- Node.js (for `npx`)
- The `code` command on PATH (Command Palette → `Shell Command: Install 'code' command in PATH`)

## Install

```bash
cd claude-desktop-rtl-mac/vscode-extension
./install.sh
```

`install.sh` copies `../rtl-payload.js` and `../fonts/` into `media/`, packages the extension with a pinned `@vscode/vsce` and installs the `.vsix`. Reload VS Code once (`Developer: Reload Window`). The extension applies the patch on start and offers a **Reload Window** button; the chat opens with the patch after the reload. `./install.sh --package out.vsix` only builds the package.

For development, open `vscode-extension/` in VS Code and press F5; without `media/`, the files are read from the repo root.

## Commands

- `Claude RTL: Apply patch`: apply now, even with auto apply off
- `Claude RTL: Remove patch`: restore Claude Code's original file
- `Claude RTL: Status`: Claude Code version, file path, patched or not, font. Details go to the `Claude RTL` output channel.

## Font

Setting `claudeRtl.font`. Default `Vazirmatn`; `Parastoo` is bundled too. Any other name uses an installed font of that name (`B Nazanin`). `none` or an empty value adds no font. The font only covers Persian, Arabic and Hebrew code points; Latin text and code keep their fonts. A change re-applies the patch; reload the window.

## After Claude Code updates

Each Claude Code update installs a new versioned folder with untouched files, so the patch is gone. With `claudeRtl.autoApply` on (the default), the extension re-applies it when the update is detected and on every start, and asks for a reload.

## Uninstalling

```bash
./install.sh --uninstall
```

This restores Claude Code's original file in `~/.vscode/extensions`, `~/.vscode-insiders/extensions`, `~/.cursor/extensions` and `$VSCODE_EXTENSIONS`, then uninstalls the extension. Uninstalling from inside VS Code runs the same restore (`uninstall.js`) once VS Code has removed the extension. Reinstalling Claude Code also restores its files.

## Caveats and security

- This extension **modifies another extension's files**. VS Code does not verify webview files, so Claude Code runs with the edited bundle, but Anthropic does not support it. If the chat misbehaves, run `Claude RTL: Remove patch`.
- It writes only inside Claude Code's `webview` folder (`index.js`, its backup and a temporary file renamed over it), and refuses symbolic links there.
- Neither the extension nor the injected code makes network requests, uses `eval` or stores anything. The font is built from bytes inside the file with `FontFace`; the webview CSP has no `data:` in `font-src`, and a font made from memory is not a fetch.
- Not tested with remote workspaces (Remote SSH, Dev Containers).

## Tests

```bash
node test/patcher.test.js   # on a temporary copy of the real webview folder
node test/browser.test.js   # headless Chrome with Claude Code's real index.css
```

## License

MIT — see [LICENSE](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/LICENSE). The fonts are under the OFL: [Vazirmatn](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/fonts/OFL-Vazirmatn.txt), [Parastoo](https://github.com/effatico/claude-desktop-rtl-mac/blob/main/fonts/OFL-Parastoo.txt).

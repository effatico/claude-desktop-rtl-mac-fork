<div dir="rtl">

# Claude Desktop فارسی برای macOS

**فارسی** · [English](#english)

این پروژه متن فارسی را در [Claude Desktop](https://claude.ai/download) روی macOS درست نمایش می‌دهد: در گفت‌وگو، در Cowork و در تب Code. هر پاراگراف، فهرست و جدول جهتِ زبانی را می‌گیرد که بیشترِ آن به آن زبان نوشته شده است. کد همیشه چپ‌به‌راست می‌ماند و حروف فارسی با فونت وزیرمتن نمایش داده می‌شوند.

برنامهٔ اصلی دست نمی‌خورد. اسکریپت یک نسخهٔ جدا به نام `Claude-RTL.app` در پوشهٔ `~/Applications` می‌سازد.

> این مخزن یک فورک از [soguy/claude-desktop-rtl-mac](https://github.com/soguy/claude-desktop-rtl-mac) است که برای فارسی تنظیم شده. آن پروژه هم بر پایهٔ [claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch) از [@shraga100](https://github.com/shraga100) برای ویندوز ساخته شده بود.

## چرا لازم است

Claude Desktop خودش راست‌به‌چپ را پشتیبانی می‌کند، اما جهت هر بخش را از **اولین حرف** آن می‌گیرد. در متن فنی فارسی این قاعده زیاد خطا می‌کند:

- فهرستی که اولین موردش با یک کلمهٔ انگلیسی یا یک تکه `code` شروع شود، کلاً چپ‌به‌راست چیده می‌شود.
- جدولی که سرستون فارسی دارد ولی خانه‌هایش عدد یا اصطلاح انگلیسی است، از چپ شروع می‌شود.
- Claude فونت فارسی ندارد و متن با فونت پیش‌فرض سیستم نمایش داده می‌شود.

این پچ آن قاعده را با قاعدهٔ «زبان غالب» جایگزین می‌کند.

## چه کار می‌کند

- **متن ترکیبی**: بخشی که بیشتر کلمه‌هایش فارسی است راست‌به‌چپ می‌شود، حتی اگر با کلمهٔ انگلیسی شروع شود.
- **فهرست و جدول**: هر فهرست یا جدول یک جهت دارد. شماره‌ها و بولت‌ها یک طرف می‌مانند. جدول فارسی از لبهٔ راست شروع می‌شود و ستون ردیف سمت راست است.
- **پاسخ‌های Claude**: جهت هم‌زمان با نوشته‌شدن پاسخ به‌روز می‌شود.
- **متن رابط کاربری**: عنوان جلسه‌ها در نوار کناری، دکمه‌های گزینه و برچسب‌ها از همین قاعده پیروی می‌کنند. آیکون‌ها و چیدمان جابه‌جا نمی‌شوند.
- **کد و فرمول**: بلوک کد، diff، خروجی ابزار و فرمول ریاضی همیشه چپ‌به‌راست می‌مانند.
- **فونت فارسی**: وزیرمتن به‌صورت پیش‌فرض. فقط روی حروف فارسی و عربی اثر دارد؛ متن انگلیسی و کد فونت خودشان را نگه می‌دارند.
- **بدون تغییر در برنامهٔ اصلی**: `/Applications/Claude.app` هیچ‌وقت تغییر نمی‌کند.

| بدون پچ | با پچ |
|:---|:---|
| فهرست فارسی که با `npm install` شروع می‌شود از چپ چیده می‌شود | همان فهرست از راست چیده می‌شود و شماره‌ها سمت راست‌اند |
| جدول با سرستون «ردیف» از چپ شروع می‌شود | جدول از راست شروع می‌شود و «ردیف» ستون اول سمت راست است |
| متن فارسی با فونت سیستم | متن فارسی با وزیرمتن |

## پیش‌نیازها

- **macOS** (روی macOS 15 و macOS 26 آزمایش شده)
- **Claude Desktop** نصب‌شده در `/Applications/Claude.app`
- **Node.js نسخهٔ 22.12 یا بالاتر**، برای `npx`. نصب: از [nodejs.org](https://nodejs.org/) یا با `brew install node`

## نصب

</div>

```bash
git clone https://github.com/effatico/claude-desktop-rtl-mac.git
cd claude-desktop-rtl-mac
./patch.sh --install
```

<div dir="rtl">

نسخهٔ پچ‌شده در `~/Applications/Claude-RTL.app` ساخته و باز می‌شود. این پوشه در پوشهٔ خانگی شماست، نه `/Applications`.

اگر فایل ZIP را دانلود کرده‌اید، شاید لازم باشد اول اسکریپت را اجرایی کنید: `chmod +x patch.sh`

در اولین اجرا macOS برای دسترسی به «Claude Safe Storage» رمز می‌خواهد. دلیلش این است که امضای نسخهٔ پچ‌شده با نسخهٔ اصلی فرق دارد. اگر بعد از تأیید، پنجره خالی ماند، برنامه را ببندید و دوباره باز کنید.

## دستورها

</div>

```bash
./patch.sh --install     # نصب، یا ساخت دوباره بعد از به‌روزرسانی Claude
./patch.sh --uninstall   # حذف نسخهٔ پچ‌شده
./patch.sh --status      # وضعیت و نسخه‌ها
./patch.sh               # منوی تعاملی
./patch.sh --help        # راهنما
```

<div dir="rtl">

## فونت

پیش‌فرض [وزیرمتن](https://github.com/rastikerdar/vazirmatn) است. فونت [پرستو](https://fonts.google.com/specimen/Parastoo) هم همراه پروژه هست. هر دو مجوز OFL دارند.

</div>

```bash
./patch.sh --install                    # وزیرمتن (پیش‌فرض)
./patch.sh --install --font Parastoo    # پرستو
./patch.sh --install --font "B Nazanin" # فونتی که روی سیستم نصب است
./patch.sh --install --font none        # بدون فونت؛ همان فونت سیستم
```

<div dir="rtl">

- فونت داخل برنامهٔ پچ‌شده جاسازی می‌شود. لازم نیست روی سیستم نصب باشد و برنامه برای آن به هیچ سروری وصل نمی‌شود.
- برای فونت دلخواه، فایل‌های `.woff2`، `.woff`، `.ttf` یا `.otf` را در پوشهٔ `fonts/` بگذارید و نام خانواده را به `--font` بدهید. فایل‌ها از روی نامشان پیدا می‌شوند: `Vazirmatn-Bold.woff2` به خانوادهٔ `Vazirmatn` تعلق دارد.
- نام فایل فونت متغیر (variable) باید `Variable` یا `wght` داشته باشد تا برای همهٔ وزن‌ها ثبت شود.

## قاعدهٔ جهت

برای هر بخش، کلمه‌ها شمرده می‌شوند. کد، نشانی وب، مسیر و نام فایل شمرده نمی‌شوند.

| سهم کلمه‌های فارسی | جهت |
|:---|:---|
| ۴۰٪ یا بیشتر | راست‌به‌چپ |
| کمتر از ۳۰٪ | چپ‌به‌راست |
| بین این دو | کلمهٔ اول تعیین می‌کند |
| بدون کلمهٔ فارسی | دست نمی‌خورد |

آستانه عمداً زیر نصف است، چون جملهٔ فارسی دربارهٔ نرم‌افزار پر از اصطلاح انگلیسی است و باز هم فارسی است.

فهرست و جدول یک جهت از کل متنشان می‌گیرند. موردی که به زبان دیگر است همان طرف می‌ماند ولی از حرف اول خودش مرتب می‌شود؛ مثلاً `Node.js (v18) only.` داخل فهرست فارسی درست خوانده می‌شود. جدولی که سرستون فارسی دارد همیشه راست‌به‌چپ است.

محدودیت‌ها:

- در پیامی که خط‌به‌خط نوشته‌اید، هر خط از حرف اول خودش جهت می‌گیرد.
- پچ متن داخل کادر نوشتن پیام را بازنویسی نمی‌کند. هنگام تایپ، هر پاراگراف از حرف اولش جهت می‌گیرد (رفتار خود Claude). فونت فارسی در این کادر هم اعمال می‌شود.
- فقط ۴۰۰۰ نویسهٔ اول هر بخش برای تعیین جهت خوانده می‌شود.

## امنیت

کد تزریق‌شده ([rtl-payload.js](rtl-payload.js)) هیچ درخواست شبکه‌ای ندارد و از IPC، ذخیره‌سازی یا `eval` استفاده نمی‌کند. فقط متن را می‌خواند و جهت و فونت را تنظیم می‌کند. آن‌قدر کوتاه است که می‌توانید پیش از نصب کاملش را بخوانید.

با این حال، نسخهٔ پچ‌شده از نسخهٔ اصلی ضعیف‌تر است. این را پیش از نصب بدانید:

- **بررسی یکپارچگی ASAR ندارد.** نسخهٔ اصلی اگر `app.asar` تغییر کرده باشد اجرا نمی‌شود. نسخهٔ پچ‌شده این بررسی را ندارد. برنامه‌ای که از قبل با حساب کاربری شما اجرا می‌شود می‌تواند کد آن را عوض کند و آن کد با مجوزهایی که به Claude-RTL داده‌اید اجرا می‌شود.
- **امضای Anthropic را ندارد.** امضای آن ad-hoc است، در پوشهٔ خانگی شماست و کاربر شما می‌تواند آن را تغییر دهد.
- **کتابخانه‌ها را بدون بررسی تیم بارگذاری می‌کند.** Hardened Runtime حفظ شده و جلوی تزریق با `DYLD_*` و اتصال دیباگر را می‌گیرد. اما امضای ad-hoc تیم ندارد، پس بررسی «کتابخانه باید از همان تیم باشد» ناچار خاموش است.
- **خودش به‌روز نمی‌شود.** روی همان نسخه‌ای می‌ماند که از آن ساخته شده و اصلاحیه‌های امنیتی بعدی را نمی‌گیرد. `./patch.sh --status` اگر نسخهٔ پچ‌شده عقب باشد هشدار می‌دهد.

این موارد نتیجهٔ خودِ تغییر دادن برنامه‌اند و اسکریپت نمی‌تواند حذفشان کند. اگر برای دستگاه شما پذیرفتنی نیست، از برنامهٔ اصلی استفاده کنید.

کارهایی که اسکریپت برای کم‌کردن خطر می‌کند: امضای Developer ID برنامهٔ اصلی و نسخهٔ کپی را پیش از هر تغییری بررسی می‌کند، نسخهٔ دو ابزار npm را ثابت نگه می‌دارد، هیچ‌وقت `sudo` نمی‌خواهد، به برنامهٔ اصلی دست نمی‌زند و فقط در اسکریپت‌های پنجره‌ها تزریق می‌کند.

## بعد از به‌روزرسانی Claude

به‌روزرسانی خودکار فقط `/Applications/Claude.app` را به‌روز می‌کند. بعد از هر به‌روزرسانی دوباره اجرا کنید:

</div>

```bash
./patch.sh --install
```

<div dir="rtl">

## حذف

</div>

```bash
./patch.sh --uninstall
```

<div dir="rtl">

فقط `~/Applications/Claude-RTL.app` حذف می‌شود.

## رفع اشکال

- **متن راست‌به‌چپ نمی‌شود:** مطمئن شوید `Claude-RTL.app` را از `~/Applications` باز کرده‌اید، نه `Claude.app` اصلی را. از Claude یک فهرست فارسی بخواهید که مورد اولش با کلمهٔ انگلیسی شروع شود؛ شماره‌ها باید سمت راست باشند.
- **فونت عوض نشده:** `./patch.sh --install` را دوباره اجرا کنید و در خروجی دنبال خط `RTL font:` بگردید.
- **برنامه هنگام باز شدن بسته می‌شود:** `./patch.sh --install` را دوباره اجرا کنید. اگر درست نشد، `npx --yes @electron/fuses@2.1.3 --help` را امتحان کنید.
- **خطای «is not an intact app signed by Anthropic»:** Claude Desktop را از [claude.ai/download](https://claude.ai/download) دوباره نصب کنید.
- **هشدار Gatekeeper:** روی برنامه راست‌کلیک کنید و Open را بزنید، یا از System Settings → Privacy & Security گزینهٔ Open Anyway را انتخاب کنید.

## Claude Code در VS Code

پوشهٔ [vscode-extension/](vscode-extension/) یک افزونهٔ محلی VS Code دارد که همین قاعدهٔ جهت و فونت را به گفت‌وگوی افزونهٔ Claude Code می‌آورد. نصب با `./install.sh` در همان پوشه. این افزونه فایل `webview/index.js` افزونهٔ Claude Code را تغییر می‌دهد و بعد از هر به‌روزرسانی Claude Code آن را دوباره اعمال می‌کند. جزئیات و محدودیت‌ها در [README آن](vscode-extension/README.md).

## زبان‌های دیگر

تمرکز این فورک فارسی است و با متن فارسی و انگلیسی آزمایش شده. قاعدهٔ جهت برای عربی و عبری هم کار می‌کند. وزیرمتن و پرستو حروف عربی را دارند ولی عبری را نه؛ متن عبری با فونت سیستم نمایش داده می‌شود.

## مجوز

MIT — فایل [LICENSE](LICENSE). فونت‌ها مجوز OFL دارند: [وزیرمتن](fonts/OFL-Vazirmatn.txt)، [پرستو](fonts/OFL-Parastoo.txt).

</div>

---

<a name="english"></a>

# Claude Desktop for Persian on macOS

[فارسی](#claude-desktop-فارسی-برای-macos) · **English**

Makes Persian text render correctly in [Claude Desktop](https://claude.ai/download) on macOS: in chat, in Cowork and in the Code tab. Each paragraph, list and table takes the direction of the language most of it is written in. Code always stays left-to-right, and Persian letters use the Vazirmatn font.

The original app is not modified. The script builds a separate copy, `Claude-RTL.app`, in `~/Applications`.

> This repository is a fork of [soguy/claude-desktop-rtl-mac](https://github.com/soguy/claude-desktop-rtl-mac), tuned for Persian. That project is based on [claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch) by [@shraga100](https://github.com/shraga100) for Windows.

## Why it is needed

Claude Desktop has RTL handling of its own, but it takes the direction of a block from its **first letter**. Technical Persian text breaks that rule often:

- A list whose first item starts with an English word or a `code` span is laid out left-to-right.
- A table with Persian headers and numeric or English cells starts at the left.
- Claude has no Persian font, so the text falls back to a system font.

This patch replaces that rule with a dominant-language rule.

## What it does

- **Mixed text**: a block is RTL when most of its words are Persian, even if it starts with an English word.
- **Lists and tables**: one direction per list or table, so numbers and bullets stay on one side. A Persian table starts at the right edge, with the row-number column on the right.
- **Claude's responses**: direction is updated as a response streams in.
- **Interface text**: session titles in the sidebar, option buttons and labels follow the same rule. Icons and layout are not mirrored.
- **Code and math**: code blocks, diffs, tool output and math always stay LTR.
- **Persian font**: Vazirmatn by default. It applies to Persian and Arabic letters only; English text and code keep their own fonts.
- **Non-destructive**: `/Applications/Claude.app` is never modified.

| Without the patch | With the patch |
|:---|:---|
| A Persian list that starts with `npm install` is laid out from the left | The same list is laid out from the right, numbers on the right |
| A table with a «ردیف» header starts at the left | The table starts at the right, «ردیف» is the first column on the right |
| Persian text in a system font | Persian text in Vazirmatn |

## Requirements

- **macOS** (tested on macOS 15 Sequoia and macOS 26 Tahoe)
- **Claude Desktop** installed at `/Applications/Claude.app`
- **Node.js 22.12 or newer**, for `npx`, which runs `@electron/asar` and `@electron/fuses` (each pinned to a fixed version in `patch.sh`). Install from [nodejs.org](https://nodejs.org/) or with `brew install node`.

## Install

```bash
git clone https://github.com/effatico/claude-desktop-rtl-mac.git
cd claude-desktop-rtl-mac
./patch.sh --install
```

The patched copy is created at `~/Applications/Claude-RTL.app` (your home folder, not `/Applications/`) and launched.

If you downloaded the ZIP instead of cloning, you may need to make the script executable first: `chmod +x patch.sh`

## Usage

```bash
./patch.sh --install     # Install, or rebuild after Claude updates
./patch.sh --uninstall   # Remove the patched copy
./patch.sh --status      # Show status and versions
./patch.sh               # Interactive menu
./patch.sh --help        # Show help
```

## Font

The default is [Vazirmatn](https://github.com/rastikerdar/vazirmatn). [Parastoo](https://fonts.google.com/specimen/Parastoo) is bundled too. Both are OFL licensed.

```bash
./patch.sh --install                    # Vazirmatn (default)
./patch.sh --install --font Parastoo    # Parastoo
./patch.sh --install --font "B Nazanin" # A font installed on your system
./patch.sh --install --font none        # No font; keep the system font
```

- Bundled fonts are embedded in the patched app. They do not need to be installed, and the app makes no request to a font server.
- To use your own font, put its `.woff2`, `.woff`, `.ttf` or `.otf` files in `fonts/` and pass the family name to `--font`. Files are matched by file name: `Vazirmatn-Bold.woff2` and `Vazirmatn.ttf` belong to `Vazirmatn`. With no matching file, the installed font of that name is used.
- The name may contain letters, digits, spaces, dots, dashes and underscores.
- A variable font is one file for all weights. Put `Variable` or `wght` in its file name (`Parastoo-Variable.woff2`) so it is registered for every weight.
- The font is used for RTL letters only. English words inside a Persian sentence keep Claude's own font.

## Direction rule

For each block the patch counts words, leaving out code, URLs, paths and file names.

| Share of Persian words | Direction |
|:---|:---|
| 40% or more | right-to-left |
| Under 30% | left-to-right |
| In between | the first word decides |
| No Persian words | the block is left as Claude rendered it |

The threshold is below one half on purpose: a Persian sentence about software is full of English terms and is still Persian.

A list or a table gets one direction from all of its text. An item in the other language keeps the list's side and is ordered from its own first letter, so `Node.js (v18) only.` reads correctly inside a Persian list. A table whose header row is Persian is always RTL, so the first column sits on the right even when the cells are mostly numbers or English terms.

Known limits:

- In a message that keeps its line breaks (a multi-line message you typed), each line is ordered by its own first letter. A Persian line that starts with an English word is ordered left-to-right.
- The patch does not rewrite what you type in the prompt box. While you type, each paragraph follows its first letter, which is Claude's own behaviour. The prompt box does use the Persian font, and with it Claude's standard sans font for Latin text, whatever font you chose in Claude's settings.
- Plain text fields (search boxes, simple inputs) get a direction from the same rule as you type.
- Only the first 4,000 characters of a block are read to decide its direction.
- Text that is already on screen keeps the font stack it had. After you change Claude's font setting, reload the window to see it on that text.

## How it works

1. **Verifies** that `/Applications/Claude.app` has an intact signature from Anthropic, and stops if it does not.
2. **Copies** `/Applications/Claude.app` to `~/Applications/Claude-RTL.app` and verifies the copy.
3. **Extracts** the Electron `app.asar` archive.
4. **Prepends** the RTL JavaScript and the font to the scripts the app loads into its windows (about 15 files in `.vite/build/`). Main-process and worker code is not touched.
5. **Repacks** the archive.
6. **Disables** the `EnableEmbeddedAsarIntegrityValidation` Electron fuse. The modified archive has a different hash, and Electron would refuse to start without this step.
7. **Re-signs** the app with an ad-hoc signature, keeping the Hardened Runtime and each helper's own entitlements.

### Why a copy

- **No sudo**: `~/Applications/` is user-writable.
- **The original stays intact**: you can always go back to it.
- **Auto-updates keep working** on the original app.
- **macOS protections are respected**: `/Applications/Claude.app` is protected by App Management; modifying it would break its signature.

## Security

The injected JavaScript ([rtl-payload.js](rtl-payload.js)) makes no network requests and uses no IPC, storage or `eval`. It reads text and sets direction attributes and a font. It is short enough to read in full before you install.

Patching an app still costs some of its protection. Compared with the original Claude.app, the patched copy:

- **Has no ASAR integrity check.** The original refuses to start if `app.asar` was changed. The patched copy cannot have that check, so a program already running under your user account could change the copy's code and it would still start. That code would run with the permissions you granted Claude-RTL.
- **Is not signed by Anthropic.** It carries an ad-hoc signature, lives in your home folder and is writable by your user.
- **Loads libraries without a team check.** The Hardened Runtime is kept, which blocks library injection through `DYLD_*` environment variables and debugger attachment. An ad-hoc signature has no team, so the rule that libraries must come from the app's own team has to be switched off for the app and its helper processes. Apart from that one exception, every helper keeps exactly the entitlements it has in the original.
- **Does not update itself.** It stays on the version it was built from and misses later fixes, security fixes included. `./patch.sh --status` warns when the copy is behind the original.

These follow from modifying the app at all; the patcher cannot remove them. If that is not acceptable on your machine, use the original app.

What the patcher does to limit the risk: it checks that the source app and the copy carry an intact Developer ID signature from Anthropic before changing anything, pins the versions of the two npm tools it runs (their own dependencies are still resolved by npm at install time), never asks for `sudo`, never touches the original app, and injects into as few files as possible.

## After Claude updates

Claude's auto-updater only updates `/Applications/Claude.app`. The patched copy is a separate app and stays on its old version. After an update, rebuild it:

```bash
./patch.sh --install
```

The patched copy may show update prompts, but updates do not apply correctly to it. Always update through the original app.

## Uninstalling

```bash
./patch.sh --uninstall
```

This removes `~/Applications/Claude-RTL.app`. The original Claude.app is unaffected.

## Troubleshooting

### "Claude quit unexpectedly" on launch
The ASAR integrity fuse was not disabled. Re-run `./patch.sh --install`. If the problem persists, check that `npx` works: `npx --yes @electron/fuses@2.1.3 --help`.

### "Missing required dependencies: Node.js 22.12 or newer"
Install or update Node.js: `brew install node` or download from [nodejs.org](https://nodejs.org/).

### "... is not an intact app signed by Anthropic" or "did not pass signature verification"
The patcher only works from a genuine, unmodified Claude.app. Reinstall Claude Desktop from [claude.ai/download](https://claude.ai/download) and run the patcher again.

### Text is not right-to-left
- Make sure you are running `Claude-RTL.app` from `~/Applications/`, not the original `Claude.app`.
- Ask Claude for a Persian list whose first item starts with an English word; the numbers should sit on the right.

### The font did not change
Re-run `./patch.sh --install` and look for the `RTL font:` line in its output.

### Keychain prompt: "Claude wants to use your confidential information"
On first launch macOS asks for your password to allow access to **"Claude Safe Storage"**. Claude Desktop uses Electron's `safeStorage` API to encrypt local data such as your login session. The patched copy has a different code signature, so macOS asks again. It asks once.

### Blank window on the very first launch
After the keychain prompt you may see a blank window that never finishes loading. Quit `Claude-RTL` and reopen it. This happens only on the first launch.

### macOS Gatekeeper warning
The app is ad-hoc signed, so macOS may warn on first launch. Right-click → Open, or go to System Settings → Privacy & Security → Open Anyway.

## Claude Code in VS Code

[vscode-extension/](vscode-extension/) holds a local VS Code extension that brings the same direction rule and font to the chat of the Claude Code extension. Install it with `./install.sh` in that folder. It edits the Claude Code extension's `webview/index.js` and re-applies the change after every Claude Code update. Details and caveats are in [its README](vscode-extension/README.md).

## Other languages

This fork is focused on Persian and is tested with Persian and English text. The direction rule also works for Arabic and Hebrew. Vazirmatn and Parastoo cover Arabic letters but not Hebrew; Hebrew text uses the system font. For a Hebrew font, put one with Hebrew glyphs (Heebo, Rubik, Assistant) in `fonts/` and pass its name to `--font`.

## Project structure

```
claude-desktop-rtl-mac/
├── patch.sh          # Patcher script
├── rtl-payload.js    # Direction and font JS injected into Claude's windows
├── fonts/            # Vazirmatn and Parastoo, with their licences
├── icon.icns         # App icon with an "RTL" badge
├── vscode-extension/ # Local VS Code extension for the Claude Code chat
├── README.md
└── LICENSE
```

## Credits

- **macOS patcher this fork is based on**: [soguy/claude-desktop-rtl-mac](https://github.com/soguy/claude-desktop-rtl-mac)
- **Original RTL detection for Windows**: [@shraga100](https://github.com/shraga100) — [claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch)
- **Fonts**: [Vazirmatn](https://github.com/rastikerdar/vazirmatn) by Saber Rastikerdar, [Parastoo](https://fonts.google.com/specimen/Parastoo)

## License

MIT — see [LICENSE](LICENSE). The fonts are under the OFL: [Vazirmatn](fonts/OFL-Vazirmatn.txt), [Parastoo](fonts/OFL-Parastoo.txt).

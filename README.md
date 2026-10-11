# Roomy: Wide AI Chats — v3.0.7

One extension that gives ChatGPT and Gemini chats more room, with small tools for tables and code.
Works on `chatgpt.com`, `chat.openai.com` and `gemini.google.com`.

## Install
1. **Remove the two older extensions first** (*ChatGPT Wide View* and *Gemini-resizer*). Roomy replaces
   both, and running them together would double up the toolbars and fight over the `Alt+Shift+W` shortcut.
2. Unzip and keep the `roomy` folder somewhere permanent.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the folder.
4. Reload any open ChatGPT / Gemini tabs.

Settings start fresh (a new extension can't read the old ones' storage).

## Features
**Width** (saved separately for each site, so ChatGPT and Gemini can differ)
- Presets: Normal / Wide / Extra wide / Full width, plus a **custom width slider** (600–2400 px).
- **Keyboard shortcut** `Alt+Shift+W` cycles the presets for whichever site the current tab is on, and a
  small toast confirms the change. Change it at `chrome://extensions/shortcuts` or via the popup's *Change* link.
- The prompt box widens together with the conversation.

**Tables** (hover any table in an answer)
- **⤢ Expand**: full-screen view with a sticky header row and an optional frozen first column. Esc closes it.
- **CSV / Excel / MD**: copy the table. *Excel* is tab-separated, so it pastes cell-by-cell into Excel or
  Google Sheets whatever your regional list separator is (some locales use `;` for CSV).
- **Row highlight & stripes**: optional zebra rows and hover highlight.
- **Site logos in links**: in the Expand view, favicons/logos are shrunk to text height instead of their natural
  size, and a **Site icons** checkbox (shown only when the table has icons) hides them completely; it remembers your choice.
  Copying a table never includes icons or icon-font text such as `open_in_new`.
- **Extra table spacing** (on by default): more padding inside cells so text doesn't hug the borders, and
  space above and below the table so it doesn't touch the paragraphs around it.
- On Gemini the toolbar sits at the table's top-left (clear of Gemini's own actions on the right); on
  ChatGPT it sits top-right.

**Code**
- **Wrap long code lines** (off by default) removes horizontal scrolling in code blocks.

**Popup**: pick the site tab at the top (it opens on the site you're currently viewing). A status line shows
whether Roomy is active on the current tab and how wide answers are.

## How the width fix works
Each site has its own rules, plus a shared safety net.
- **ChatGPT**: overrides ChatGPT's width CSS variable and known `max-w-*` classes inside `<main>`.
- **Gemini**: Gemini caps its column at roughly 760px and pins response markdown (~708px) and code blocks
  (~740px) with native CSS `@scope` rules, which is why simple hacks widen your messages but leave answers
  narrow. Roomy overrides those known containers and children.
- **Both**: Roomy also measures the real layout at runtime and tags any remaining px-capped ancestor, so it
  keeps working if a site renames a class or element.

If widening stops working, open the popup and read the status line (it reports measured answer width), then
right-click an answer > Inspect and look for an ancestor with a `max-width` in pixels.

## Sticky headers
Sticky header / frozen column live in the **Expand** view on purpose: inside a chat page, tables sit in their
own horizontal scroll box, where sticky headers can't follow the page scroll.

## Adding another site
The engine is shared. A new site needs: an entry in `SITES` (`shared.js`), an adapter in `content.js`
(which elements to scan, which tables get the toolbar), a `css/<site>.css` file, and a `content_scripts`
entry plus host permission in `manifest.json`.

## Privacy
No network requests and no data collection. Settings live in `chrome.storage.sync` (synced across your Chrome
profile). A small cache key `roomy-cache` is kept in each site's localStorage only to avoid a layout flash on
load. Permissions: `storage`, plus access to chatgpt.com, chat.openai.com and gemini.google.com only. The
content script never writes HTML into the page (Gemini enforces Trusted Types); it uses safe DOM APIs only.

## Changelog
**3.0.7** — Expand view: site logos/favicons in links are capped to text height (they rendered at full size
because the site's sizing classes are stripped from the copy); new *Site icons* checkbox to hide them; copied
CSV / Excel / Markdown no longer pick up icon-font text. A link that holds only a logo gets a text label
(alt text, else the site's domain) so it never disappears when icons are hidden.

**3.0.6** — new *Extra table spacing* option (default on): roomier cell padding and vertical margin for
in-page tables on both sites. To update from 3.0.5, replace the files in your `roomy` folder, click the
reload icon on the extension card, then reload your ChatGPT / Gemini tabs.

**3.0.5** — merged *ChatGPT Wide View* 2.0.0 and *Gemini-resizer* 3.0.0 into one extension with a
per-site adapter design; per-site settings; site tabs in the popup; the shortcut now acts on the current
site; consistent table toolbar / expand view / toast across both sites.

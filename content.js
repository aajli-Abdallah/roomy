// Roomy 3.0.7 — content script (runs after shared.js)
// One engine for every supported site; only the ADAPTERS table differs per site.
(() => {
  "use strict";

  const { KEY, LABELS, normalizeAll, cssWidthFor, siteFromUrl, load } = ROOMY;

  const SITE = siteFromUrl(location.href);
  if (!SITE) return;

  /* ================================================================
   * Per-site adapters: the only site-specific knowledge in this file.
   * (Width CSS for each site lives in css/chatgpt.css and css/gemini.css.)
   * ============================================================== */
  const ADAPTERS = {
    chatgpt: {
      // Ancestor walk stops here (we never touch the app shell / sidebar).
      stop: "main",
      // Elements whose px-capped ancestors should be widened.
      scan: [
        "[data-message-author-role]",
        "main article",
        "#prompt-textarea",
        "main form textarea",
        "table:not(.roomy-table)",
      ],
      // Which tables get the hover toolbar.
      tableSel: "main table",
      // Toolbar placement: aligned to the table's right edge.
      toolbar: { align: "right", minTop: 56, hideAbove: 90 },
      // Used by the popup's live status line.
      statusSel: '[data-message-author-role="assistant"]',
    },
    gemini: {
      stop: "chat-window, main",
      scan: [
        "user-query",
        "model-response",
        "rich-textarea",
        ".ql-editor",
        "input-area-v2",
        "input-container",
        "code-block",
        "table:not(.roomy-table)",
        // Gemini pins each markdown child (~708px) with native @scope rules.
        // Scoped to the thread: .md-content also exists in canvas / side panels.
        "model-response .md-content > *",
        ".conversation-container .md-content > *",
      ],
      tableSel: "table",
      // Left-aligned: Gemini may show its own actions on the right of a table.
      toolbar: { align: "left", minTop: 64, hideAbove: 100 },
      statusSel: "model-response",
    },
  };
  const A = ADAPTERS[SITE];

  const ICONS_KEY = "roomy-expand-icons"; // remembers the "Site icons" checkbox in the expand view
  const CACHE_KEY = "roomy-cache"; // tiny localStorage copy so the first paint is already correct
  const root = document.documentElement;
  let settings = ROOMY.normalizeSite(null);

  /* ================================================================
   * 1. Apply settings
   * ============================================================== */
  function apply(next) {
    settings = next;
    root.setAttribute("data-roomy-site", SITE);
    root.setAttribute("data-roomy-mode", settings.mode);
    root.style.setProperty("--roomy-max", cssWidthFor(settings));
    root.toggleAttribute("data-roomy-zebra", settings.zebra);
    root.toggleAttribute("data-roomy-wrap", settings.wrapCode);
    root.toggleAttribute("data-roomy-space", settings.tableSpace);
    if (!settings.tableTools) hideToolbar();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch (_) {}
  }

  /* ================================================================
   * 2. Detect px-capped layout by measurement
   *    (fallback that survives the site renaming its classes/elements)
   * ============================================================== */
  const SCAN_SELECTOR = A.scan.map((s) => `${s}:not([data-roomy-seen])`).join(",");

  const checkedAt = new WeakMap(); // element -> last time its max-width was measured
  const RECHECK_MS = 3000;

  function markColumn(el) {
    const stop = el.closest(A.stop) || document.body;
    const now = Date.now();
    for (let n = el; n && n !== stop && n !== root; n = n.parentElement) {
      if (now - (checkedAt.get(n) || 0) < RECHECK_MS) continue;
      checkedAt.set(n, now);
      const mw = getComputedStyle(n).getPropertyValue("max-width") || "";
      if (mw.endsWith("px")) {
        const px = parseFloat(mw);
        if (px >= 320 && px < window.innerWidth - 32) n.setAttribute("data-roomy-col", "");
      }
    }
  }

  function scan() {
    for (const el of document.querySelectorAll(SCAN_SELECTOR)) {
      el.setAttribute("data-roomy-seen", "");
      markColumn(el);
    }
  }

  let scanTimer = 0;
  function queueScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = 0; scan(); }, 150);
  }

  /* ================================================================
   * 3. Table data helpers
   * ============================================================== */
  // Icons/logos never belong in copied data. Icon fonts (Material etc.) render a glyph from
  // ligature TEXT such as "open_in_new", so those elements must be skipped, not just images.
  const ICON_FONT_SEL =
    'mat-icon, [class*="material-symbols"], [class*="material-icons"], [class*="google-symbols"]';
  const SKIP_TEXT_SEL = `svg, img, picture, canvas, style, script, ${ICON_FONT_SEL}`;
  const BLOCK_TAG = /^(P|DIV|LI|UL|OL|BR|TR|H[1-6]|BLOCKQUOTE|PRE)$/;

  function cellText(cell) {
    let out = "";
    (function walk(node) {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) {
          out += ch.nodeValue;
        } else if (ch.nodeType === 1 && !ch.matches(SKIP_TEXT_SEL)) {
          const block = BLOCK_TAG.test(ch.tagName);
          if (block) out += " ";
          walk(ch);
          if (block) out += " ";
        }
      }
    })(cell);
    return out.replace(/\s+/g, " ").trim();
  }

  function tableToMatrix(table) {
    return [...table.rows].map((tr) => [...tr.cells].map(cellText));
  }

  const csvCell = (v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

  const FORMATS = {
    csv: {
      label: "CSV",
      title: "Copy as CSV",
      make: (m) => m.map((r) => r.map(csvCell).join(",")).join("\r\n"),
    },
    tsv: {
      label: "Excel",
      title: "Copy tab-separated: paste straight into Excel or Google Sheets",
      make: (m) => m.map((r) => r.join("\t")).join("\r\n"),
    },
    md: {
      label: "MD",
      title: "Copy as Markdown table",
      make: (m) => {
        if (!m.length) return "";
        const cols = Math.max(...m.map((r) => r.length));
        const rows = m.map((r) => r.concat(Array(cols - r.length).fill("")));
        const line = (r) => `| ${r.map((v) => v.replace(/\|/g, "\\|")).join(" | ")} |`;
        return [line(rows[0]), line(Array(cols).fill("---")), ...rows.slice(1).map(line)].join("\n");
      },
    },
  };

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (__) {
        return false;
      }
    }
  }

  async function copyAs(format, matrix, btn) {
    const ok = await copyText(FORMATS[format].make(matrix));
    const original = btn.dataset.label || btn.textContent;
    btn.dataset.label = original;
    btn.textContent = ok ? "Copied ✓" : "Copy failed";
    setTimeout(() => { btn.textContent = original; }, 1200);
  }

  // DOM helper. Text is always set via textContent (Gemini enforces Trusted Types,
  // so we never assign innerHTML in the page).
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  /* ================================================================
   * 4. Floating toolbar shown while hovering a table
   *    (a single element outside the site's own UI tree, so it never
   *    fights with re-renders while an answer is streaming)
   * ============================================================== */
  let tb = null;
  let activeTable = null;
  let hideTimer = 0;
  let rafId = 0;

  function buildToolbar() {
    tb = el("div", "roomy-tb");
    tb.hidden = true;
    tb.setAttribute("role", "toolbar");
    tb.setAttribute("aria-label", "Table tools");

    const expand = el("button", "", "⤢ Expand");
    expand.type = "button";
    expand.dataset.act = "expand";
    expand.title = "Open this table full-screen (sticky header, frozen first column)";
    tb.appendChild(expand);

    for (const [key, f] of Object.entries(FORMATS)) {
      const b = el("button", "", f.label);
      b.type = "button";
      b.dataset.act = key;
      b.title = f.title;
      tb.appendChild(b);
    }

    tb.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn || !activeTable) return;
      if (btn.dataset.act === "expand") openExpanded(activeTable);
      else copyAs(btn.dataset.act, tableToMatrix(activeTable), btn);
    });
    tb.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    tb.addEventListener("mouseleave", scheduleHide);
    document.body.appendChild(tb);
  }

  function place() {
    if (!activeTable || !tb || tb.hidden) return;
    if (!activeTable.isConnected) return hideToolbar();
    const r = activeTable.getBoundingClientRect();
    const bound = activeTable.parentElement ? activeTable.parentElement.getBoundingClientRect() : r;
    if (r.bottom < A.toolbar.hideAbove || r.top > window.innerHeight - 8) {
      tb.style.visibility = "hidden";
      return;
    }
    tb.style.visibility = "visible";
    const h = tb.offsetHeight || 28;
    const w = tb.offsetWidth || 200;
    const top = Math.max(A.toolbar.minTop, Math.min(r.top - h - 4, window.innerHeight - h - 8));
    let left;
    if (A.toolbar.align === "left") {
      left = Math.max(r.left, bound.left || r.left);
    } else {
      left = Math.min(r.right, bound.right || r.right) - w;
    }
    left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
    tb.style.top = `${top}px`;
    tb.style.left = `${left}px`;
  }

  function schedulePlace() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; place(); });
  }

  function showFor(table) {
    if (overlay || !settings.tableTools) return;
    if (!tb) buildToolbar();
    activeTable = table;
    tb.hidden = false;
    place();
  }

  function hideToolbar() {
    clearTimeout(hideTimer);
    activeTable = null;
    if (tb) tb.hidden = true;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideToolbar, 350);
  }

  document.addEventListener("mouseover", (e) => {
    if (!settings.tableTools || !(e.target instanceof Element)) return;
    const table = e.target.closest(A.tableSel);
    if (table && !table.closest(".roomy-ov")) {
      clearTimeout(hideTimer);
      showFor(table);
    } else if (!(tb && tb.contains(e.target))) {
      scheduleHide();
    }
  }, { passive: true });

  window.addEventListener("scroll", schedulePlace, { capture: true, passive: true });
  window.addEventListener("resize", schedulePlace);

  /* ================================================================
   * 5. Expanded table overlay
   *    Sticky header + optional frozen first column live here, because
   *    they need their own scroll container to work reliably.
   * ============================================================== */
  let overlay = null;
  let prevFocus = null;

  function isDarkPage() {
    const lum = (node) => {
      const m = getComputedStyle(node).backgroundColor.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a = 1] = m[1].split(",").map(parseFloat);
      if ([r, g, b].some(Number.isNaN) || a === 0) return null;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const l = lum(document.body);
    if (l !== null) return l < 0.5;
    const l2 = lum(root);
    return l2 !== null ? l2 < 0.5 : root.classList.contains("dark");
  }

  // The clone is display-only: drop classes/ids/event attributes/javascript: links.
  function sanitize(node) {
    for (const n of [node, ...node.querySelectorAll("*")]) {
      for (const a of [...n.attributes]) {
        const name = a.name.toLowerCase();
        if (
          name === "class" || name === "id" || name.startsWith("on") ||
          (name === "href" && /^\s*javascript:/i.test(a.value))
        ) {
          n.removeAttribute(a.name);
        }
      }
    }
  }

  // A link holding only a logo (no visible text) would vanish when icons are hidden, and says
  // nothing in a copy. Give it a text label: image alt, aria-label/title, else the site's domain.
  function labelLogoLinks(node) {
    for (const a of node.querySelectorAll("a")) {
      if (!a.querySelector("img, svg, picture") || cellText(a)) continue;
      const img = a.querySelector("img[alt]");
      let label = (img && img.getAttribute("alt")) || a.getAttribute("aria-label") || a.getAttribute("title") || "";
      if (!label.trim()) {
        try {
          label = new URL(a.getAttribute("href") || "", location.href).hostname.replace(/^www\./, "");
        } catch (_) {}
      }
      if (label.trim()) a.appendChild(el("span", "", label.trim()));
    }
  }

  function openExpanded(table) {
    closeExpanded();
    hideToolbar();
    prevFocus = document.activeElement;

    const clone = table.cloneNode(true);
    clone.querySelectorAll(ICON_FONT_SEL).forEach((n) => n.remove()); // must run before classes are stripped
    sanitize(clone);
    labelLogoLinks(clone);
    clone.className = "roomy-table";

    overlay = el("div", "roomy-ov" + (isDarkPage() ? " roomy-dark" : ""));
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Expanded table");

    const panel = el("div", "roomy-panel");
    const bar = el("div", "roomy-bar");
    const body = el("div", "roomy-body roomy-freeze");
    body.tabIndex = 0;
    body.appendChild(clone);

    const title = el("span", "roomy-title", "Table view");
    const meta = el("span", "roomy-meta");
    bar.append(title, meta);

    const freezeLabel = el("label", "roomy-check");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.addEventListener("change", () => body.classList.toggle("roomy-freeze", cb.checked));
    freezeLabel.append(cb, " Freeze first column");
    bar.appendChild(freezeLabel);

    // Logos/favicons are shrunk to text height by CSS; this lets you hide them completely.
    if (clone.querySelector("img, svg, picture")) {
      let showIcons = true;
      try { showIcons = localStorage.getItem(ICONS_KEY) !== "off"; } catch (_) {}
      body.classList.toggle("roomy-hide-icons", !showIcons);
      const iconsLabel = el("label", "roomy-check");
      const ic = document.createElement("input");
      ic.type = "checkbox";
      ic.checked = showIcons;
      ic.addEventListener("change", () => {
        body.classList.toggle("roomy-hide-icons", !ic.checked);
        try { localStorage.setItem(ICONS_KEY, ic.checked ? "on" : "off"); } catch (_) {}
      });
      iconsLabel.append(ic, " Site icons");
      bar.appendChild(iconsLabel);
    }

    panel.append(bar, body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Measure after attaching so innerText reflects rendered text.
    const matrix = tableToMatrix(clone);
    const cols = matrix.length ? Math.max(...matrix.map((r) => r.length)) : 0;
    meta.textContent = `${matrix.length} rows × ${cols} columns`;

    for (const [key, f] of Object.entries(FORMATS)) {
      const b = el("button", "", f.label);
      b.type = "button";
      b.title = f.title;
      b.addEventListener("click", () => copyAs(key, matrix, b));
      bar.appendChild(b);
    }
    const close = el("button", "", "✕ Close");
    close.type = "button";
    close.setAttribute("aria-label", "Close expanded table");
    close.addEventListener("click", closeExpanded);
    bar.appendChild(close);

    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeExpanded(); });
    document.addEventListener("keydown", onOverlayKey, true);
    close.focus();
  }

  function closeExpanded() {
    if (!overlay) return;
    document.removeEventListener("keydown", onOverlayKey, true);
    overlay.remove();
    overlay = null;
    if (prevFocus && prevFocus.focus) prevFocus.focus();
    prevFocus = null;
  }

  function onOverlayKey(e) {
    if (!overlay) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeExpanded();
      return;
    }
    if (e.key === "Tab") {
      const f = [...overlay.querySelectorAll('button, input, [tabindex="0"]')];
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  /* ================================================================
   * 6. Toast (feedback for the keyboard shortcut / popup changes)
   * ============================================================== */
  let toastEl = null;
  let toastTimer = 0;
  function toast(text) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = el("div", "roomy-toast");
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1200);
  }

  /* ================================================================
   * 7. Wiring
   * ============================================================== */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[KEY]) return;
    // Settings are per site: only react to this site's slice.
    const next = normalizeAll(changes[KEY].newValue)[SITE];
    const modeChanged = next.mode !== settings.mode;
    apply(next);
    if (modeChanged && document.visibilityState === "visible") {
      toast(`Chat width: ${LABELS[next.mode]}`);
    }
  });

  // Live status for the popup ("is it working, and how wide are answers?").
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "roomy:status") {
      const all = document.querySelectorAll(A.statusSel);
      const last = all[all.length - 1];
      sendResponse({
        ok: true,
        site: SITE,
        answerWidth: last ? Math.round(last.getBoundingClientRect().width) : null,
      });
    }
  });

  // Startup: apply cached settings synchronously (no flash), then the real ones.
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) apply(ROOMY.normalizeSite(JSON.parse(cached)));
  } catch (_) {}
  load((all) => apply(all[SITE]));

  function start() {
    scan();
    new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();

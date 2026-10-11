// Shared by the content script, the popup and the background worker.
// Settings are stored PER SITE, so ChatGPT and Gemini can have different widths.

const ROOMY = (() => {
  const KEY = "roomySettings";

  const SITES = {
    chatgpt: { label: "ChatGPT", url: /^https:\/\/(chatgpt\.com|chat\.openai\.com)\// },
    gemini: { label: "Gemini", url: /^https:\/\/gemini\.google\.com\// },
  };
  const SITE_IDS = Object.keys(SITES);

  const ORDER = ["normal", "wide", "extrawide", "full"]; // cycle order for the shortcut
  const MODES = [...ORDER, "custom"];
  const LABELS = {
    normal: "Normal",
    wide: "Wide",
    extrawide: "Extra wide",
    full: "Full width",
    custom: "Custom",
  };

  const CUSTOM_MIN = 600;
  const CUSTOM_MAX = 2400;
  const DEFAULTS = { mode: "wide", customPx: 1100, tableTools: true, zebra: true, wrapCode: false, tableSpace: true };

  function siteFromUrl(url) {
    for (const id of SITE_IDS) if (SITES[id].url.test(url || "")) return id;
    return null;
  }

  function normalizeSite(raw) {
    const s = { ...DEFAULTS, ...(raw && typeof raw === "object" ? raw : {}) };
    if (!MODES.includes(s.mode)) s.mode = DEFAULTS.mode;
    const px = Number(s.customPx);
    s.customPx = Number.isFinite(px)
      ? Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(px)))
      : DEFAULTS.customPx;
    s.tableTools = !!s.tableTools;
    s.zebra = !!s.zebra;
    s.wrapCode = !!s.wrapCode;
    s.tableSpace = !!s.tableSpace;
    return s;
  }

  // raw = { chatgpt: {...}, gemini: {...} }  ->  fully validated object for every site
  function normalizeAll(raw) {
    const all = {};
    for (const id of SITE_IDS) all[id] = normalizeSite(raw && raw[id]);
    return all;
  }

  // Value for the --roomy-max CSS variable. Percentages keep it safe when a
  // sidebar or side panel is open (the column can never exceed its parent).
  function cssWidthFor(s) {
    switch (s.mode) {
      case "wide":      return "min(1300px, 100%)";
      case "extrawide": return "min(1800px, 100%)";
      case "full":      return "100%";
      case "custom":    return `min(${s.customPx}px, 100%)`;
      default:          return "none";
    }
  }

  function load(cb) {
    chrome.storage.sync.get([KEY], (res) => cb(normalizeAll(res && res[KEY])));
  }

  function save(site, patch, cb) {
    load((all) => {
      all[site] = normalizeSite({ ...all[site], ...patch });
      chrome.storage.sync.set({ [KEY]: all }, cb);
    });
  }

  return {
    KEY, SITES, SITE_IDS, ORDER, LABELS, CUSTOM_MIN, CUSTOM_MAX, DEFAULTS,
    siteFromUrl, normalizeSite, normalizeAll, cssWidthFor, load, save,
  };
})();

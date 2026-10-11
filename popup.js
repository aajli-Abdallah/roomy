const $ = (sel) => document.querySelector(sel);
const siteButtons = document.querySelectorAll("button[data-site]");
const presetButtons = document.querySelectorAll("button[data-mode]");
const slider = $("#px");
const sliderOut = $("#pxOut");

slider.min = ROOMY.CUSTOM_MIN;
slider.max = ROOMY.CUSTOM_MAX;
$("#ver").textContent = "v" + chrome.runtime.getManifest().version;

let site = "chatgpt"; // the site whose settings are being edited
let activeTab = null; // the browser's current tab
let tabSite = null;   // which supported site (if any) that tab is on

function render(s) {
  presetButtons.forEach((b) => {
    const on = b.dataset.mode === s.mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  slider.value = s.customPx;
  sliderOut.textContent = `${s.customPx} px`;
  $("#sliderBox").classList.toggle("active", s.mode === "custom");
  $("#tableTools").checked = s.tableTools;
  $("#zebra").checked = s.zebra;
  $("#tableSpace").checked = s.tableSpace;
  $("#wrapCode").checked = s.wrapCode;
}

function reload() {
  ROOMY.load((all) => render(all[site]));
}

function update(patch) {
  ROOMY.save(site, patch, reload);
}

function setSite(next) {
  site = next;
  try { localStorage.setItem("roomy-popup-site", site); } catch (_) {}
  siteButtons.forEach((b) => {
    const on = b.dataset.site === site;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  $("#hint").textContent = `Settings below apply to ${ROOMY.SITES[site].label} only.`;
  reload();
  refreshStatus();
}

siteButtons.forEach((b) => b.addEventListener("click", () => setSite(b.dataset.site)));
presetButtons.forEach((b) => b.addEventListener("click", () => update({ mode: b.dataset.mode })));

// Slider: instant label, debounced save (chrome.storage.sync has a write-rate limit).
let sliderTimer = 0;
slider.addEventListener("input", () => {
  sliderOut.textContent = `${slider.value} px`;
  clearTimeout(sliderTimer);
  sliderTimer = setTimeout(() => update({ mode: "custom", customPx: Number(slider.value) }), 250);
});

$("#tableTools").addEventListener("change", (e) => update({ tableTools: e.target.checked }));
$("#zebra").addEventListener("change", (e) => update({ zebra: e.target.checked }));
$("#tableSpace").addEventListener("change", (e) => update({ tableSpace: e.target.checked }));
$("#wrapCode").addEventListener("change", (e) => update({ wrapCode: e.target.checked }));

// Live status from the active tab (only when it is on the site being edited).
function refreshStatus() {
  const set = (t) => { $("#status").textContent = t; };
  if (!activeTab || !tabSite) return set("Open a ChatGPT or Gemini tab to see live status.");
  if (tabSite !== site) {
    return set(`Live status is shown for the ${ROOMY.SITES[tabSite].label} tab you have open.`);
  }
  chrome.tabs.sendMessage(activeTab.id, { type: "roomy:status" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      return set(`Reload this ${ROOMY.SITES[site].label} tab to activate the extension.`);
    }
    set(res.answerWidth
      ? `Active · answers are ${res.answerWidth}px wide`
      : "Active · open a conversation to measure.");
  });
}

// Show the real shortcut (it may have been changed or be unassigned).
chrome.commands.getAll((cmds) => {
  const c = (cmds || []).find((x) => x.name === "cycle-width");
  const target = $("#shortcut");
  target.textContent = "";
  if (c && c.shortcut) {
    c.shortcut.split("+").forEach((k, i) => {
      if (i) target.append("+");
      const kbd = document.createElement("kbd");
      kbd.textContent = k;
      target.append(kbd);
    });
  } else {
    const em = document.createElement("em");
    em.textContent = "(not set)";
    target.append(em);
  }
});
$("#keys").addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

// Start on the site of the current tab; otherwise the last one edited.
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  activeTab = tabs && tabs[0];
  tabSite = activeTab ? ROOMY.siteFromUrl(activeTab.url || "") : null;
  let saved = null;
  try { saved = localStorage.getItem("roomy-popup-site"); } catch (_) {}
  setSite(tabSite || (ROOMY.SITE_IDS.includes(saved) ? saved : "chatgpt"));
});

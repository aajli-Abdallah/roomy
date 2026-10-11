importScripts("shared.js");

// Alt+Shift+W (changeable at chrome://extensions/shortcuts) cycles the width
// for whichever supported site the active tab is on. Elsewhere it does nothing.
chrome.commands.onCommand.addListener((command) => {
  if (command !== "cycle-width") return;
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    const site = tab && ROOMY.siteFromUrl(tab.url || "");
    if (!site) return;
    ROOMY.load((all) => {
      const i = ROOMY.ORDER.indexOf(all[site].mode);
      // From "custom" (not part of the cycle) jump to Wide.
      const next = i === -1 ? "wide" : ROOMY.ORDER[(i + 1) % ROOMY.ORDER.length];
      ROOMY.save(site, { mode: next });
    });
  });
});

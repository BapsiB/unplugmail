/* Local storage for the account list and settings. Prototype: plain browser.storage.local.
   The real add-on encrypts this (see the technical document). */
"use strict";

var Store = (() => {
  const api = (typeof messenger !== "undefined" ? messenger : browser);
  async function load() {
    const d = await api.storage.local.get(["accounts", "settings"]);
    return { accounts: d.accounts || {}, settings: d.settings || {} };
  }
  async function saveAccounts(accounts) { await api.storage.local.set({ accounts }); }
  async function saveSettings(settings) { await api.storage.local.set({ settings }); }
  async function update(domain, patch) {
    const { accounts } = await load();
    if (!accounts[domain]) return null;
    Object.assign(accounts[domain], patch);
    await saveAccounts(accounts);
    return accounts[domain];
  }
  async function clear() { await api.storage.local.remove(["accounts", "settings"]); }
  return { load, saveAccounts, saveSettings, update, clear };
})();

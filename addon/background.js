/* Background: opens the Adressumzug tab, and watches new mail for
   (1) "your email was changed" confirmations and (2) mail still sent to the old address. */
"use strict";

const PAGE = "page/index.html";

messenger.browserAction.onClicked.addListener(async () => {
  const url = messenger.runtime.getURL(PAGE);
  const tabs = await messenger.tabs.query({});
  const open = tabs.find(t => t.url && t.url.startsWith(url));
  if (open) await messenger.tabs.update(open.id, { active: true });
  else await messenger.tabs.create({ url });
});

messenger.messages.onNewMailReceived.addListener(async (folder, messageList) => {
  try {
    const { accounts, settings } = await Store.load();
    if (!settings.scannedAt) return; // nothing to watch before the first scan
    const oldAddr = (settings.oldAddress || "").toLowerCase();
    let changed = false;
    let page = messageList;
    while (page) {
      for (const m of page.messages) {
        const domain = Rules.domainOf(m.author);
        if (!domain || Rules.PERSONAL.has(domain)) continue;
        const acc = accounts[domain];

        // 1. Confirmation tracking: the site says the email was changed.
        if (acc && (acc.status === "waiting" || acc.status === "move") && Rules.CHANGED.test(m.subject || "")) {
          acc.status = "done";
          acc.doneAt = new Date().toISOString();
          acc.doneBy = "confirmation mail: " + (m.subject || "").slice(0, 80);
          changed = true;
          continue;
        }

        // 2. Late-mail watch: mail that still reaches the old address.
        const toOld = oldAddr && (m.recipients || []).concat(m.ccList || []).some(r => Rules.addressOf(r) === oldAddr);
        if (toOld && settings.lateWatch) {
          if (!acc) {
            accounts[domain] = newAccount(domain, m, "late");
            changed = true;
          } else if (acc.status === "done") {
            acc.lateMail = (acc.lateMail || 0) + 1;
            acc.lastLate = m.date ? new Date(m.date).toISOString() : new Date().toISOString();
            changed = true;
          }
        }
      }
      page = page.id ? await messenger.messages.continueList(page.id) : null;
    }
    if (changed) {
      await Store.saveAccounts(accounts);
      messenger.runtime.sendMessage({ type: "accounts-changed" }).catch(() => {});
    }
  } catch (e) {
    console.error("Adressumzug watch failed", e);
  }
});

function newAccount(domain, m, origin) {
  return {
    domain,
    name: Rules.nameOf(m.author) || domain,
    login: "unknown",
    plan: "move",
    status: "move",
    cat: "other",
    signals: { late: 1 },
    firstSeen: m.date ? new Date(m.date).toISOString() : null,
    lastSeen: m.date ? new Date(m.date).toISOString() : null,
    examples: [(m.subject || "").slice(0, 100)],
    origin
  };
}

/* Adressumzug page. Four steps, each one screen:
   1 Find accounts (scan) · 2 Google sign-ins · 3 Update accounts (next task, list, account card) · 4 Keep or remove Gmail.
   Extension pages forbid inline handlers, so every button uses data-act and one click listener. */
"use strict";

const STEPS = [
  { id: "scan", title: "Find accounts" },
  { id: "google", title: "Google sign-ins" },
  { id: "update", title: "Update accounts" },
  { id: "finish", title: "Keep or remove Gmail" }
];
// Status keys are shared with background.js; only the words shown here changed.
const STATUS = {
  secure: ["Fix Google login first", "g"],
  move: ["Change email", ""],
  waiting: ["Waiting for confirmation", "w"],
  done: ["Done", "ok"],
  blocked: ["Stuck: needs Gmail", "b"],
  skip: ["Leaving as is", ""]
};
const LOGIN = { google: "Sign in with Google", password: "Email and password", unknown: "Not sure" };
const PLAN = { move: "Move it to my new address", delete: "Close the account", keep: "Leave it as it is", maybe: "I don't think I have an account here" };
const RESULT = {
  kept_account: ["We tested this site: after the change it still found the same account. Do this step anyway, sites change.", "good"],
  new_account: ["We tested this site: after the change it created a NEW, empty account and the old one was out of reach. Be careful and follow the steps in order.", "bad"],
  not_tested: ["We haven't tested this site yet. Treat it as risky and follow the steps in order.", ""]
};
const ORIGIN = { late: "Still sends mail to your old address", google: "Listed in your Google connections", scan: "Found in your mail" };
const IMPORTANT = /(bank|sparkasse|volksbank|raiffeisen|comdirect|ing\.de|dkb|n26|paypal|krankenkasse|^tk\.de|aok|barmer|dak|elster|finanzamt|versicherung|allianz|huk|insurance|bund\.de|arbeitsagentur|rentenversicherung|telekom|vodafone|o2online|stadtwerke|strom|klarna)/i;

let S = { accounts: {}, settings: {} };
let DIR = [];
let view = "scan", current = null, filter = "todo";
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(t) { const e = $("toast"); e.textContent = t; e.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("on"), 2600); }
const list = () => Object.values(S.accounts);
const active = () => list().filter(a => a.plan !== "maybe");
const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
const newAddr = () => esc(S.settings.newAddress || "your new address");

/* ---------- directory ---------- */
async function loadDirectory() {
  const r = await fetch("../lib/directory.json");
  DIR = (await r.json()).entries || [];
}
function dirFor(domain) { return DIR.find(e => (e.domains || []).includes(domain)) || null; }
function changeUrl(a) {
  const d = a.dir;
  if (d && d.change_email_url) return d.change_email_url;
  if (a.domain && !a.domain.startsWith("google:")) return "https://" + a.domain + "/.well-known/change-password";
  return null;
}

/* ---------- reading the mailbox ---------- */
async function* messagesOf(accountId) {
  let page = null;
  try { page = await messenger.messages.query({ accountId }); } catch (e) { page = null; }
  if (page) {
    while (page) {
      for (const m of page.messages) yield m;
      page = page.id ? await messenger.messages.continueList(page.id) : null;
    }
    return;
  }
  // Fallback for Thunderbird versions without accountId in query: walk the folders.
  const acc = await messenger.accounts.get(accountId, true);
  const folders = [];
  (function walk(fs) { for (const f of fs || []) { if (f.type !== "junk") folders.push(f); walk(f.subFolders); } })(acc.folders);
  for (const f of folders) {
    let p = await messenger.messages.list(f);
    while (p) {
      for (const m of p.messages) yield m;
      p = p.id ? await messenger.messages.continueList(p.id) : null;
    }
  }
}
function textOf(part) {
  let out = "";
  if (part.body && /text\/plain/i.test(part.contentType || "")) out += part.body;
  else if (part.body && /text\/html/i.test(part.contentType || ""))
    out += part.body.replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"');
  for (const p of part.parts || []) out += " " + textOf(p);
  return out;
}
const norm = s => (s || "").toLowerCase().replace(/^www\./, "").replace(/\.(com|de|fr|net|org|io|co\.uk)$/, "").replace(/[^a-z0-9]/g, "");

async function scan() {
  const accountId = $("accountSel").value;
  const newAddr = $("newAddr").value.trim();
  if (!accountId) return toast("Pick the mail account you are leaving");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newAddr)) return toast("Type your new email address first");
  const acc = await messenger.accounts.get(accountId);
  const oldAddress = ((acc.identities || [])[0] || {}).email || "";
  S.settings = Object.assign(S.settings, { accountId, oldAddress, newAddress: newAddr, lateWatch: $("lateWatch").checked });
  await Store.saveSettings(S.settings);

  $("scanCard").hidden = false; $("scanBtn").disabled = true; $("scanNext").innerHTML = ""; $("scanBar").style.width = "0";
  const t0 = Date.now();
  const seen = new Set();
  const found = {};
  const bodyCheck = [], googleMails = [];
  let n = 0;
  const ownDomain = Rules.domainOf(oldAddress);
  $("scanTitle").textContent = "Reading senders and subjects…";
  for await (const m of messagesOf(accountId)) {
    n++;
    if (n % 500 === 0) { $("scanText").textContent = `${n.toLocaleString()} messages read · ${Object.keys(found).length} services so far`; await new Promise(r => setTimeout(r, 0)); }
    const key = m.headerMessageId || m.id;
    if (seen.has(key)) continue;
    seen.add(key);
    if (Rules.isGoogleAccountMail(m.author)) { if (googleMails.length < 300) googleMails.push(m.id); continue; }
    const domain = Rules.domainOf(m.author);
    if (!domain || Rules.PERSONAL.has(domain) || domain === ownDomain || domain === "google.com") continue;
    const sig = Rules.classify(m.subject);
    if (!sig) continue;
    const f = found[domain] || (found[domain] = { domain, name: Rules.nameOf(m.author) || domain, signals: {}, examples: [], firstSeen: null, lastSeen: null, ids: [] });
    f.signals[sig.kind] = (f.signals[sig.kind] || 0) + 1;
    if (f.examples.length < 3) f.examples.push(sig.label + ": " + (m.subject || "").slice(0, 90));
    const d = m.date ? new Date(m.date).toISOString() : null;
    if (d && (!f.firstSeen || d < f.firstSeen)) f.firstSeen = d;
    if (d && (!f.lastSeen || d > f.lastSeen)) f.lastSeen = d;
    if ((sig.kind === "welcome" || sig.kind === "verify") && f.ids.length < 2) { f.ids.push(m.id); if (bodyCheck.length < 400) bodyCheck.push([domain, m.id]); }
  }

  // Bodies: only welcome/verify mails and Google security mails.
  $("scanTitle").textContent = "Looking for Sign in with Google…";
  const total2 = bodyCheck.length + googleMails.length; let k = 0;
  const googleNames = [];
  for (const id of googleMails) {
    k++; $("scanBar").style.width = Math.round(k / Math.max(1, total2) * 100) + "%";
    try { const name = Rules.googleSiteFromText(textOf(await messenger.messages.getFull(id))); if (name) googleNames.push(name); } catch (e) {}
  }
  for (const [domain, id] of bodyCheck) {
    k++; $("scanBar").style.width = Math.round(k / Math.max(1, total2) * 100) + "%";
    try { if (Rules.GOOGLE_SIGNIN_HINT.test(textOf(await messenger.messages.getFull(id)))) found[domain].googleHint = true; } catch (e) {}
  }

  // Merge into stored list, keeping what the person already decided.
  for (const f of Object.values(found)) {
    const strong = Object.keys(f.signals).some(s => Rules.STRONG.has(s));
    const dir = dirFor(f.domain);
    const prev = S.accounts[f.domain];
    const a = prev || { domain: f.domain, status: "move", login: "unknown", plan: strong ? "move" : "maybe" };
    a.name = dir ? dir.name : (prev && prev.name) || f.name;
    a.signals = f.signals; a.examples = f.examples; a.firstSeen = f.firstSeen; a.lastSeen = f.lastSeen;
    a.dir = dir; a.cat = IMPORTANT.test(f.domain + " " + a.name) ? "important" : "other";
    a.origin = a.origin || "scan";
    if (f.googleHint) { a.login = "google"; a.googleEvidence = "welcome mail mentions Google sign-in"; }
    S.accounts[f.domain] = a;
  }
  const uniqueNames = [...new Set(googleNames)];
  for (const name of uniqueNames) addGoogleSite(name, "Google security mail");
  for (const a of list()) if (a.login === "google" && a.status === "move") a.status = "secure";
  S.settings.scannedAt = new Date().toISOString();
  S.settings.lastScan = { messages: n, unique: seen.size, seconds: Math.round((Date.now() - t0) / 1000), googleMails: googleMails.length, googleNames: uniqueNames };
  await Store.saveAccounts(S.accounts); await Store.saveSettings(S.settings);
  $("scanTitle").textContent = "Scan finished";
  $("scanBar").style.width = "100%";
  const accounts = active().length, maybe = list().length - accounts;
  $("scanText").textContent = `${n.toLocaleString()} messages in ${S.settings.lastScan.seconds} s. Found ${accounts} accounts, ${maybe} maybe, ${list().filter(a => a.login === "google").length} with Google sign-in.`;
  $("scanBtn").disabled = false;
  renderAll();
}

function addGoogleSite(name, evidence) {
  const n = norm(name);
  if (!n) return;
  let a = list().find(x => norm(x.name) === n || norm(x.domain) === n || norm((x.domain || "").split(".")[0]) === n);
  if (!a) {
    const key = /\./.test(name) ? Rules.baseDomain(name.toLowerCase()) : "google:" + n;
    a = S.accounts[key] = { domain: key, name, status: "secure", login: "google", plan: "move", cat: "other", signals: {}, examples: [], origin: "google", dir: dirFor(key) };
  }
  a.login = "google";
  a.plan = a.plan === "maybe" ? "move" : a.plan;
  a.googleEvidence = evidence;
  if (a.status === "move") a.status = "secure";
}

/* ---------- state helpers ---------- */
const googleUnsafe = () => active().filter(a => a.login === "google" && (a.status === "secure" || a.status === "blocked"));
const counted = () => active().filter(a => a.status !== "skip");
function stepNow() {
  if (!S.settings.scannedAt) return 0;
  if (!S.settings.googleChecked) return 1;
  if (active().some(a => ["secure", "move", "waiting"].includes(a.status))) return 2;
  return 3;
}
// One order everywhere: Google sign-in first, then important accounts, then the rest; "Skip for now" sends one to the back.
const ORDER = { secure: 0, blocked: 1, move: 2, waiting: 3, done: 4, skip: 5 };
const byPriority = (x, y) => (ORDER[x.status] - ORDER[y.status]) || ((y.cat === "important") - (x.cat === "important")) ||
  ((x.later || 0) - (y.later || 0)) || x.name.localeCompare(y.name);
function nextTask() {
  return active().filter(a => a.status === "secure" || (a.status === "move" && a.plan !== "keep")).sort(byPriority)[0];
}
function whyLine(a) {
  const bits = Object.keys(a.signals || {}).map(k => (Rules.SIGNALS.find(s => s.kind === k) || { label: k }).label);
  if (a.origin === "late" && !bits.length) bits.push(ORIGIN.late);
  if (!bits.length && a.googleEvidence) bits.push("Found in " + a.googleEvidence);
  return bits.join(" · ");
}

/* ---------- header and steps ---------- */
function renderSteps() {
  const now = stepNow(), scanned = !!S.settings.scannedAt;
  const all = counted(), done = all.filter(a => a.status === "done").length;
  const gs = active().filter(a => a.login === "google").length, unsafe = googleUnsafe().length;
  const sub = [
    scanned ? plural(active().length, "account found", "accounts found") : "Start here",
    !scanned ? "After step 1" : S.settings.googleChecked ? `✓ Checked · ${plural(gs, "site", "sites")}` : plural(gs, "site found so far", "sites found so far"),
    !scanned ? "After step 1" : `${done} of ${all.length} done`,
    !scanned ? "After step 1" : (unsafe || !S.settings.googleChecked) ? "🔒 Not safe yet" : "Ready"
  ];
  $("steps").innerHTML = STEPS.map((s, i) => {
    const cls = [i < now ? "done" : i === now ? "now" : "", view === s.id ? "on" : ""].join(" ");
    return `<button class="step ${cls}" data-act="go" data-v="${s.id}" ${i > 0 && !scanned ? "disabled" : ""}>
      <span class="num">${i < now ? "✓" : i + 1}</span>
      <span class="txt"><b>${s.title}</b><span>${sub[i]}</span></span></button>`;
  }).join("");
  const st = S.settings;
  $("moveLine").innerHTML = st.oldAddress
    ? `Moving from <b>${esc(st.oldAddress)}</b> → <b>${esc(st.newAddress)}</b>`
    : "Move your online accounts to a new email address.";
}

/* ---------- step 1 ---------- */
function renderScan() {
  const ls = S.settings.lastScan;
  if (!ls || $("scanBtn").disabled) return; // a scan is running: leave its live text alone
  $("scanCard").hidden = false;
  $("scanTitle").textContent = "Scan finished";
  $("scanBar").style.width = "100%";
  const maybe = list().length - active().length;
  $("scanText").textContent = `${ls.messages.toLocaleString()} messages read in ${ls.seconds} s. Found ${plural(active().length, "account", "accounts")}` +
    `${maybe ? ` (plus ${maybe} “not sure”: senders of only orders or invoices)` : ""}, ${active().filter(a => a.login === "google").length} with Sign in with Google.`;
  $("scanNext").innerHTML = `<div class="row" style="margin-top:12px"><button class="btn primary" data-act="go" data-v="google">Next: step 2, Google sign-ins →</button><span class="small">You can scan again any time. Your choices are kept.</span></div>`;
  $("scanBtn").textContent = "Scan again";
}

/* ---------- step 2 ---------- */
function renderGoogle() {
  const gs = active().filter(a => a.login === "google");
  const ls = S.settings.lastScan;
  $("googleFound").innerHTML =
    (ls ? `<p class="small">We read ${plural(ls.googleMails, "security mail", "security mails")} from Google and the welcome mails of the sites we found.</p>` : "") +
    (gs.length
      ? `<div class="list">${gs.map(a => rowHtml(a, a.googleEvidence ? "How we know: " + a.googleEvidence : "")).join("")}</div>`
      : `<p>None found in your mail. That's common: check Google's list below.</p>`);
  $("googleConfirm").innerHTML = S.settings.googleChecked
    ? `<div class="row" style="justify-content:space-between"><div><b>✓ You checked Google's list.</b><div class="small">${plural(gs.length, "site uses", "sites use")} Sign in with Google. They come first in step 3.</div></div>
       <div class="row"><button class="link" data-act="googleUndo">Check again</button><button class="btn primary" data-act="go" data-v="update">Go to step 3 →</button></div></div>`
    : `<h3>C. Done?</h3><p>When every site from Google's list is added above, continue. Until then we can't tell you when it's safe to remove Gmail.</p>
       <button class="btn primary" data-act="googleDone">I've added every site from Google's list. Continue →</button>`;
}

/* ---------- step 3 ---------- */
function renderUpdate() {
  const all = counted(), done = all.filter(a => a.status === "done").length;
  const waiting = all.filter(a => a.status === "waiting").length, todo = all.filter(a => a.status === "secure" || a.status === "move").length;
  $("progText").textContent = `${done} of ${plural(all.length, "account", "accounts")} done`;
  $("progSub").textContent = [todo && `${todo} still to do`, waiting && `${waiting} waiting for a confirmation mail`].filter(Boolean).join(" · ") || "Nothing left to do";
  $("progBar").style.width = (all.length ? Math.round(done / all.length * 100) : 0) + "%";
  renderNext(); renderList();
  $("updateMain").hidden = !!current; $("accountCard").hidden = !current;
  if (current) renderAccount();
}
function renderNext() {
  const el = $("nextCard");
  if (!S.settings.googleChecked) {
    el.innerHTML = `<p class="kicker">Before you start</p><h2>Finish step 2 first</h2><p class="why">Sites you open with Sign in with Google must be fixed before the others. Make sure the list is complete.</p><button class="btn primary" data-act="go" data-v="google">Go to step 2</button>`;
    return;
  }
  const a = nextTask();
  if (!a) {
    const waiting = active().filter(x => x.status === "waiting").length;
    el.innerHTML = waiting
      ? `<p class="kicker">Almost there</p><h2>Waiting for ${plural(waiting, "confirmation mail", "confirmation mails")}</h2><p class="why">Click the link in each one. They're ticked off by themselves when they arrive.</p><button class="btn" data-act="filter" data-v="waiting">Show them</button>`
      : `<p class="kicker">All accounts updated</p><h2>Nothing left to change</h2><p class="why">Last step: decide what to do with Gmail.</p><button class="btn primary" data-act="go" data-v="finish">Go to step 4 →</button>`;
    return;
  }
  const g = a.status === "secure", del = a.plan === "delete";
  const gLeft = active().filter(x => x.status === "secure").length;
  el.innerHTML = `<p class="kicker">Do this next${g ? ` · ${plural(gLeft, "Google sign-in site", "Google sign-in sites")} left` : ""}</p>
    <h2>${g ? `Make ${esc(a.name)} work without Google` : del ? `Close your ${esc(a.name)} account` : `Change your email on ${esc(a.name)}`}</h2>
    <p class="why">${g ? "You log in here with Google. If Gmail goes before this is fixed, you may lose this account."
      : a.cat === "important" ? "Important account: bills, letters and security codes from here must reach you."
      : "It still has your old address. About 2 minutes."}</p>
    <div class="row"><button class="btn primary" data-act="open" data-v="${esc(a.domain)}">Start</button><button class="btn" data-act="later" data-v="${esc(a.domain)}">Skip for now</button></div>`;
}
const FILTERS = {
  todo: ["To do", a => a.plan !== "maybe" && (a.status === "secure" || a.status === "move")],
  waiting: ["Waiting", a => a.plan !== "maybe" && a.status === "waiting"],
  blocked: ["Stuck", a => a.plan !== "maybe" && a.status === "blocked"],
  done: ["Done", a => a.plan !== "maybe" && a.status === "done"],
  skip: ["Leaving as is", a => a.plan !== "maybe" && a.status === "skip"],
  maybe: ["Not sure", a => a.plan === "maybe"],
  all: ["All", a => a.plan !== "maybe"]
};
function rowHtml(a, sub) {
  sub = sub == null ? whyLine(a) : sub;
  return `<button class="item" data-act="open" data-v="${esc(a.domain)}">
    <span class="name"><b>${esc(a.name)}</b>${a.cat === "important" ? ' <span class="badge">important</span>' : ""}${sub ? `<span class="small">${esc(sub)}</span>` : ""}</span>
    <span class="login">${a.login === "google" ? '<span class="badge g">Sign in with Google</span>' : ""}</span>
    <span class="badge ${STATUS[a.status][1]}">${STATUS[a.status][0]}</span><span class="chev">›</span></button>`;
}
function renderList() {
  const counts = Object.fromEntries(Object.entries(FILTERS).map(([k, [, f]]) => [k, list().filter(f).length]));
  $("filters").innerHTML = Object.entries(FILTERS)
    .filter(([k]) => counts[k] || k === filter || k === "all" || k === "todo")
    .map(([k, [label]]) => `<button class="chip ${filter === k ? "on" : ""}" data-act="filter" data-v="${k}">${label} <span>${counts[k]}</span></button>`).join("");
  const rows = list().filter(FILTERS[filter][1]).sort(byPriority);
  $("rows").innerHTML = rows.map(a => rowHtml(a)).join("") || `<p class="small empty">Nothing here.</p>`;
  $("filterNote").textContent = filter === "maybe"
    ? "We only found orders or invoices from these senders. You may have bought as a guest, without an account. Open one and choose “Move it” if you do have an account there."
    : "";
}

/* ---------- account card ---------- */
function stateBlock(a) {
  const g = a.login === "google", d = a.dir, gs = d && d.google_signin, url = changeUrl(a), name = esc(a.name);
  const openBtn = url ? `<button class="btn" data-act="site" data-v="${esc(url)}">Open ${name} ↗</button>` : `Open ${name} in your browser`;
  const art = a.plan === "delete" ? 17 : 16;
  const letter = `<details class="help"><summary>I can't find how to do this on the site</summary>
      <p>You can ask the company to do it for you. Under the GDPR (Art. ${art}) they must answer within a month.
      We draft the letter in a new Thunderbird message; you add the company's address and send it yourself.</p>
      <button class="btn" data-act="letter" data-v="${art}">Draft the letter</button></details>`;

  if (a.plan === "maybe") return `<div class="callout">We only found orders or invoices from ${name}. You may have bought as a guest, without an account.</div>
    <div class="row"><button class="btn primary" data-act="plan" data-v="move">I have an account here</button><button class="btn" data-act="back">No account, leave it</button></div>`;

  if (a.status === "secure") {
    const r = RESULT[(gs && gs.tested_result) || "not_tested"];
    return `<p>You log in to ${name} with the <b>Sign in with Google</b> button. Before Gmail goes, make sure you can log in another way.</p>
      <div class="callout ${r[1]}">${r[0]}</div>
      <ol class="todo">
        <li>${openBtn} and go to your account settings.</li>
        <li>Change the login email to <b>${newAddr()}</b>, or set a password.${gs ? ` <span class="small">(Password possible: ${esc(gs.password_possible)} · email changeable: ${esc(gs.email_changeable)})</span>` : ""}</li>
        <li>Log out, then log back in <b>without</b> the Google button.</li>
      </ol>
      <label class="check"><input type="checkbox" id="proof"> I logged back in without Google, and it worked</label>
      <div class="row"><button class="btn good" id="safeBtn" data-act="safe" disabled>It works without Google ✓</button>
      <button class="link" data-act="status" data-v="blocked">This site doesn't let me do this</button></div>`;
  }
  if (a.status === "move") {
    const del = a.plan === "delete";
    return `<ol class="todo">
        <li>${openBtn} and log in.</li>
        ${del ? `<li>Find “delete account” or “close account” in the settings and confirm.</li>`
              : `<li>Change the email to <b>${newAddr()}</b> and save.</li><li>The site sends a confirmation mail to the new address. Click the link in it.</li>`}
      </ol>
      <div class="row"><button class="btn primary" data-act="status" data-v="${del ? "done" : "waiting"}">${del ? "I've closed it" : "I've changed it"}</button>
      ${del ? "" : `<button class="btn" data-act="status" data-v="done">It was already done</button>`}</div>
      ${letter}`;
  }
  if (a.status === "waiting") return `<div class="callout">Waiting for ${name}'s “your email was changed” mail. When it arrives in Thunderbird, this is ticked off by itself. Remember to click the link in it.</div>
    <div class="row"><button class="btn good" data-act="status" data-v="done">I got it, mark as done</button>${url ? `<button class="btn" data-act="site" data-v="${esc(url)}">Open ${name} ↗</button>` : ""}
    <button class="link" data-act="status" data-v="move">I haven't changed it yet</button></div>`;
  if (a.status === "done") return `<div class="callout good">Done. ${a.plan === "delete" ? "Account closed." : `${name} now uses ${newAddr()}.`}${a.doneBy ? `<br><span class="small">Ticked off by a ${esc(a.doneBy)}</span>` : ""}</div>
    ${a.lateMail ? `<div class="callout">${plural(a.lateMail, "mail was", "mails were")} still sent to your old address after this. Check the email on the site again.</div>` : ""}
    <button class="link" data-act="status" data-v="${g ? "secure" : "move"}">Reopen</button>`;
  if (a.status === "blocked") return `<div class="callout bad">You can't log in to ${name} without Google. Keep your Gmail account (forwarding to your new address) so you don't lose it.</div>
    ${letter}<button class="link" data-act="status" data-v="${g ? "secure" : "move"}">Try again</button>`;
  return `<div class="callout">You chose to leave this account as it is.</div>`;
}
function renderAccount() {
  const a = S.accounts[current];
  if (!a) { current = null; return renderUpdate(); }
  const d = a.dir;
  const ev = [];
  for (const [k, v] of Object.entries(a.signals || {})) ev.push(`${(Rules.SIGNALS.find(s => s.kind === k) || { label: k }).label} × ${v}`);
  if (a.googleEvidence) ev.push("Sign in with Google: " + a.googleEvidence);
  if (a.origin === "late") ev.push(ORIGIN.late);
  if (a.origin === "google" && !a.googleEvidence) ev.push(ORIGIN.google);
  const sel = (id, opts, val) => `<select id="${id}">${Object.entries(opts).map(([k, v]) => `<option value="${k}" ${val === k ? "selected" : ""}>${v}</option>`).join("")}</select>`;
  $("accountCard").innerHTML = `<button class="link back" data-act="back">← All accounts</button>
    <div class="card">
      <div class="row" style="justify-content:space-between"><div><h2>${esc(a.name)}</h2><span class="small">${esc(a.domain.startsWith("google:") ? "" : a.domain)}</span></div>
      <span class="badge big ${STATUS[a.status][1]}">${STATUS[a.status][0]}</span></div>
      ${d && d.notes ? `<p class="tip"><b>Tip:</b> ${esc(d.notes)}</p>` : ""}
      ${stateBlock(a)}
    </div>
    <div class="card quiet">
      <div class="settings">
        <label class="field">How do you log in here?${sel("loginSel", LOGIN, a.login)}</label>
        <label class="field">What do you want to do with it?${sel("planSel", PLAN, a.plan)}</label>
      </div>
      <p class="kicker" style="margin-top:12px">Why it is on your list</p>
      <ul class="ev">${ev.map(x => `<li>${esc(x)}</li>`).join("") || "<li>Added by hand</li>"}${(a.examples || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul>
      ${!d && changeUrl(a) ? `<p class="small">This site isn't in our directory yet, so “Open” goes to its standard password settings page.</p>` : ""}
    </div>`;
}

/* ---------- step 4 ---------- */
function renderFinish() {
  const u = googleUnsafe(), el = $("finishCard"), to = esc(S.settings.newAddress);
  const forward = `<div class="card"><p class="kicker">Recommended</p><h2>Keep Gmail and forward it</h2>
    <p>Your move is complete without deleting Gmail. Forward it to <b>${to}</b> for 6 to 12 months: anything you missed still reaches you, and this add-on adds those senders to your list.</p>
    <p class="small">In Gmail: Settings › See all settings › Forwarding and POP/IMAP.</p></div>`;
  if (!S.settings.googleChecked) {
    el.innerHTML = `<div class="card"><p class="kicker">🔒 Removing Gmail is locked</p><h2>Finish step 2 first</h2><p>We can't tell which sites use Sign in with Google until you've gone through Google's list.</p><button class="btn primary" data-act="go" data-v="google">Go to step 2</button></div>` + forward;
    return;
  }
  if (!u.length) {
    el.innerHTML = forward + `<div class="card"><p class="kicker">✓ Unlocked</p><h3>You can remove Gmail safely</h3><div class="callout good">Every site you opened with Google now works without it.</div>
      <button class="btn" data-act="site" data-v="https://myaccount.google.com/">Open your Google Account ↗</button><p class="small">There: Data &amp; privacy › Delete a Google service › Gmail.</p></div>`;
    return;
  }
  const names = u.map(a => a.name);
  el.innerHTML = `<div class="card"><p class="kicker">🔒 Removing Gmail is locked</p><h2>${plural(u.length, "site still needs", "sites still need")} Google to log in</h2>
    <p>If you remove Gmail now, you may lose these accounts for good: a password reset would go to an address that no longer exists.</p>
    <div class="list">${u.map(a => rowHtml(a, "")).join("")}</div></div>` + forward +
    `<details class="help danger"><summary>I understand the risk and want to remove Gmail anyway</summary>
      <p class="small">Type the names of the accounts you are willing to lose, separated by commas: <b>${esc(names.join(", "))}</b></p>
      <input type="text" id="confirm">
      <p><button class="btn" id="anyway" data-act="site" data-v="https://myaccount.google.com/" disabled>Remove Gmail anyway ↗</button></p>
    </details>`;
}

/* ---------- navigation ---------- */
function renderAll() { renderSteps(); renderScan(); renderGoogle(); renderUpdate(); renderFinish(); }
function show(s) {
  view = s;
  document.querySelectorAll(".screen").forEach(e => e.classList.toggle("on", e.id === "s-" + s));
  renderAll();
  window.scrollTo(0, 0);
}

/* ---------- actions ---------- */
async function save() { await Store.saveAccounts(S.accounts); renderAll(); }
function letter(a, art) {
  const st = S.settings;
  const subject = art === 17 ? "Request to delete my account (Art. 17 GDPR)" : "Request to correct my email address (Art. 16 GDPR)";
  const body = art === 17
    ? `Dear Sir or Madam,\n\nunder Article 17 GDPR I ask you to delete my account and the personal data you hold about me.\n\nMy account is registered under the email address: ${st.oldAddress}\n\nPlease confirm the deletion within one month (Art. 12(3) GDPR).\n\nKind regards`
    : `Dear Sir or Madam,\n\nunder Article 16 GDPR I ask you to correct the email address stored in my account.\n\nOld address: ${st.oldAddress}\nNew address: ${st.newAddress}\n\nI could not find a way to change it in my account settings. Please make the change and confirm it within one month (Art. 12(3) GDPR). If you share my data with others, please tell them of the correction (Art. 19 GDPR).\n\nKind regards`;
  return messenger.compose.beginNew({ subject: subject + " · " + a.name, plainTextBody: body, isPlainText: true });
}
const DONE_TOAST = { waiting: "waiting for the confirmation mail", done: "done", blocked: "keep Gmail for this one", move: "back to the list", secure: "back to the list" };
document.addEventListener("click", async ev => {
  const el = ev.target.closest("[data-act]");
  if (!el || el.disabled) return;
  ev.preventDefault();
  const act = el.dataset.act, v = el.dataset.v;
  const a = current && S.accounts[current];
  if (act === "go") { current = null; show(v); }
  else if (act === "open") { current = v; show("update"); }
  else if (act === "back") { current = null; renderAll(); window.scrollTo(0, 0); }
  else if (act === "later") { const x = S.accounts[v]; x.later = Date.now(); await save(); toast(x.name + " moved to the end of the list"); }
  else if (act === "filter") { filter = v; current = null; renderUpdate(); }
  else if (act === "site") { await messenger.windows.openDefaultBrowser(v); }
  else if (act === "status") {
    a.status = v;
    if (v === "done") a.doneAt = new Date().toISOString();
    // Finished with this account: go back to the list, where the next task waits.
    if (v === "waiting" || v === "done") current = null;
    await save(); toast(a.name + ": " + DONE_TOAST[v]);
  }
  else if (act === "safe") {
    a.securedAt = new Date().toISOString(); a.status = "move";
    await save(); toast(a.name + " works without Google. Now change its email.");
  }
  else if (act === "plan") { a.plan = v; if (a.status === "skip") a.status = a.login === "google" ? "secure" : "move"; await save(); }
  else if (act === "letter") { await letter(a, Number(v)); if (a.status === "move") { a.status = "waiting"; await save(); } toast("Letter drafted in a new message window"); }
  else if (act === "googleDone") { S.settings.googleChecked = true; await Store.saveSettings(S.settings); show("update"); }
  else if (act === "googleUndo") { S.settings.googleChecked = false; await Store.saveSettings(S.settings); renderAll(); }
});
document.addEventListener("change", async ev => {
  const a = current && S.accounts[current];
  if (ev.target.id === "proof") { $("safeBtn").disabled = !ev.target.checked; return; }
  if (ev.target.id === "loginSel") { a.login = ev.target.value; if (a.login === "google" && a.status === "move") a.status = "secure"; if (a.login !== "google" && a.status === "secure") a.status = "move"; await save(); }
  if (ev.target.id === "planSel") { a.plan = ev.target.value; if (a.plan === "keep") a.status = "skip"; else if (a.status === "skip") a.status = a.login === "google" ? "secure" : "move"; await save(); }
  if (ev.target.id === "lateWatch") { S.settings.lateWatch = ev.target.checked; await Store.saveSettings(S.settings); }
});
document.addEventListener("input", ev => {
  if (ev.target.id !== "confirm") return;
  const want = googleUnsafe().map(a => a.name.toLowerCase().trim()).sort().join("|");
  const got = ev.target.value.split(",").map(s => s.toLowerCase().trim()).filter(Boolean).sort().join("|");
  $("anyway").disabled = want !== got;
});
$("scanBtn").addEventListener("click", () => scan().catch(e => { $("scanBtn").disabled = false; $("scanTitle").textContent = "Scan stopped"; $("scanText").textContent = String(e); }));
$("resetBtn").addEventListener("click", async () => {
  const b = $("resetBtn");
  if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Click again to delete your whole list. This can't be undone."; return; }
  await Store.clear(); S = { accounts: {}, settings: {} }; current = null;
  b.textContent = "Delete my list and start over"; delete b.dataset.sure;
  $("scanCard").hidden = true; $("scanBtn").textContent = "Scan my mailbox"; show("scan"); toast("List deleted");
});
$("openConnections").addEventListener("click", () => messenger.windows.openDefaultBrowser("https://myaccount.google.com/connections"));
$("addGoogle").addEventListener("click", async () => {
  const names = $("googlePaste").value.split(/\n|,/).map(s => s.trim()).filter(Boolean);
  if (!names.length) return toast("Paste at least one site name first");
  names.forEach(n => addGoogleSite(n, "your Google connections list"));
  $("googlePaste").value = ""; await save(); toast(plural(names.length, "site", "sites") + " added");
});
messenger.runtime.onMessage.addListener(async msg => { if (msg && msg.type === "accounts-changed") { S = await Store.load(); renderAll(); } });

(async function init() {
  await loadDirectory();
  S = await Store.load();
  const accts = await messenger.accounts.list();
  $("accountSel").innerHTML = accts.filter(a => a.type !== "none").map(a => {
    const mail = ((a.identities || [])[0] || {}).email || a.name;
    return `<option value="${esc(a.id)}" ${S.settings.accountId === a.id || (!S.settings.accountId && /gmail|googlemail/i.test(mail)) ? "selected" : ""}>${esc(mail)}</option>`;
  }).join("");
  if (S.settings.newAddress) $("newAddr").value = S.settings.newAddress;
  if (S.settings.lateWatch === false) $("lateWatch").checked = false;
  show(["scan", "google", "update", "update"][stepNow()]);
})();

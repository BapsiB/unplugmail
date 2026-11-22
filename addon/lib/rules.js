/* Adressumzug rules: decide from a message header whether it reveals an account.
   Shared by the background script and the page. No network, no storage. */
"use strict";

var Rules = (() => {
  // Subject rules, German and English. Stronger signals first.
  const SIGNALS = [
    { kind: "welcome", label: "Welcome mail", re: /\b(welcome|willkommen|bienvenue|thanks? for (signing up|joining|registering|creating)|danke f(ü|ue)r (deine|ihre|die) (registrierung|anmeldung)|account (created|activated|is ready)|konto (wurde )?(erstellt|er(ö|oe)ffnet|aktiviert)|registrierung (erfolgreich|abgeschlossen))\b/i },
    { kind: "verify", label: "Confirm address", re: /\b(verify|verification|confirm (your )?(e-?mail|account|address|registration)|best(ä|ae)tig(e|en|ung)|activate your account|aktivier(e|en|ung)|e-?mail-?adresse best(ä|ae)tigen)\b/i },
    { kind: "reset", label: "Password reset", re: /\b(reset (your )?password|password reset|forgot (your )?password|passwort (zur(ü|ue)cksetzen|vergessen|ge(ä|ae)ndert)|password (changed|updated)|new password)\b/i },
    { kind: "login", label: "Login alert", re: /\b(new (sign-?in|login|device)|neue anmeldung|anmeldung (von|auf) (einem )?neuen|sign-?in (attempt|alert|from)|login (alert|attempt|from)|security (alert|code)|sicherheits(warnung|hinweis|code)|verification code|best(ä|ae)tigungscode|one-time (code|password))\b/i },
    { kind: "receipt", label: "Order or invoice", re: /\b(order (confirmation|#|number|no\.?)|your order|bestellung|bestellbest(ä|ae)tigung|receipt|rechnung|invoice|quittung|your purchase|ihr einkauf|zahlungsbest(ä|ae)tigung)\b/i }
  ];
  const STRONG = new Set(["welcome", "verify", "reset", "login"]);

  // Personal mail providers: a mail from them is from a person, not a service.
  const PERSONAL = new Set([
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.de", "outlook.com", "hotmail.com", "hotmail.de", "live.com", "live.de",
    "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "web.de", "t-online.de", "icloud.com", "me.com", "mac.com", "aol.com",
    "posteo.de", "posteo.net", "mailbox.org", "proton.me", "protonmail.com", "freenet.de", "arcor.de", "tutanota.com", "tuta.io"
  ]);

  const TWO_PART_TLDS = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "co.nz", "co.jp", "com.br", "co.at", "or.at", "com.tr", "co.za", "com.mx", "co.in"]);

  function addressOf(author) {
    if (!author) return "";
    const m = author.match(/<([^>]+)>/);
    return (m ? m[1] : author).trim().toLowerCase();
  }
  function nameOf(author) {
    if (!author) return "";
    const m = author.match(/^\s*"?([^"<]+?)"?\s*</);
    return m ? m[1].trim() : "";
  }
  // Approximate registrable domain: mail.x.com -> x.com, info.amazon.co.uk -> amazon.co.uk
  function baseDomain(host) {
    host = (host || "").toLowerCase().replace(/\.$/, "");
    const parts = host.split(".");
    if (parts.length <= 2) return host;
    const last2 = parts.slice(-2).join(".");
    return TWO_PART_TLDS.has(last2) ? parts.slice(-3).join(".") : last2;
  }
  function domainOf(author) {
    const a = addressOf(author);
    const at = a.lastIndexOf("@");
    return at < 0 ? "" : baseDomain(a.slice(at + 1));
  }

  function classify(subject) {
    for (const s of SIGNALS) if (s.re.test(subject || "")) return s;
    return null;
  }

  // Google's own security mails: their body names the site that got access.
  function isGoogleAccountMail(author) {
    const a = addressOf(author);
    return /@(accounts\.)?google\.com$/.test(a) && /no-?reply|security/.test(a);
  }
  // Try to pull the site's name from the text of a Google security mail.
  const GOOGLE_NAME_PATTERNS = [
    /(?:signed in to|sign in to|signed into)\s+(.{2,60}?)\s+(?:with|using)\s+(?:your )?Google/i,
    /(?:mit Google bei|bei)\s+(.{2,60}?)\s+(?:angemeldet|anmelden)/i,
    /(.{2,60}?)\s+(?:was granted|has been granted|now has|has)\s+access to (?:some of )?your Google Account/i,
    /(?:You (?:allowed|gave|granted))\s+(.{2,60}?)\s+access to/i,
    /(.{2,60}?)\s+(?:hat (?:jetzt )?Zugriff auf|wurde Zugriff auf)\s+(?:Ihr|dein)\s+Google-Konto/i,
    /(?:Sie haben|Du hast)\s+(.{2,60}?)\s+(?:Zugriff auf|den Zugriff auf)/i
  ];
  function googleSiteFromText(text) {
    if (!text) return null;
    const flat = text.replace(/\s+/g, " ");
    for (const re of GOOGLE_NAME_PATTERNS) {
      const m = flat.match(re);
      if (m) {
        const name = m[1].replace(/^(the app|die app|app)\s+/i, "").replace(/["“”„]/g, "").trim();
        if (name.length >= 2 && name.length <= 60 && !/google/i.test(name)) return name;
      }
    }
    return null;
  }
  // A welcome/verify mail that mentions Google sign-in.
  const GOOGLE_SIGNIN_HINT = /(sign(ed|ing)? ?(in|up) with google|continue with google|mit google (an|ein)?(gemeldet|melden|registriert|fortfahren)|google[- ]konto|via google|using your google account)/i;

  // Confirmation that a site changed the address (to tick an item off).
  const CHANGED = /\b((e-?mail|address|adresse)[^.]{0,30}(changed|updated|confirmed|ge(ä|ae)ndert|aktualisiert|best(ä|ae)tigt)|confirm your new (e-?mail|address)|neue e-?mail-?adresse)\b/i;

  return { SIGNALS, STRONG, PERSONAL, addressOf, nameOf, domainOf, baseDomain, classify,
           isGoogleAccountMail, googleSiteFromText, GOOGLE_SIGNIN_HINT, CHANGED };
})();

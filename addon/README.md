# Adressumzug: Thunderbird add-on prototype

A first working version of the add-on described in the technical document. It reads your real mailbox, but only on your computer. It never logs in to sites and never sends anything by itself.

## Install it (about 2 minutes)

1. Open Thunderbird (version 115 or newer) with your Gmail account already set up.
2. Menu ☰ › **Add-ons and Themes**.
3. Click the gear icon ⚙ › **Debug Add-ons**.
4. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder (or `adressumzug-prototype.xpi`).
5. An **Adressumzug** button appears in the toolbar. Click it.

A temporary add-on is removed when Thunderbird restarts. Load it again the same way. Your list is kept.

## What works for real

| Feature | What it does |
| --- | --- |
| Mailbox scan | Reads sender, subject and date of every message in the chosen account. German and English rules spot welcome, confirm, password-reset and login-alert mails. Orders and invoices go to "Maybe". |
| Sign in with Google detection | Opens only welcome mails and Google security mails, and looks for "signed up with Google" or the site named by Google. |
| Google connections check | Step 2 opens myaccount.google.com/connections; you paste the sites listed there and they join your list. |
| Four steps | The bar at the top is the navigation: 1 Find accounts, 2 Google sign-ins, 3 Update accounts, 4 Keep or remove Gmail. Each step says what it's for and shows its progress. |
| Next task and account list | Step 3 shows one "Do this next" task (Google sign-in sites first, then important ones like bank, health, tax, then the rest) above the full list. Click any account for step-by-step instructions. |
| Google sign-in first and Gmail lock | "It works without Google" stays greyed out until you tick "I logged back in without Google". Step 4 stays locked until every Google sign-in site works without Google; to remove Gmail anyway you type the at-risk sites' names. |
| Direct links | From the sample directory (`lib/directory.json`: X, jeuxvideo.com, GitHub, Spotify), otherwise the site's standard `/.well-known/change-password` page. |
| Confirmation tracking | When a "your email was changed" mail arrives from a site on your list, the item is ticked off by itself. |
| Late-mail watch | New mail still addressed to the old Gmail address adds its sender to the list. |
| GDPR letters | Drafts an Art. 16 (correct) or Art. 17 (delete) letter in a new Thunderbird message. You add the company's address and send it yourself. |

## Not real yet

- The account list is stored unencrypted in Thunderbird's add-on storage. The real version encrypts it.
- The directory has only 4 sample entries.
- No password-manager import, no German interface, no Takeout import.
- Detection accuracy is not measured. Please note what it misses during the weekend test.

## What to write down when you try it

- Number of messages and seconds (shown after the scan, and under the checklist).
- Accounts it found that are real, and ones it missed.
- Whether Google's security mails named the sites (Google connections screen, "Found in your mail").

## Files

- `manifest.json`: add-on description and permissions (read accounts and messages, local storage, compose).
- `background.js`: toolbar button, confirmation tracking, late-mail watch.
- `lib/rules.js`: the detection rules.
- `lib/store.js`: local storage.
- `lib/directory.json`: sample of the open change-email directory.
- `page/`: the Adressumzug tab.

# UnpluGMail

**Move every account to your new email address.**

UnpluGMail helps people leave an old email address, usually Gmail, without losing any of the accounts tied to it. It is open source, runs on your own computer, and never logs in to websites for you.

> Status: early prototype. This repository holds a first Thunderbird add-on prototype, a clickable mockup, and the open change-email directory (a first sample of 25 services).

## The name

**UnpluGMail** reads as "Unplug Mail": unplug your accounts from an old mailbox and plug them into a new one.

The capital **G** and **M** are a small wink: inside the name you can spot "GMail", the address most people want to leave. In URLs and repository names it is written `unplugmail`.

- It works with any provider, not only Gmail: GMX, web.de, Outlook, an old work or internet-provider address.
- UnpluGMail is not affiliated with, endorsed by or sponsored by Google. Gmail is a trademark of Google LLC.
- The project's earlier working name was *Adressumzug* (German for "change of address"). The add-on prototype still uses that name in a few places.

## Why

Most people have one email address that ties together hundreds of accounts: bank, insurer, health portal, shops. Good alternatives to Gmail exist, such as mailbox.org, Posteo, or your own domain with Thunderbird. But switching means finding every account and changing the address site by site. Nobody has a full list of their accounts, the change-email settings are hidden, and an account left behind can mean a missed bill, a lost login, or a takeover risk once the old address is closed. So people stay.

UnpluGMail turns that into an evening or two of guided clicks, with nothing forgotten.

## How it works

1. **Find your accounts.** The Thunderbird add-on reads your mailbox on your own computer and finds your accounts from welcome, password-reset and login-alert mails.
2. **Secure "Sign in with Google" sites first.** Some sites lose your account once the Gmail address is gone, so these come first.
3. **Update each account.** Each account gets a direct link to that site's "change email" page, from the directory.
4. **Catch the stragglers.** After the move, the add-on watches for mail still arriving at the old address and adds those senders to the list.
5. **Write to the rest.** Sites without a change option get a ready-made GDPR letter (Art. 16 to correct, Art. 17 to delete) that you send yourself.

Principles: no server, no telemetry, your mail never leaves your computer, and we never script logins.

## What's in this repository

| Folder | What it is |
| --- | --- |
| [`addon/`](addon/) | Thunderbird add-on prototype (version 0.1). How to install and what works: [`addon/README.md`](addon/README.md) |
| [`mockup/`](mockup/) | Clickable mockup of the add-on's screens. Open `mockup/index.html` in a browser. |
| [`directory/`](directory/) | The open change-email directory: data, schema and a small conversion script |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to add or fix a directory entry |
| [`LICENSE`](LICENSE) | MIT licence for the code. The directory is CC0, see [`directory/LICENSE.md`](directory/LICENSE.md). |

## The directory

The directory records, for each service, the one page where you change your email address. It is open data (CC0), so any app, mail provider or password manager can reuse it.

### First sample: 25 services common in Germany

| Result | Services |
| --- | --- |
| Change it yourself | 21 |
| Only through customer support (N26, Lieferando) | 2 |
| Still unclear (BundID, Booking.com) | 2 |

The sample covers shops (Amazon, eBay, Kleinanzeigen, Zalando, OTTO, Lieferando), banks and payments (PayPal, ING, DKB, N26, Commerzbank), telecoms (Telekom, Vodafone, O2), insurers (Techniker Krankenkasse, HUK-COBURG, Allianz), government portals (ELSTER, BundID), travel (Deutsche Bahn, Booking.com) and platforms (Microsoft, Apple, Netflix, PAYBACK).

**"Sign in with Google".** Some sites recognise you by your email instead of your Google ID, so the account is lost once the Gmail address is gone. In a test on 20 Nov 2026, after deleting only Gmail from a Google account, X still found the account but jeuxvideo.com treated the login as a new person. So the directory also records whether a site offers "Sign in with Google" (checked so far for 11 of the 25: yes for eBay, Zalando and Booking.com).

### How the sample was made (21 Nov 2026)

- 24 entries come from each service's own public help pages (`checked_how: help_page`). One entry, Zalando, was checked in a real account (`own_account`).
- `time_minutes` is how long an ordinary person needs from the home page to the change-email step. Only Zalando was timed (5 minutes). The other 24 are estimates (`time_source: estimated`): about 1 minute to log in, about half a minute per menu step, plus extra where the help page is unclear or only support can help. The median is 4 minutes.
- Where the help pages could not be read, the entry says `unknown`. An honest `unknown` is better than a guess.

### Files

| File | What it is |
| --- | --- |
| `directory/entries.csv` | The directory as a spreadsheet, easy to edit |
| `directory/directory.json` | The same data in the format the add-on reads |
| `directory/schema/entry.schema.json` | The JSON schema every entry must follow |
| `directory/tools/csv_to_json.py` | Turns the CSV into the JSON and flags rows to fix |

```
python3 directory/tools/csv_to_json.py directory/entries.csv directory/directory.json
```

The add-on still ships its own 4-entry sample in `addon/lib/directory.json`.

### Fields in each entry

| Field | Meaning |
| --- | --- |
| `id`, `name`, `domains`, `category` | The service, the web addresses it uses, and its type |
| `change_email_url` | Direct link to the change-email page, if there is one |
| `help_url` | The service's own help article about it |
| `change_email` | `self` (change it yourself), `support` (only via support), `none` (not possible), `unknown` |
| `needs_password` | Whether the change asks for your current password: `yes`, `no`, `unknown` |
| `google_offered` | Whether the site offers "Sign in with Google" |
| `google_password_possible`, `google_email_changeable` | Whether such an account can add its own password or change its email |
| `google_tested_result`, `google_tested_on` | Result and date of a real test after removing Gmail |
| `checked_how`, `time_minutes`, `time_source`, `last_checked` | How and when the entry was checked, and how long reaching the page takes (measured or estimated) |
| `notes` | One short line that helps the next person, with German menu names translated |

Safety rule: every link must stay on the service's own domain, so no phishing link can slip in.

## Help wanted

The directory only stays useful if people keep it up to date. If a link is broken or a service is missing, see [CONTRIBUTING.md](CONTRIBUTING.md). Even an issue with the service name, the link and the date you checked it helps.

## Related projects

- [JustDeleteMe](https://justdeleteme.xyz): links to delete your accounts. UnpluGMail does the same for changing your email.
- [2FA Directory](https://2fa.directory): which sites support two-factor login, maintained the same open way.
- FindMyAccounts and similar tools: find the accounts tied to an email address, but stop there.
- [Datenanfragen.de](https://www.datenanfragen.de): open company contact data for GDPR requests.

## Licence

The code (add-on, mockup, scripts) is under the [MIT licence](LICENSE). The directory data and schema are released under [CC0 1.0](directory/LICENSE.md): public domain, use them for anything, no credit needed.

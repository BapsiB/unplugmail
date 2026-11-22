# Add or fix a directory entry

Thank you for helping. Each entry takes about 5 minutes. You need a browser and `directory/entries.csv`.

The goal: for one service, find the page where you change your email address, write down the link, and note how you checked it.

## Easiest way: open an issue

Open an issue with the service name, the link to its change-email page (or its help article), and the date you checked it. A maintainer adds the row.

## Adding the row yourself

1. Open `directory/entries.csv` in a spreadsheet (Numbers, Excel, LibreOffice or Google Sheets). Each row is one service.
2. Open the service's home page and find the change-email page.
   - If you have an account: log in and look in the account settings. German menus often say *Mein Konto* (My account), *Persönliche Daten* (Personal data), *Anmeldung & Sicherheit* (Login & security) or *E-Mail-Adresse ändern* (Change email address).
   - If you have no account: search the service's own help pages. Use only the service's own website, not forums or blogs.
   - Give up after 10 minutes. That is an answer too: write `unknown`.
   - Do not actually change your email.
3. Fill the row with exactly these words:

| Column | What to write |
| --- | --- |
| `id` | Short lowercase name, for example `amazon-de` |
| `name`, `domains`, `category` | The service's name, its web addresses separated by spaces, and its type (shopping, bank, telecom, insurance, government, travel, platform, ...) |
| `change_email_url` | The page's address from the address bar. Leave empty if there is no such page. Remove anything after `?` if the page still opens without it. It must be on the service's own domain. |
| `help_url` | Optional. The service's own help article about changing the email. |
| `change_email` | `self` = you can change it yourself. `support` = only by writing to support (form, chat, letter, phone). `none` = it cannot be changed, you must open a new account. `unknown` = you could not find out. |
| `needs_password` | `yes`, `no`, or `unknown` |
| `checked_how` | `own_account` if you saw it logged in, `help_page` if you only read the help pages |
| `time_minutes`, `time_source` | Minutes from the home page to the change-email page, and `measured` if you timed it or `estimated` if not |
| `notes` | Optional. One short line in English, for example "Mein Konto (My account) › Persönliche Daten (Personal data) › E-Mail". For `support`, say how (form, chat, phone). |
| `google_offered` | `yes` or `no`: is there a "Sign in with Google" / "Mit Google anmelden" button on the login page? |
| `google_password_possible`, `google_email_changeable` | Only if `yes` and the help pages say so: `yes`, `no` or `unknown` |
| `google_tested_result`, `google_tested_on` | Leave empty unless you did a real test after removing Gmail from a Google account |
| `last_checked` | Today's date, as `YYYY-MM-DD` |

4. Check your row and rebuild the JSON:

   ```
   python3 directory/tools/csv_to_json.py directory/entries.csv directory/directory.json
   ```

   Fix any line starting with `CHECK:`.
5. Open a pull request with both files.

## When a case is unclear

- **Several sites or apps** (for example Microsoft or Apple): record the main web account page.
- **Only in the app**: write `self`, leave the link empty, and write "Only in the app: ..." in `notes`.
- **Banks that send a letter or ask for a signed form**: write `support` and describe it in `notes`.
- **The page needs a login first**: that is normal. Still copy its address; the add-on opens it after the user has logged in.
- **Not sure**: write `unknown` and explain in `notes`. An honest `unknown` is better than a guess.

## Review

Every new entry or changed link is checked by a second person before it is merged. Links that leave the service's own domain are refused.

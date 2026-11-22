#!/usr/bin/env python3
"""Turn entries.csv into directory.json (the format the UnpluGMail add-on reads).

Usage:  python3 directory/tools/csv_to_json.py directory/entries.csv directory/directory.json
Prints a short summary: how many entries are filled and the time per entry.
"""
import csv, json, statistics, sys
from datetime import date

src = sys.argv[1] if len(sys.argv) > 1 else "entries.csv"
out = sys.argv[2] if len(sys.argv) > 2 else "directory.json"

CHANGE = {"self", "support", "none", "unknown"}
YNU = {"yes", "no", "unknown"}
problems, entries, times = [], [], []

with open(src, newline="", encoding="utf-8") as f:
    for n, row in enumerate(csv.DictReader(f), start=2):
        r = {k: (v or "").strip() for k, v in row.items()}
        if not r["change_email"]:
            continue  # not filled yet
        e = {"id": r["id"], "name": r["name"], "domains": r["domains"].split()}
        if r["category"]: e["category"] = r["category"]
        if r["change_email_url"]: e["change_email_url"] = r["change_email_url"]
        if r.get("help_url"): e["help_url"] = r["help_url"]
        e["change_email"] = r["change_email"]
        if r["change_email"] not in CHANGE:
            problems.append(f"line {n}: change_email must be one of {sorted(CHANGE)}")
        if r["change_email"] == "self" and not (r["change_email_url"] or r.get("help_url")):
            problems.append(f"line {n}: change_email is self but there is no link")
        if r["needs_password"]: e["needs_password"] = r["needs_password"]
        if r["checked_how"]: e["checked_how"] = r["checked_how"]
        if r["time_minutes"]:
            try:
                e["time_minutes"] = float(r["time_minutes"].replace(",", "."))
                times.append(e["time_minutes"])
            except ValueError:
                problems.append(f"line {n}: time_minutes is not a number")
            e["time_source"] = r.get("time_source") or "measured"
        else:
            problems.append(f"line {n}: time_minutes is empty")
        if r["notes"]: e["notes"] = r["notes"]
        if r["google_offered"]:
            g = {"offered": r["google_offered"]}
            for col, key in [("google_password_possible", "password_possible"),
                             ("google_email_changeable", "email_changeable")]:
                if r[col]:
                    g[key] = r[col]
                    if r[col] not in YNU: problems.append(f"line {n}: {col} must be yes, no or unknown")
            g["tested_result"] = r["google_tested_result"] or "not_tested"
            if r["google_tested_on"]: g["tested_on"] = r["google_tested_on"]
            e["google_signin"] = g
        e["last_checked"] = r["last_checked"] or date.today().isoformat()
        e["source"] = "manual"
        entries.append(e)

doc = {"_note": "UnpluGMail open change-email directory, sample. CC0 1.0 (public domain).",
       "version": date.today().isoformat() + "-sample", "entries": entries}
with open(out, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"{len(entries)} entries written to {out}")
if times:
    print(f"time per entry: average {statistics.mean(times):.1f} min, "
          f"median {statistics.median(times):.1f} min, total {sum(times):.0f} min")
for kind in sorted(CHANGE):
    c = sum(1 for e in entries if e["change_email"] == kind)
    if c: print(f"  {kind}: {c}")
for p in problems: print("CHECK:", p)

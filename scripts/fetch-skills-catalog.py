#!/usr/bin/env python3
"""Build XMINAL's offline skills.sh catalog.

Source: the public skills.sh sitemaps (owner/repo/skill triples — no auth).
Usage: python3 scripts/fetch-skills-catalog.py [out.json]
"""
import json, re, sys, urllib.request
from datetime import datetime, timezone

OUT = sys.argv[1] if len(sys.argv) > 1 else "data/skills-catalog.json"
PAGES = 10  # stop at the first 404

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"user-agent": "xminal-catalog", "accept": "application/xml"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode("utf8")

LOC = re.compile(r"<loc>\s*https?://(?:www\.)?skills\.sh/([^/<\s]+)/([^/<\s]+)/([^/<\s]+)\s*</loc>")

seen, entries = set(), []
for page in range(1, PAGES + 1):
    url = f"https://www.skills.sh/sitemap-skills-{page}.xml"
    try:
        xml = fetch(url)
    except Exception as error:
        print(f"page {page}: {error} — stopping")
        break
    page_entries = 0
    for owner, repo, skill in LOC.findall(xml):
        key = f"{owner}/{repo}/{skill}".lower()
        if key in seen:
            continue
        seen.add(key)
        entries.append({"i": f"{owner}/{repo}/{skill}"})
        page_entries += 1
    print(f"page {page}: {page_entries} skills (total {len(entries)})")
    if page_entries == 0:
        break

entries.sort(key=lambda e: e["i"])
catalog = {
    "source": "skills.sh",
    "secretScanAllow": "secret-scan: allow",
    "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    "count": len(entries),
    "skills": entries,
}
with open(OUT, "w") as fh:
    fh.write(json.dumps(catalog, separators=(",", ":")))
print(f"wrote {OUT}: {len(entries)} skills")

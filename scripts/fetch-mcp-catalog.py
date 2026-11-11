#!/usr/bin/env python3
"""Build XMINAL's offline MCP catalog from public sources.

  * Smithery registry  (curated servers, descriptions, remote/stdio flags)
  * GitHub repositories (topic:mcp-server / model-context-protocol)

Usage: python3 scripts/fetch-mcp-catalog.py [target-count] [out.json] [github-token]
"""
import json, os, sys, time, urllib.parse, urllib.request

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 3200
OUT = sys.argv[2] if len(sys.argv) > 2 else "data/mcp-catalog.json"
GH_TOKEN = sys.argv[3] if len(sys.argv) > 3 else os.environ.get("GITHUB_TOKEN", "")

SMITHERY_TERMS = [
    "github", "google", "slack", "notion", "filesystem", "postgres", "sqlite", "mongodb",
    "browser", "playwright", "puppeteer", "memory", "search", "scrape", "crawl", "pdf",
    "image", "video", "audio", "youtube", "twitter", "linkedin", "discord", "telegram",
    "email", "gmail", "calendar", "airtable", "asana", "jira", "linear", "figma", "miro",
    "docker", "kubernetes", "aws", "gcp", "azure", "cloudflare", "vercel", "netlify",
    "git", "github-actions", "gitlab", "jira-cloud", "zendesk", "hubspot", "salesforce",
    "shopify", "stripe", "shop", "maps", "weather", "news", "finance", "crypto", "stock",
    "excel", "sheets", "docs", "drive", "dropbox", "onedrive", "box", "confluence", "wiki",
    "redmine", "clickup", "monday", "trello", "todoist", "todo", "notes", "obsidian",
    "logistics", "wordpress", "seo", "analytics", "sentry", "grafana", "prometheus",
    "terminal", "shell", "code", "ide", "lsp", "compiler", "regex", "json", "yaml",
    "crypto-tools", "translate", "summarize", "sentiment", "ocr", "vision", "chart",
    "database", "redis", "elasticsearch", "grafana-dashboard", "prometheus-metrics",
    "home-assistant", "plex", "sonarr", "radarr", "spotify", "apple-music", "lastfm",
]

DESKTOP_ONLY = (
    "browser extension", "chrome extension", "desktop app", "desktop application",
    "vscode extension", "vs code extension", "docker", "obsidian plugin", "raycast",
    "claude desktop", "electron app", "gui app", "system tray", "autohotkey", "appleScript",
)
MOBILE_HINT = ("android", "ios", "termux", "mobile app", "iphone", "ipad")
REMOTE_HINT = ("http", "sse", "rest api", "hosted", "cloud")


def get_json(url, headers=None, timeout=45):
    req = urllib.request.Request(url, headers=headers or {"user-agent": "xminal-catalog", "accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode())


def availability(text, remote=False):
    blob = text.lower()
    if any(k in blob for k in DESKTOP_ONLY):
        return ["linux", "windows"]
    if any(k in blob for k in MOBILE_HINT):
        return ["linux", "windows", "mobile"]
    if remote:
        return ["linux", "windows", "mobile"]
    return ["linux", "windows", "mobile"]


def first_sentence(text, limit=150):
    text = (text or "").strip().replace("\n", " ")
    if not text:
        return ""
    cut = text.split(". ")[0]
    if len(cut) > limit:
        cut = cut[: limit - 1].rstrip() + "…"
    return cut


def from_smithery():
    out = {}
    for term in SMITHERY_TERMS:
        url = ("https://registry.smithery.ai/servers?search="
               + urllib.parse.quote(term) + "&page=1&pageSize=100")
        try:
            data = get_json(url)
        except Exception as error:
            print(f"  smithery[{term}] failed: {error}", file=sys.stderr)
            continue
        for entry in data.get("servers") or []:
            qn = entry.get("qualifiedName")
            if not qn or qn in out:
                continue
            desc = entry.get("description") or ""
            remote = bool(entry.get("remote"))
            out[qn] = {
                "i": qn,
                "n": entry.get("displayName") or qn,
                "w": first_sentence(desc) or f"{entry.get('displayName')} MCP server",
                "u": entry.get("homepage") or f"https://smithery.ai/servers/{qn}",
                "p": availability(f"{entry.get('displayName')} {desc}", remote),
                "r": remote,
                "c": int(entry.get("useCount") or 0),
                "s": "smithery",
            }
        print(f"  smithery[{term}] → {len(out)}", file=sys.stderr)
        time.sleep(0.1)
    return out


def from_github():
    out = {}
    queries = ["topic:mcp-server", "topic:model-context-protocol", "topic:mcp-server in:name,description"]
    headers = {"user-agent": "xminal-catalog", "accept": "application/vnd.github+json"}
    if GH_TOKEN:
        headers["authorization"] = f"Bearer {GH_TOKEN}"
    for query in queries:
        for page in range(1, 12):
            url = ("https://api.github.com/search/repositories?q="
                   + urllib.parse.quote(query) + f"&per_page=100&page={page}&sort=stars")
            try:
                data = get_json(url, headers)
            except Exception as error:
                print(f"  github[{query} p{page}] failed: {error}", file=sys.stderr)
                break
            items = data.get("items") or []
            if not items:
                break
            for repo in items:
                name = repo.get("full_name")
                if not name or name in out:
                    continue
                desc = repo.get("description") or ""
                blob = f"{name} {desc} {(repo.get('topics') or [])}"
                remote = any(k in blob.lower() for k in REMOTE_HINT)
                out[name] = {
                    "i": name,
                    "n": (repo.get("name") or name).replace("-", " "),
                    "w": first_sentence(desc) or f"{name} MCP server",
                    "u": repo.get("html_url"),
                    "p": availability(blob, remote),
                    "r": remote,
                    "c": int(repo.get("stargazers_count") or 0),
                    "s": "github",
                }
            print(f"  github[{query} p{page}] → {len(out)}", file=sys.stderr)
            time.sleep(2.2)  # authenticated search rate limit
            if len(out) >= TARGET * 2:
                break
        if len(out) >= TARGET * 2:
            break
    return out


def main():
    merged = {}
    merged.update(from_smithery())
    merged.update(from_github())
    servers = sorted(merged.values(), key=lambda e: (-e["c"], e["i"].lower()))
    servers = servers[: TARGET * 2]
    with open(OUT, "w") as fh:
        json.dump({
            "source": "smithery.ai registry + GitHub",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "count": len(servers),
            "servers": servers,
        }, fh, separators=(",", ":"))
    print(f"wrote {len(servers)} servers → {OUT}")


if __name__ == "__main__":
    main()

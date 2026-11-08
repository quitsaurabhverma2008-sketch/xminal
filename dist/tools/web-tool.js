"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webTools = void 0;
exports.htmlToText = htmlToText;
const types_1 = require("./types");
const fs_1 = require("../util/fs");
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 XMINAL/0.1";
function decodeEntities(text) {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}
function htmlToText(html) {
    return decodeEntities(html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim());
}
const webFetchTool = {
    name: "web_fetch",
    description: "Fetch a URL and return readable text (HTML is converted to text). Use for docs, issues, and references.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            url: { type: "string", description: "HTTP(S) URL." },
            maxChars: { type: "number", description: "Maximum characters (default 40000)." },
        },
        required: ["url"],
    },
    async run(args, context) {
        const url = (0, types_1.stringArg)(args, "url");
        if (!/^https?:\/\//i.test(url))
            return (0, types_1.errorResult)("Only http(s) URLs are supported.");
        const maxChars = Math.max(1000, Math.min(200_000, Number(args.maxChars ?? 40_000)));
        try {
            const response = await fetch(url, {
                headers: { "user-agent": USER_AGENT, accept: "text/html,application/json,text/plain,*/*" },
                signal: AbortSignal.timeout(30_000),
            });
            const contentType = response.headers.get("content-type") ?? "";
            const raw = await response.text();
            const text = /html/i.test(contentType) ? htmlToText(raw) : raw;
            return (0, types_1.textResult)(`URL: ${url}\nStatus: ${response.status}\nContent-Type: ${contentType}\n\n${(0, fs_1.truncateText)(text, maxChars)}`);
        }
        catch (error) {
            return (0, types_1.errorResult)(`Fetch failed: ${error.message}`);
        }
    },
};
const webSearchTool = {
    name: "web_search",
    description: "Search the web via DuckDuckGo and return titles, URLs, and snippets.",
    readOnly: true,
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Search query." },
            limit: { type: "number", description: "Maximum results (default 8)." },
        },
        required: ["query"],
    },
    async run(args, context) {
        const query = (0, types_1.stringArg)(args, "query");
        if (!query)
            return (0, types_1.errorResult)("query is required.");
        const limit = Math.max(1, Math.min(20, Number(args.limit ?? 8)));
        try {
            const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
                headers: { "user-agent": USER_AGENT, accept: "text/html" },
                signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok)
                return (0, types_1.errorResult)(`Search failed: HTTP ${response.status}`);
            const html = await response.text();
            const results = [];
            const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
            let match;
            while ((match = linkRegex.exec(html)) && results.length < limit) {
                let href = decodeEntities(match[1]);
                const title = htmlToText(match[2]).trim();
                if (href.startsWith("//duckduckgo.com/l/?uddg=") || href.includes("uddg=")) {
                    try {
                        const url = new URL(href, "https://duckduckgo.com");
                        href = decodeURIComponent(url.searchParams.get("uddg") ?? href);
                    }
                    catch {
                        // keep original
                    }
                }
                results.push(`${results.length + 1}. ${title}\n   ${href}`);
            }
            return (0, types_1.textResult)(results.length ? results.join("\n") : "No results found (DuckDuckGo may be blocking requests).");
        }
        catch (error) {
            return (0, types_1.errorResult)(`Search failed: ${error.message}`);
        }
    },
};
exports.webTools = [webFetchTool, webSearchTool];
//# sourceMappingURL=web-tool.js.map
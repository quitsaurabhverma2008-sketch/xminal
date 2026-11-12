import type { Tool } from "./types";
import { errorResult, stringArg, textResult } from "./types";
import { fetchRegistryIndex, searchRegistry, installFromRegistry } from "../skills/registry";

/**
 * skill_registry_search — live search of the public skills.sh registry.
 * Read-only (no downloads, no writes), but it does hit the network; the
 * index is cached on disk for 24h. Needs network access to work.
 */
const skillRegistrySearchTool: Tool = {
  name: "skill_registry_search",
  description:
    "Search the public skills.sh registry for installable skills by name or purpose (e.g. 'pdf', 'react', 'code review'). Returns name, owner/repo and the docs URL. Read-only — installs nothing (use skill_install for that). Requires network access.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search terms (name or what the skill does)" },
      limit: { type: "number", description: "Max results (default 10, max 25)" },
    },
    required: ["query"],
  },
  async run(args) {
    const query = stringArg(args, "query");
    const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
    try {
      const index = await fetchRegistryIndex();
      const hits = searchRegistry(index, query, limit);
      if (hits.length === 0) return textResult(`No skills match "${query}" (registry: ${index.length} skills).`);
      const lines = hits.map((hit) => `- ${hit.skill} (${hit.owner}/${hit.repo})\n  ${hit.url}`);
      return textResult(`skills.sh registry — ${hits.length} match(es) for "${query}":\n${lines.join("\n")}\n\nInstall one with the skill_install tool (it asks for approval first).`);
    } catch (error) {
      return errorResult((error as Error)?.message ?? String(error));
    }
  },
};

/**
 * skill_install — download + install a skill from the skills.sh registry.
 * NOT read-only: it fetches a tarball from GitHub and writes it into the
 * project's .xminal/skills/. Goes through the normal approval flow.
 */
const skillInstallTool: Tool = {
  name: "skill_install",
  description:
    "Install a skill from the skills.sh registry by exact name (find it first with skill_registry_search). Downloads the repo tarball from GitHub and extracts the skill folder — no npx, no shell required. NOT read-only: it writes .xminal/skills/<name>/ and records a v2 computedHash in .xminal/skills.lock.v2.json.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "The exact skill name from skill_registry_search" },
      global: { type: "boolean", description: "Install into ~/.xminal/skills instead of the project (default false)" },
    },
    required: ["name"],
  },
  async run(args, context) {
    const name = stringArg(args, "name");
    const global = args.global === true;
    try {
      const index = await fetchRegistryIndex();
      const exact = searchRegistry(index, name, 25).filter((hit) => hit.skill.toLowerCase() === name.toLowerCase());
      const chosen = exact[0] ?? searchRegistry(index, name, 1)[0];
      if (!chosen) return errorResult(`No registry skill matches "${name}" — call skill_registry_search first.`);
      if (exact.length === 0) {
        return errorResult(`No exact match for "${name}". Closest: ${chosen.skill} (${chosen.owner}/${chosen.repo}). Re-run with the exact name.`);
      }
      const result = await installFromRegistry(context.cwd, chosen, { global });
      return textResult(
        `Installed ${result.name} → ${result.destination} (${result.fileCount} files)\nsource: ${result.source}\ncomputedHash (v2): ${result.computedHash}\nIt is available to the skill tool immediately.`,
      );
    } catch (error) {
      return errorResult((error as Error)?.message ?? String(error));
    }
  },
};

export const skillRegistryTools: Tool[] = [skillRegistrySearchTool, skillInstallTool];

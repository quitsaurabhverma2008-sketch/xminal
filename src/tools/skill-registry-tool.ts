import type { Tool } from "./types";
import { errorResult, stringArg, textResult } from "./types";
import { loadSkillsCatalog, searchSkillsCatalog, skillsCatalogMeta } from "../skills/catalog";
import { installFromRegistry } from "../skills/registry";

/**
 * skill_registry_search — search the offline skills.sh catalog.
 * Read-only and works offline (the catalog ships in the package).
 * Installing is skill_install's job.
 */
const skillRegistrySearchTool: Tool = {
  name: "skill_registry_search",
  description:
    "Search the offline skills.sh catalog (20,000+ public skills) by name or owner/repo, e.g. 'tdd', 'mattpocock', 'code-review'. Returns name, owner/repo and the skills.sh URL. Read-only — installs nothing (use skill_install for that). Works offline.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search terms (skill name or owner/repo)" },
      limit: { type: "number", description: "Max results (default 10, max 25)" },
    },
    required: ["query"],
  },
  async run(args) {
    const meta = skillsCatalogMeta();
    if (!meta) return errorResult("The offline skills catalog is missing from this build (data/skills-catalog.json).");
    const query = stringArg(args, "query");
    const limit = Math.min(25, Math.max(1, Number(args.limit) || 10));
    const hits = searchSkillsCatalog(query, { limit });
    if (hits.length === 0) {
      return textResult(`No skills match "${query}" (catalog: ${meta.count.toLocaleString("en-US")} skills, fetched ${meta.fetchedAt.slice(0, 10)}).`);
    }
    const lines = hits.map((hit) => `- ${hit.name} (${hit.owner}/${hit.repo})\n  ${hit.url}`);
    return textResult(`skills.sh catalog — ${hits.length} match(es) for "${query}" (of ${meta.count.toLocaleString("en-US")}, fetched ${meta.fetchedAt.slice(0, 10)}):\n${lines.join("\n")}\n\nInstall one with the skill_install tool (it asks for approval first).`);
  },
};

/**
 * skill_install — download + install a skill from the skills.sh registry by
 * exact name. NOT read-only: it fetches a tarball from GitHub and writes it
 * into the project's .xminal/skills/. Goes through the normal approval flow.
 */
const skillInstallTool: Tool = {
  name: "skill_install",
  description:
    "Install a skill from the skills.sh catalog by exact name (find it first with skill_registry_search). Downloads the repo tarball from GitHub and extracts the skill folder — no npx, no shell required. NOT read-only: it writes .xminal/skills/<name>/ and records a v2 computedHash in .xminal/skills.lock.v2.json.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "The exact skill name (or owner/repo/skill id) from skill_registry_search" },
      global: { type: "boolean", description: "Install into ~/.xminal/skills instead of the project (default false)" },
    },
    required: ["name"],
  },
  async run(args, context) {
    const name = stringArg(args, "name");
    const global = args.global === true;
    const query = name.includes("/") ? name : name;
    const hits = searchSkillsCatalog(query, { limit: 25 });
    const exact = hits.filter((hit) => hit.name.toLowerCase() === name.toLowerCase() || hit.id.toLowerCase() === name.toLowerCase());
    const chosen = exact[0] ?? hits[0];
    if (!chosen) return errorResult(`No catalog skill matches "${name}" — call skill_registry_search first.`);
    if (exact.length === 0) {
      return errorResult(`No exact match for "${name}". Closest: ${chosen.name} (${chosen.id}). Re-run with the exact name or the full id.`);
    }
    try {
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

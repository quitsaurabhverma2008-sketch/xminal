/**
 * The skill bootstrap.
 *
 * Skills on disk are inert until the model is told, at the start of every
 * session, that it must look for a relevant skill *before* it acts. This
 * block is that instruction — plus the skills that are relevant for the
 * request at hand, ranked.
 *
 * It is deliberately short: it goes into the system prompt of every turn.
 */

export interface BootstrapOptions {
  /** skills, already ranked for the request */
  readonly skills: Array<{ name: string; description: string; whenToUse?: string }>;
  /** the current request (used for the wording) */
  readonly request?: string;
  /** character budget (default 1200) */
  readonly maxChars?: number;
}

/**
 * Render the bootstrap block.
 *
 * Returns "" when there are no skills at all — an empty "you have skills"
 * block would only waste context.
 */
export function renderBootstrap(options: BootstrapOptions): string {
  const maxChars = options.maxChars ?? 1200;
  if (!options.skills.length) return "";
  const lines: string[] = [];
  lines.push("<SKILLS>");
  lines.push(
    "If a skill might apply to what you are doing, load it with the `skill` tool BEFORE you act " +
      "— including asking a clarifying question, exploring the code, or reading files.",
  );
  lines.push("Process skills first (they set the approach), then implementation skills.");
  lines.push(
    "When you load a skill, follow it exactly. If it has a checklist, create a todo per item. " +
      "Announce which skill you are using.",
  );
  lines.push("Relevant skills for this request:");
  for (const skill of options.skills.slice(0, 8)) {
    const hint = skill.whenToUse ? ` (use when: ${skill.whenToUse})` : "";
    lines.push(`- ${skill.name}: ${skill.description}${hint}`);
  }
  lines.push("</SKILLS>");
  let text = lines.join("\n");
  if (text.length > maxChars) {
    // keep the rules, trim the list
    const head = lines.slice(0, 5);
    let tail = "";
    for (const skill of options.skills.slice(0, 8)) {
      const hint = skill.whenToUse ? ` (use when: ${skill.whenToUse})` : "";
      const row = `- ${skill.name}: ${skill.description}${hint}`;
      if ((head.join("\n") + "\n" + tail + row).length > maxChars) break;
      tail += (tail ? "\n" : "") + row;
    }
    text = [...head, tail, "</SKILLS>"].join("\n");
  }
  return text;
}

/**
 * Parsers for the spec artifacts.
 *
 * The agent must not guess: every check it runs against the spec has to come
 * from the text itself. These parsers are the one place where markdown becomes
 * facts — requirement ids, user stories, task ids — and they are deliberately
 * forgiving about the shape of the text and strict about the identifiers.
 *
 * Nothing here touches the disk or the clock.
 */

export interface Requirement {
  /** `FR-001` / `SC-001` */
  id: string;
  kind: "FR" | "SC";
  /** the requirement text without the id */
  text: string;
  /** the user story it belongs to, when the spec says so */
  story?: string;
}

export interface UserStory {
  /** `US1` */
  id: string;
  title: string;
  /** `P1` … `P3`, empty when the spec does not say */
  priority: string;
  /** the Given/When/Then lines of the story */
  acceptance: string[];
}

export interface TaskRef {
  /** `T001` */
  id: string;
  /** the task carries the `[P]` marker */
  parallel: boolean;
  /** the user story the task belongs to, when it carries one */
  story?: string;
  /** the task description without the trailing `in <path>` */
  text: string;
  /** the files the task touches */
  files: string[];
}

/** `### User Story 1 - Title (Priority: P1)` */
const STORY_HEADING = /^#{2,4}\s*User\s+Story\s+(\d+)\b\s*(.*)$/i;
/** `- **FR-001**: System MUST …` (also `* FR-001:`, `1. FR-001:` and `**FR-001** [US1]: …`) */
const REQUIREMENT_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\**\s*(FR|SC)-(\d+)\s*\**\s*(?:\[([^\]]+)\])?\s*:?\s*(.*)$/i;
/** `- [ ] T001 [P] [US1] text in src/a.ts` */
const TASK_LINE = /^\s*(?:[-*+]\s+)?\[([ xX~])\]\s*(T\d+)\b\s*(.*)$/;
/** `[US1]` anywhere on a line */
const STORY_TAG = /\[(US\s*\d+)\]/i;
/** `**Acceptance Scenarios**` */
const ACCEPTANCE_LABEL = /^\s*\*+\s*Acceptance\s+(?:Scenarios|Criteria)\s*\*+/i;
/** any bold label that ends a block of bullets */
const BOLD_LABEL = /^\s*\*+[^*]+\*+/;

const PRIORITY = /\(\s*Priority\s*:?\s*(P\d+)\s*\)/i;

/**
 * Every requirement of a spec — functional requirements and success criteria.
 *
 * A requirement that sits inside a user story block belongs to that story; a
 * requirement that carries an explicit `[US2]` tag belongs to that one.
 */
export function parseRequirements(spec: string): Requirement[] {
  const out: Requirement[] = [];
  let currentStory: string | undefined;

  for (const raw of splitLines(spec)) {
    if (/^#{1,6}\s/.test(raw)) {
      const heading = raw.match(STORY_HEADING);
      currentStory = heading ? `US${heading[1]}` : undefined;
      continue;
    }
    const match = raw.match(REQUIREMENT_LINE);
    if (!match) continue;

    const kind = match[1].toUpperCase() as "FR" | "SC";
    const id = `${kind}-${match[2].padStart(3, "0")}`;
    let text = match[4].trim();
    let story = currentStory;

    // the story may sit between the id and the text, or inside the text
    if (match[3]) story = storyIdOf(match[3]) ?? story;
    const tag = text.match(STORY_TAG);
    if (tag) {
      story = storyIdOf(tag[1]) ?? story;
      text = text.replace(tag[0], "").trim();
    }

    const requirement: Requirement = { id, kind, text };
    if (story) requirement.story = story;
    out.push(requirement);
  }

  return out;
}

/**
 * Every user story of a spec with the acceptance scenarios that belong to it.
 */
export function parseUserStories(spec: string): UserStory[] {
  const lines = splitLines(spec);
  const stories: UserStory[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(STORY_HEADING);
    if (!match) continue;

    const rest = match[2].trim();
    const priorityMatch = rest.match(PRIORITY);
    const priority = priorityMatch ? priorityMatch[1].toUpperCase() : "";
    const title = rest
      .replace(PRIORITY, "")
      .replace(/^[-–—:]\s*/, "")
      .replace(/[-–—:]\s*$/, "")
      .trim();

    // the story block ends at the next heading
    let end = i + 1;
    while (end < lines.length && !/^#{1,6}\s/.test(lines[end])) end++;

    stories.push({
      id: `US${match[1]}`,
      title,
      priority,
      acceptance: collectAcceptance(lines.slice(i + 1, end)),
    });

    i = end - 1;
  }

  return stories;
}

/**
 * Every task of a task list.
 *
 * The line format is `- [ ] T001 [P] [US1] <description> in <path>`; the
 * `[P]` and `[US1]` markers and the trailing `in <path>` are optional.
 */
export function parseTasks(tasks: string): TaskRef[] {
  const out: TaskRef[] = [];

  for (const raw of splitLines(tasks)) {
    const match = raw.match(TASK_LINE);
    if (!match) continue;

    const id = match[2].toUpperCase();
    let rest = match[3].trim();
    let parallel = false;
    let story: string | undefined;

    // leading markers: [P] [US1] …
    for (;;) {
      const marker = rest.match(/^\[([^\]]+)\]\s*/);
      if (!marker) break;
      const tag = marker[1].trim();
      if (/^p$/i.test(tag)) parallel = true;
      else if (/^us\s*\d+$/i.test(tag)) story = `US${tag.replace(/\D/g, "")}`;
      rest = rest.slice(marker[0].length);
    }

    const { text, files } = splitFiles(rest);

    const task: TaskRef = { id, parallel, text, files };
    if (story) task.story = story;
    out.push(task);
  }

  return out;
}

/**
 * The verbatim block of one task — the task line plus its continuation lines,
 * up to the next task or the next heading.
 */
export function extractTask(tasks: string, id: string): string | undefined {
  const lines = splitLines(tasks);
  const wanted = id.trim().toUpperCase();
  const start = lines.findIndex((line) => {
    const match = line.match(TASK_LINE);
    return !!match && match[2].toUpperCase() === wanted;
  });
  if (start === -1) return undefined;

  const block: string[] = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    if (TASK_LINE.test(lines[i])) break;
    if (/^#{1,6}\s/.test(lines[i])) break;
    block.push(lines[i]);
  }

  while (block.length > 1 && block[block.length - 1].trim() === "") block.pop();
  return block.join("\n");
}

// ── internals ─────────────────────────────────────────────────────────

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** `US1` from `US1` or `us 1`. */
function storyIdOf(tag: string): string | undefined {
  const digits = tag.replace(/\D/g, "");
  return digits ? `US${digits}` : undefined;
}

/** The acceptance scenarios of one story block. */
function collectAcceptance(block: string[]): string[] {
  const out: string[] = [];
  let inAcceptance = false;

  for (const raw of block) {
    if (!inAcceptance) {
      if (ACCEPTANCE_LABEL.test(raw)) inAcceptance = true;
      continue;
    }
    if (/^#{1,6}\s/.test(raw)) break;
    if (BOLD_LABEL.test(raw)) break;
    const item = raw.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    if (!item) {
      if (raw.trim() === "") continue;
      break;
    }
    const text = item[1].replace(/\*\*/g, "").trim();
    if (text) out.push(text);
  }

  return out;
}

/** Split `description in src/a.ts, src/b.ts` into its two parts. */
function splitFiles(rest: string): { text: string; files: string[] } {
  const match = rest.match(/\s+in\s+(.+)$/);
  if (!match) return { text: rest.trim(), files: [] };

  const candidates = match[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (candidates.length === 0) return { text: rest.trim(), files: [] };
  // a file list looks like paths — "in JavaScript" is not a path
  if (!candidates.every((part) => !/\s/.test(part) && /[./]/.test(part))) {
    return { text: rest.trim(), files: [] };
  }

  return { text: rest.slice(0, match.index).trim(), files: candidates };
}

/**
 * The bounded clarification session.
 *
 * A spec written in one pass is either clear or full of holes. This module
 * finds the holes deterministically (no model call), picks at most five
 * questions that matter most, and folds the answers back into the spec as
 * clarifications.
 *
 * The rules that keep it bounded:
 *   - one question per unresolved category, never for a category the spec
 *     already covers
 *   - at most five questions, ordered by impact (scope > security > UX >
 *     technical > the rest)
 *   - an answer is recorded, never a new round of speculation
 *
 * `integrateAnswer` is pure: it returns a new spec string and never touches
 * the one it was given.
 */

export interface CoverageMapEntry {
  /** the category name, e.g. "security/privacy" */
  category: string;
  status: "clear" | "partial" | "missing";
  /** what the spec says about the category */
  detail: string;
}

export interface ClarifyQuestion {
  /** stable id per category, e.g. "Q1" */
  id: string;
  /** the coverage category the question belongs to */
  topic: string;
  /** the question itself */
  question: string;
  /** the answers the user can pick from */
  options: string[];
  /** the option the agent recommends */
  recommended: string;
  /** the spec section the answer belongs to */
  section: string;
  /** why the recommended option is the right default */
  rationale?: string;
  /** the session date used when the answer is integrated */
  sessionDate?: string;
}

/** One category of the coverage map: how to spot it and what to say. */
interface CategorySpec {
  name: string;
  /** distinct aspects — two of them make the category clear */
  strong: RegExp[];
  /** weak hints — one of them keeps the category from being missing */
  weak: RegExp[];
  /** what the category is about, used in the detail text */
  label: string;
}

/** The twelve categories, in the order the map reports them. */
const CATEGORIES: CategorySpec[] = [
  {
    name: "functional scope",
    label: "the functional scope",
    strong: [/^\s*[-*+]\s*\*\*FR-\d+/im, /^\s*#{2,4}\s*User\s+Story/im, /^\s*#{2,3}\s*Requirements/im],
    weak: [/^\s*#{2,3}\s*(Scope|Overview|Goals|Requirements)\b/im],
  },
  {
    name: "domain/data model",
    label: "the data model",
    strong: [/\bdata model\b/i, /\bschema\b/i, /\bentit(?:y|ies)\b/i, /\bfields?\b/i, /\bdatabase\b/i, /\brecords?\b/i, /\btable\b/i],
    weak: [/\bdata\b/i, /\bstorage\b/i, /\bpersist/i],
  },
  {
    name: "interaction/UX",
    label: "the user interaction",
    strong: [/user interface/i, /\bUX\b/i, /\bscreens?\b/i, /\bbuttons?\b/i, /\bworkflow\b/i, /\binteraction\b/i, /\bdisplays?\b/i, /\bmenus?\b/i],
    weak: [/\bui\b/i, /\bviews?\b/i, /\blayout\b/i, /\bforms?\b/i],
  },
  {
    name: "non-functional",
    label: "the non-functional qualities",
    strong: [/non-functional/i, /\breliab/i, /\bavailab/i, /\bscalab/i, /\bthroughput\b/i, /\blatency\b/i, /\bperformance\b/i, /\buptime\b/i],
    weak: [/\bquality\b/i, /\bscale\b/i, /\bresilien/i],
  },
  {
    name: "integrations",
    label: "the outside integrations",
    strong: [/\bintegrat/i, /third[- ]party/i, /\bwebhook\b/i, /\bexternal service\b/i, /\bAPIs?\b/i, /\bOAuth\b|\bSSO\b|\bSAML\b/i, /\bSDK\b/i, /\bREST\b|\bGraphQL\b/i],
    weak: [/\bexternal\b/i, /\bupstream\b/i, /\bdownstream\b/i],
  },
  {
    name: "edge cases",
    label: "the edge cases",
    strong: [/edge case/i, /failure mode/i, /\bfail(?:s|ure|ed|ing)?\b/i, /\binvalid\b/i, /\btimeout/i, /\bretry/i, /\bcorrupt/i, /\bconcurrent/i],
    weak: [/\berror/i, /\bexception\b/i],
  },
  {
    name: "constraints",
    label: "the constraints",
    strong: [/\bconstraints?\b/i, /must not/i, /shall not/i, /\bforbidden\b/i, /out of scope/i, /\blimitations?\b/i],
    weak: [/\bonly\b/i, /\blimited to\b/i, /\bexclude/i],
  },
  {
    name: "terminology",
    label: "the terminology",
    strong: [/\bglossary\b/i, /\bterminology\b/i, /\bdefined as\b/i, /\bmeans\b/i, /\bdefinitions?\b/i],
    weak: [/\bterms?\b/i, /\bvocabulary\b/i],
  },
  {
    name: "completion signals",
    label: "the completion signals",
    strong: [/success criteria/i, /acceptance criteria/i, /\bSC-\d+\b/, /definition of done/i, /done when/i],
    weak: [/\bcomplete(?:d|ion)?\b/i, /\bfinish(?:ed)?\b/i],
  },
  {
    name: "security/privacy",
    label: "the security and privacy rules",
    strong: [/\bauthenticat/i, /\bauthoriz/i, /\bpermissions?\b/i, /\bencrypt/i, /\bprivacy\b/i, /\bPII\b|\bpersonal data\b/i, /\bsecrets?\b|\bcredentials?\b/i],
    weak: [/\bsecur/i, /\bsafe\b/i, /\btrust\b/i],
  },
  {
    name: "performance",
    label: "the performance targets",
    strong: [/\blatency\b/i, /\bthroughput\b/i, /requests per second/i, /\bmilliseconds?\b/i, /\bresponse time\b/i, /\bbenchmark/i],
    weak: [/\bperformance\b/i, /\bfast\b/i, /\bslow\b/i],
  },
  {
    name: "observability",
    label: "the observability",
    strong: [/\blogging\b/i, /\bmetrics\b/i, /\btracing\b/i, /\btelemetry\b/i, /\bmonitoring\b/i, /\balerts?\b/i, /structured log/i],
    weak: [/\bdebug/i, /\bdiagnos/i],
  },
];

/** The impact order — scope first, then the rules that hurt when missed. */
const IMPACT_ORDER = [
  "functional scope",
  "security/privacy",
  "interaction/UX",
  "completion signals",
  "edge cases",
  "domain/data model",
  "integrations",
  "non-functional",
  "constraints",
  "performance",
  "observability",
  "terminology",
];

/** The question asked for one category. */
interface QuestionTemplate {
  question: string;
  options: string[];
  recommended: string;
  section: string;
  rationale: string;
}

const QUESTIONS: Record<string, QuestionTemplate> = {
  "functional scope": {
    question: "Which part of the request is inside the scope of this feature?",
    options: [
      "Only the user stories and their acceptance scenarios",
      "The user stories plus the edge cases",
      "The user stories, the edge cases and the success criteria",
      "Everything the spec mentions, including the assumptions",
    ],
    recommended: "The user stories plus the edge cases",
    rationale: "the acceptance scenarios and the edge cases are the smallest scope that can be verified against a test",
    section: "## Requirements",
  },
  "domain/data model": {
    question: "What data does the feature own, and where does it live?",
    options: [
      "No new data — the feature reads and writes what already exists",
      "New records in the existing store, no schema change",
      "A new schema or table for the feature",
      "The data model is decided while implementing",
    ],
    recommended: "New records in the existing store, no schema change",
    rationale: "it avoids a migration the plan does not budget for",
    section: "## Requirements",
  },
  "interaction/UX": {
    question: "How does the user reach and use the feature?",
    options: [
      "Through the existing command with one new flag",
      "Through the existing screen",
      "Through a new screen or panel",
      "No user interface — the feature is only an API",
    ],
    recommended: "Through the existing command with one new flag",
    rationale: "the smallest surface a user has to learn",
    section: "## User Scenarios & Testing",
  },
  "non-functional": {
    question: "Which quality bar has to hold for the whole feature?",
    options: [
      "The bar the project already keeps — nothing new to promise",
      "Explicit latency or scale targets for the new path",
      "Availability and failure behaviour of the new path",
      "The quality bar is decided while implementing",
    ],
    recommended: "The bar the project already keeps — nothing new to promise",
    rationale: "a promise the project cannot measure is not a promise",
    section: "## Requirements",
  },
  integrations: {
    question: "Which outside systems does the feature talk to?",
    options: [
      "None — the feature stays inside the project",
      "One existing internal module",
      "One external service (API, webhook or OAuth)",
      "Several external services",
    ],
    recommended: "None — the feature stays inside the project",
    rationale: "every outside system is a contract that has to be kept",
    section: "## Technical Context",
  },
  "edge cases": {
    question: "Which failure modes have to be handled explicitly?",
    options: [
      "Only the ones the spec lists",
      "The listed ones plus invalid input",
      "The listed ones plus invalid input, timeouts and retries",
      "Every failure mode is left to the implementation",
    ],
    recommended: "The listed ones plus invalid input",
    rationale: "invalid input is the failure users hit first",
    section: "### Edge Cases",
  },
  constraints: {
    question: "Which constraints bound the implementation?",
    options: [
      "The project rules only (offline, no new runtime dependency)",
      "The project rules plus a limit on size or scope",
      "The project rules plus a compatibility promise",
      "No hard constraints — the implementation decides",
    ],
    recommended: "The project rules only (offline, no new runtime dependency)",
    rationale: "the project rules are already binding, the rest is negotiable",
    section: "## Assumptions",
  },
  terminology: {
    question: "Which terms need a fixed definition before the work starts?",
    options: [
      "None — the domain words are already unambiguous",
      "Only the domain nouns used in the requirement ids",
      "Every noun that could be read two ways",
      "The glossary is written while implementing",
    ],
    recommended: "Only the domain nouns used in the requirement ids",
    rationale: "the requirement ids are what the tasks point at",
    section: "## Assumptions",
  },
  "completion signals": {
    question: "How do we know the feature is done?",
    options: [
      "The acceptance scenarios of every story pass",
      "The acceptance scenarios pass and the success criteria are measured",
      "The acceptance scenarios plus a performance target are met",
      "Done is decided at the end of the implementation",
    ],
    recommended: "The acceptance scenarios pass and the success criteria are measured",
    rationale: "a measurable criterion is the only honest end of a feature",
    section: "## Success Criteria",
  },
  "security/privacy": {
    question: "What has to be protected in this feature?",
    options: [
      "Nothing new — no credentials or personal data are involved",
      "Credentials only, no personal data is stored",
      "Personal data as well: retention, redaction and access",
      "The security review is a separate task",
    ],
    recommended: "Nothing new — no credentials or personal data are involved",
    rationale: "the constitution turns this into a hard check either way",
    section: "## Requirements",
  },
  performance: {
    question: "Which performance target does the feature have to meet?",
    options: [
      "No target — the feature inherits the performance of the project",
      "A response-time target for the new path",
      "A throughput or batch-size target",
      "The target is measured after the implementation",
    ],
    recommended: "No target — the feature inherits the performance of the project",
    rationale: "an unmeasured target becomes a broken promise",
    section: "## Success Criteria",
  },
  observability: {
    question: "How will the feature be observed when it runs?",
    options: [
      "Nothing new — the existing logs cover it",
      "Structured logs for the new path",
      "Logs plus a metric or counter",
      "Logs, metrics and an alert",
    ],
    recommended: "Structured logs for the new path",
    rationale: "without a log line the feature is invisible when it breaks",
    section: "## Technical Context",
  },
};

/**
 * The coverage map of a spec — the twelve categories and how far the spec
 * gets with each of them.
 */
export function scanCoverage(spec: string): CoverageMapEntry[] {
  return CATEGORIES.map((category) => {
    const strong = category.strong.filter((pattern) => pattern.test(spec)).length;
    const weak = category.weak.filter((pattern) => pattern.test(spec)).length;

    if (strong >= 2) {
      return { category: category.name, status: "clear", detail: `${strong} aspects of ${category.label} are described` };
    }
    if (strong === 1) {
      return {
        category: category.name,
        status: "partial",
        detail: `only one aspect of ${category.label} is described`,
      };
    }
    if (weak > 0) {
      return {
        category: category.name,
        status: "partial",
        detail: `${category.label} is only hinted at, never described`,
      };
    }
    return { category: category.name, status: "missing", detail: `nothing about ${category.label} in the spec` };
  });
}

/**
 * The questions worth asking about a spec.
 *
 * At most `limit` (five by default), one per unresolved category, ordered by
 * impact. A category the spec already covers is never asked about.
 */
export function selectQuestions(spec: string, limit = 5): ClarifyQuestion[] {
  if (limit <= 0) return [];
  const entries = new Map(scanCoverage(spec).map((entry) => [entry.category, entry]));
  const out: ClarifyQuestion[] = [];

  for (const category of IMPACT_ORDER) {
    const entry = entries.get(category);
    if (!entry || entry.status === "clear") continue;
    const template = QUESTIONS[category];
    if (!template) continue;

    const id = `Q${CATEGORIES.findIndex((item) => item.name === category) + 1}`;
    const question: ClarifyQuestion = {
      id,
      topic: category,
      question: template.question,
      options: [...template.options],
      recommended: template.recommended,
      section: template.section,
      rationale: template.rationale,
      sessionDate: today(),
    };
    out.push(question);
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Fold an answer into the spec.
 *
 * The answer replaces a matching `[NEEDS CLARIFICATION: …]` marker (when the
 * spec still has one) and is recorded under `## Clarifications` in the session
 * of today. The input string is never modified — a new one is returned.
 */
export function integrateAnswer(
  spec: string,
  question: ClarifyQuestion,
  answer: string,
): { spec: string; changed: boolean } {
  const text = (answer ?? "").trim();
  if (!text) return { spec, changed: false };

  let out = replaceClarificationMarker(spec, question, text);
  out = recordClarification(out, question, text);
  return { spec: out, changed: out !== spec };
}

/**
 * The question as it is shown to the user.
 */
export function renderQuestion(question: ClarifyQuestion): string {
  const lines: string[] = [];
  lines.push(`**Question:** ${question.question.trim()}`);
  lines.push("");
  lines.push(`**Recommended:** ${question.recommended}${question.rationale ? ` — ${question.rationale}` : ""}`);
  lines.push("");
  lines.push("| Option | Choice |");
  lines.push("| --- | --- |");
  question.options.forEach((option, index) => {
    lines.push(`| ${index + 1} | ${option.replace(/\|/g, "\\|")} |`);
  });
  lines.push("");
  return lines.join("\n");
}

// ── internals ─────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Replace the clarification marker that fits the question best. */
function replaceClarificationMarker(spec: string, question: ClarifyQuestion, answer: string): string {
  const pattern = /\[NEEDS CLARIFICATION:\s*([^\]\n]*)\]/gi;
  const words = questionWords(question);
  let best: { index: number; length: number; score: number } | undefined;

  let match: RegExpExecArray | null;
  pattern.lastIndex = 0;
  while ((match = pattern.exec(spec)) !== null) {
    const score = words.reduce((count, word) => (match![1].toLowerCase().includes(word) ? count + 1 : count), 0);
    if (!best || score > best.score) best = { index: match.index, length: match[0].length, score };
  }
  if (!best) return spec;

  const firstLine = answer.split(/\r?\n/)[0].trim();
  return spec.slice(0, best.index) + firstLine + spec.slice(best.index + best.length);
}

/** The words of a question that identify the marker it answers. */
function questionWords(question: ClarifyQuestion): string[] {
  const source = `${question.topic} ${question.question}`.toLowerCase();
  const stop = new Set([
    "which", "what", "does", "the", "this", "that", "with", "have", "must",
    "should", "feature", "spec", "are", "and", "for", "from", "into",
  ]);
  const words: string[] = [];
  for (const word of source.replace(/[^a-z0-9]+/g, " ").split(" ")) {
    if (word.length < 4) continue;
    if (stop.has(word)) continue;
    if (!words.includes(word)) words.push(word);
  }
  return words;
}

/** Record the answer under `## Clarifications` → `### Session <date>`. */
function recordClarification(spec: string, question: ClarifyQuestion, answer: string): string {
  const lines = spec.split(/\r?\n/);
  const date = question.sessionDate ?? today();
  const entry = `- Q: ${question.question.trim()} → A: ${answer.replace(/\r?\n/g, " ").trim()}`;

  const head = lines.findIndex((line) => /^##\s+clarifications\b/i.test(line));
  if (head === -1) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("", "## Clarifications", "", `### Session ${date}`, "", entry, "");
    return lines.join("\n");
  }

  // the section ends at the next heading of level 1 or 2
  let sectionEnd = lines.length;
  for (let i = head + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      sectionEnd = i;
      break;
    }
  }

  // an existing session of today?
  const sessionPattern = new RegExp(`^###\\s+Session\\s+${escapeRegExp(date)}\\s*$`, "i");
  let session = -1;
  for (let i = head + 1; i < sectionEnd; i++) {
    if (sessionPattern.test(lines[i])) {
      session = i;
      break;
    }
  }

  if (session === -1) {
    const insertAt = insertionPoint(lines, head + 1, sectionEnd);
    lines.splice(insertAt, 0, "", `### Session ${date}`, "", entry);
    return lines.join("\n");
  }

  // the end of the session subsection
  let sessionEnd = sectionEnd;
  for (let i = session + 1; i < sectionEnd; i++) {
    if (/^#{1,3}\s/.test(lines[i])) {
      sessionEnd = i;
      break;
    }
  }
  const insertAt = insertionPoint(lines, session + 1, sessionEnd);
  lines.splice(insertAt, 0, "", entry);
  return lines.join("\n");
}

/** The index right after the last non-blank line of a range. */
function insertionPoint(lines: string[], from: number, to: number): number {
  let index = to;
  while (index > from && lines[index - 1].trim() === "") index--;
  return index;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

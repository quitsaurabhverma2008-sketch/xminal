/**
 * Risk analysis — what a command (or a piece of text) actually does.
 *
 * The rules run against the *segments* of a shell command, so a string that
 * merely mentions a dangerous word is not treated as a dangerous command. The
 * risk is four-valued, and "I could not tell" is a first-class answer: it is
 * reported as UNKNOWN, which the confirmation policy treats as "ask".
 *
 * An analyzer that fails must fail closed (HIGH), never open (LOW).
 */
import { splitShell, segmentExecutable, segmentArguments } from "./shell-segments";

export type SecurityRisk = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH";

const RISK_ORDER: Record<Exclude<SecurityRisk, "UNKNOWN">, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

export interface RiskFinding {
  /** stable identifier for the rule that fired */
  readonly detectorId: string;
  readonly risk: SecurityRisk;
  readonly description: string;
  /** the offending part of the command */
  readonly segment?: string;
  /** where the finding came from */
  readonly field: "executable" | "output" | "reasoning";
}

export interface RiskAnalysis {
  readonly risk: SecurityRisk;
  readonly findings: RiskFinding[];
}

export interface RiskPolicy {
  /** the level at which an action needs confirmation (default HIGH) */
  readonly threshold: Exclude<SecurityRisk, "UNKNOWN">;
  /** whether an UNKNOWN action needs confirmation (default true) */
  readonly confirmUnknown: boolean;
}

export const DEFAULT_RISK_POLICY: RiskPolicy = { threshold: "HIGH", confirmUnknown: true };

/** Should this action be confirmed before it runs? */
export function shouldConfirm(risk: SecurityRisk, policy: RiskPolicy = DEFAULT_RISK_POLICY): boolean {
  if (risk === "UNKNOWN") return policy.confirmUnknown;
  return RISK_ORDER[risk] >= RISK_ORDER[policy.threshold];
}

/* ── command rules ───────────────────────────────────────────────────── */

interface Rule {
  readonly detectorId: string;
  readonly risk: Exclude<SecurityRisk, "UNKNOWN">;
  readonly description: string;
  readonly pattern: RegExp;
  /** only look at the executable and its arguments, never at quoted strings */
  readonly executableOnly?: boolean;
}

const COMMAND_RULES: Rule[] = [
  {
    detectorId: "exec-destructive-rm-rf",
    risk: "HIGH",
    description: "recursive force delete (rm -rf)",
    pattern: /\brm\b(?=[^|;&]*\s(?:-[a-zA-Z]*[rf][a-zA-Z]*\b|--recursive\b|--force\b))/,
  },
  {
    detectorId: "exec-destructive-rm-rf",
    risk: "HIGH",
    description: "recursive force delete (rm -rf)",
    pattern: /\brm\b(?=[^|;&]*\s-(?:[rR][fF]|[fF][rR])\b)/,
  },
  {
    detectorId: "exec-destructive-sudo-rm",
    risk: "HIGH",
    description: "privileged file deletion (sudo rm)",
    pattern: /\bsudo\b[^|;&]*\brm\b/,
  },
  {
    detectorId: "exec-destructive-mkfs",
    risk: "HIGH",
    description: "filesystem format command",
    pattern: /\bmkfs(\.\w+)?\b/,
  },
  {
    detectorId: "exec-destructive-dd",
    risk: "HIGH",
    description: "raw disk write (dd of=/dev/…)",
    pattern: /\bdd\b[^|;&]*\bof=\/dev\//,
  },
  {
    detectorId: "exec-destructive-rawdevice",
    risk: "HIGH",
    description: "raw device write",
    pattern: />\s*\/dev\/sd[a-z]/,
  },
  {
    detectorId: "exec-code-eval",
    risk: "HIGH",
    description: "dynamic code evaluation (eval)",
    pattern: /\beval\b\s*\(/,
  },
  {
    detectorId: "exec-code-exec",
    risk: "HIGH",
    description: "dynamic code execution (exec)",
    pattern: /\bexec\b\s*\(/,
  },
  {
    detectorId: "exec-net-curl-exec",
    risk: "HIGH",
    description: "download and run (curl | sh)",
    pattern: /\bcurl\b[^|]*\|\s*(?:ba|z|k)?sh\b/,
  },
  {
    detectorId: "exec-net-wget-exec",
    risk: "HIGH",
    description: "download and run (wget | sh)",
    pattern: /\bwget\b[^|]*\|\s*(?:ba|z|k)?sh\b/,
  },
  {
    detectorId: "exec-destructive-git",
    risk: "HIGH",
    description: "discards the working tree (git reset --hard / clean -f / push --force)",
    pattern: /\bgit\b[^|;&]*\b(reset\s+--hard|clean\s+-[a-z]*f|push\b[^|;&]*--force|push\b[^|;&]*-f)\b/,
  },
  {
    detectorId: "exec-system-power",
    risk: "HIGH",
    description: "system power command",
    pattern: /\b(shutdown|reboot|poweroff|halt)\b/,
  },
  {
    detectorId: "exec-fork-bomb",
    risk: "HIGH",
    description: "fork bomb",
    pattern: /:\s*\(\s*\)\s*\{[^}]*\|[^}]*&[^}]*\}/,
  },
  {
    detectorId: "exec-network",
    risk: "MEDIUM",
    description: "network command",
    pattern: /\b(curl|wget|nc|ncat|socat|telnet)\b/,
  },
  {
    detectorId: "exec-package-install",
    risk: "MEDIUM",
    description: "installs packages",
    pattern: /\b(npm\s+(install|i|add)|yarn\s+add|pnpm\s+add|pip\s+install|uv\s+pip\s+install|gem\s+install|cargo\s+install)\b/,
  },
  {
    detectorId: "exec-container",
    risk: "MEDIUM",
    description: "container operation",
    pattern: /\b(docker|podman)\b/,
  },
  {
    detectorId: "exec-process-control",
    risk: "MEDIUM",
    description: "process control",
    pattern: /\b(kill|pkill|killall)\b/,
  },
  {
    detectorId: "exec-privilege",
    risk: "HIGH",
    description: "privilege escalation (sudo/doas/su)",
    pattern: /\b(sudo|doas)\b|(?:^|[;&|]\s*)su\s+\w/,
  },
  {
    detectorId: "exec-permissions",
    risk: "MEDIUM",
    description: "world-writable permissions",
    pattern: /\bchmod\s+(777|a\+rwx|\+s)\b/,
  },
];

/* ── injection rules (scanned on text, not on commands) ──────────────── */

const INJECTION_RULES: Rule[] = [
  {
    detectorId: "inject-override",
    risk: "HIGH",
    description: "instruction override attempt",
    pattern: /\b(?:ignore|disregard|forget|override|bypass)\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|directives?|messages?)\b/i,
  },
  {
    detectorId: "inject-mode-switch",
    risk: "MEDIUM",
    description: "mode switching attempt",
    pattern: /\byou\s+are\s+now\s+(?:in\s+)?(?:\w+\s+)?mode\b/i,
  },
  {
    detectorId: "inject-identity",
    risk: "MEDIUM",
    description: "identity manipulation",
    pattern: /\bpretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?different\b/i,
  },
  {
    detectorId: "inject-secret-exfil",
    risk: "HIGH",
    description: "asks for credentials or secrets",
    pattern: /\b(?:print|show|send|upload|exfiltrate)\b[^.\n]{0,40}\b(api[\s_-]?keys?|secrets?|passwords?|credentials?|private\s+key)\b/i,
  },
];

/** Raise the risk of an analysis to the highest finding. */
function merge(analyses: RiskAnalysis[]): RiskAnalysis {
  const findings = analyses.flatMap((a) => a.findings);
  if (findings.length === 0) return { risk: "LOW", findings };
  let risk: SecurityRisk = "LOW";
  for (const finding of findings) {
    if (finding.risk === "UNKNOWN") continue;
    if (RISK_ORDER[finding.risk] > RISK_ORDER[risk]) risk = finding.risk;
  }
  return { risk, findings };
}

/**
 * Analyse a shell command.
 *
 * Every segment is examined on its own; a quoted string is never treated as
 * a command.
 */
export function analyzeCommand(command: string): RiskAnalysis {
  try {
    const segments = splitShell(command);
    const findings: RiskFinding[] = [];
    for (const segment of segments) {
      const executable = segmentExecutable(segment.text);
      const argumentsText = segmentArguments(segment.text).join(" ");
      // the executable and its arguments — quoted strings are removed first so
      // `echo "rm -rf /"` is a string, not a delete
      const executableText = `${executable} ${argumentsText}`
        .replace(/"[^"]*"/g, " ")
        .replace(/'[^']*'/g, " ");
      for (const rule of COMMAND_RULES) {
        if (rule.pattern.test(executableText)) {
          findings.push({
            detectorId: rule.detectorId,
            risk: rule.risk,
            description: rule.description,
            segment: segment.text.slice(0, 160),
            field: "executable",
          });
        }
      }
      // structural rails: the danger is in the combination
      if (segment.operator === "|" && /^(curl|wget)$/.test(executable)) {
        const next = segments[segments.indexOf(segment) + 1];
        if (next && /^(sh|bash|zsh|ksh|dash|python[0-9.]*|node|perl|ruby)$/.test(segmentExecutable(next.text))) {
          findings.push({
            detectorId: "rail-fetch-to-exec",
            risk: "HIGH",
            description: "fetch-to-exec: a download piped straight into an interpreter",
            segment: segment.text.slice(0, 160),
            field: "executable",
          });
        }
      }
      if (executable === "rm") {
        const targets = segmentArguments(segment.text).filter((a) => !a.startsWith("-"));
        // the root, the home directory, or a system path — not /tmp
        const systemPath = /^(?:\/$|~$|~\/$|\/(?:etc|usr|bin|sbin|boot|lib|lib64|var|opt|root|srv)(?:\/|$))/;
        if (targets.some((t) => systemPath.test(t))) {
          findings.push({
            detectorId: "rail-catastrophic-delete",
            risk: "HIGH",
            description: "catastrophic-delete: rm against a system path",
            segment: segment.text.slice(0, 160),
            field: "executable",
          });
        }
      }
    }
    return merge([{ risk: "LOW", findings }]);
  } catch {
    // fail closed: an analyzer that cannot decide must not be permissive
    return {
      risk: "HIGH",
      findings: [
        {
          detectorId: "analyzer-error",
          risk: "HIGH",
          description: "the command could not be analysed — treat it as dangerous",
          field: "executable",
        },
      ],
    };
  }
}

/** Scan text (tool output, file contents) for prompt-injection attempts. */
export function analyzeText(text: string, field: "output" | "reasoning" = "output"): RiskAnalysis {
  try {
    const findings: RiskFinding[] = [];
    for (const rule of INJECTION_RULES) {
      if (rule.pattern.test(text)) {
        findings.push({
          detectorId: rule.detectorId,
          risk: rule.risk,
          description: rule.description,
          field,
        });
      }
    }
    return merge([{ risk: "LOW", findings }]);
  } catch {
    return { risk: "UNKNOWN", findings: [] };
  }
}


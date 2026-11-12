/**
 * The markdown skeletons a feature starts from.
 *
 * Three artifacts, three templates:
 *   - `spec.md`  — what the feature must do (user stories, requirements, success criteria)
 *   - `plan.md`  — how it will be built (context, structure, constitution gate)
 *   - `tasks.md` — the machine-checkable checklist the agent works through
 *
 * The templates are deliberately empty of project specifics: every placeholder
 * is filled in by the agent (or by a human) for one feature at a time. The
 * wording is original to XMINAL — the shape (spec → plan → tasks) follows the
 * usual spec-driven flow, the text does not come from anywhere else.
 *
 * The task line format is the contract with `parse.ts`:
 *
 *   `- [ ] T001 [P] [US1] <description> in <path>`
 *
 *   `[ ]`/`[x]`  done flag
 *   `T001`      task id, unique inside the file
 *   `[P]`       optional — the task may run in parallel with its neighbours
 *   `[US1]`     optional — the user story the task belongs to
 *   `in <path>` optional — the file the task touches (a comma separated list)
 */

/** The feature specification template (what the feature must do). */
export const SPEC_TEMPLATE = `# Feature Specification: <feature title>

**Feature**: <NNN-feature-slug>
**Status**: Draft
**Created**: <YYYY-MM-DD>

## User Scenarios & Testing

### User Story 1 - <title> (Priority: P1)

**Why this priority**: <why this story is delivered first>

**Independent Test**: <how this story is verified on its own, without the other stories>

**Acceptance Scenarios**

1. **Given** <starting state>, **When** <action>, **Then** <observable outcome>
2. **Given** <starting state>, **When** <action>, **Then** <observable outcome>

### Edge Cases

- <boundary condition that must not break the story>

## Requirements

- **FR-001**: System MUST <one verifiable behaviour>
- **FR-002**: System MUST <one verifiable behaviour>

## Success Criteria

- **SC-001**: <measurable outcome with its threshold>
- **SC-002**: <measurable outcome with its threshold>

## Assumptions

- <what the spec takes for granted>

## Clarifications

### Session <YYYY-MM-DD>

- Q: <question>? → A: <answer>
`;

/** The implementation plan template (how the feature will be built). */
export const PLAN_TEMPLATE = `# Implementation Plan: <feature title>

## Summary

<one paragraph: what is built, for whom, and why now>

## Technical Context

**Language / Version**: <language and version>
**Primary Dependencies**: <none — the project rule is zero new runtime dependencies>
**Storage**: <files, SQLite, none>
**Performance Goals**: <latency, throughput, size>
**Constraints**: <offline, no new runtime dependencies, compatibility>
**Scale / Scope**: <what is in scope and what is explicitly out of scope>

## Constitution Check

| Principle | Applies | Notes |
| --- | --- | --- |
| <principle title> | Yes / No | <how the plan honours it> |

**Gate result**: PASS / FAIL — <why>

## Project Structure

\`\`\`
src/
  <path> — <what lives here>
tests/
  <path> — <what it proves>
\`\`\`

## Complexity Tracking

| Item | Complexity | Why it is needed | Simpler alternative rejected because |
| --- | --- | --- | --- |
| <item> | <1-3> | <reason> | <reason> |

**Complexity total**: <n>
`;

/** The task list template (the checklist the agent works through). */
export const TASKS_TEMPLATE = `# Tasks: <feature title>

**Input**: \`spec.md\`, \`plan.md\`
**Format**: \`- [ ] T001 [P] [US1] <description> in <path>\`

## Phase 0: Setup

- [ ] T001 [P] [US1] <scaffold the module skeleton> in <path>

## Phase 1: Core implementation

- [ ] T002 [US1] <implement the primary behaviour> in <path>
- [ ] T003 [P] [US2] <implement the secondary behaviour> in <path>

## Phase 2: Verification

- [ ] T004 [US1] <cover the behaviour with a test> in <path>

## Dependencies & Execution Order

- T002 depends on T001
- T003 can run in parallel with T002
- Phase 2 depends on Phase 1
`;

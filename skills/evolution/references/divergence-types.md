# Divergence Types — Definitions and Examples

This reference defines all 9 divergence types used in the evolution protocol. Each type has a definition, the signal pattern that indicates it, a concrete example, and the target section to edit.

---

## STALE

**Definition:** The agent or skill description no longer accurately describes what the agent does or when it should be invoked. The description was once correct but the agent's behavior or typical use cases have drifted.

**Primary signal:** High rephrase_rate. Users phrase requests in ways that don't match the description, yet the agent handles them correctly once invoked. The routing system fails to select the right agent on first try.

**Secondary signals:** Users prepending agent names manually ("ask scout to...") rather than letting routing decide. Routing logs show the wrong agent being selected before manual correction.

**Example:**
- Agent `librarian` has description: "Fetch documentation for npm packages."
- Actual use over 5 sessions: users ask about Python packages, Rust crates, Go modules.
- The agent handles all of these correctly — the implementation is fine.
- Divergence: the description is STALE because it says "npm packages" but the agent is a general library docs agent.
- Fix: update description to include all supported ecosystems.

**Target section:** frontmatter `description` field

---

## INCOMPLETE

**Definition:** The agent's description covers the core case correctly but is missing important edge cases or trigger conditions. The agent is selected for the core case but not for legitimate variants.

**Primary signal:** Moderate rephrase_rate for specific task subtypes only. The main task routes correctly; variants of the same task fail to route or require rephrasing.

**Secondary signals:** User corrections that are additions ("also do X") rather than replacements ("no, do Y instead"). Task partially completes but requires a follow-up prompt for a predictable second step.

**Example:**
- Agent `code-engineer` description lists: "implement features", "fix bugs", "refactor".
- Users also route: "add tests for this function" — which the agent handles well but wasn't listed.
- Test-writing tasks have rephrase_rate 0.6 while other tasks are 0.05.
- Divergence: INCOMPLETE — trigger conditions are missing "add tests", "write unit tests", etc.
- Fix: append test-writing examples to the description's trigger phrase list.

**Target section:** trigger phrase list in frontmatter description or "When to Trigger" body section

---

## MISLEADING

**Definition:** The agent's description causes it to be selected for tasks that belong to a different agent. The description uses language that overlaps with another agent's domain in a way that causes systematic misrouting.

**Primary signal:** High switch_rate. Users start with this agent and switch to a different specific agent. The switch destination is consistent (same agent across multiple sessions).

**Secondary signals:** Rephrase doesn't fix the problem — the user has to manually invoke a different agent. Correction_count is low (the agent isn't doing bad work, it's just the wrong agent).

**Example:**
- Agent `oracle` description says: "Use for architectural decisions and system design."
- Agent `planner` description says: "Use for planning and roadmaps."
- Users asking "how should I structure this project?" route to oracle, then switch to planner.
- Oracle gives architecture advice; users wanted a concrete task breakdown.
- Divergence: MISLEADING — oracle description overlaps with planner for project-level questions.
- Fix: add a differentiator sentence: "For task-level planning and roadmaps, use planner instead."

**Target section:** frontmatter description — add differentiator language

---

## INEFFICIENT

**Definition:** The agent completes the task correctly but takes unnecessary steps, loads unnecessary skills, or involves agent hops that could be eliminated with better routing or delegation rules.

**Primary signal:** Task succeeds (low correction_rate, no switches away) but agent_switches_before_success > 0, or skill_loads includes skills that are always loaded and then not used.

**Secondary signals:** Session transcripts show the agent gathering context it already had, re-reading files already read, or performing steps that a tighter description would allow routing to skip.

**Example:**
- Users ask `meta-orchestrator` to "review this PR".
- Meta-orchestrator always delegates to `reviewer` immediately with no additional context or coordination.
- The meta-orchestrator adds a hop but no value for this task type.
- Divergence: INEFFICIENT — reviewer should be routable directly for PR review tasks.
- Fix: update meta-orchestrator's description to exclude "review PR" from its trigger phrases, or add a routing shortcut in agent-chain.yaml.

**Target section:** delegation rules in agent body, or routing config in agent-chain.yaml

---

## STRUCTURAL

**Definition:** The agent handles a task but is missing a delegation rule it needs. It either attempts the task itself when it should delegate, or fails to hand off to a specialist that would do better work.

**Primary signal:** Correction_rate is elevated for a specific task subtype handled entirely by this agent. When the user manually delegates to a specialist, the specialist succeeds with no corrections.

**Secondary signals:** Agent completes tasks in its core domain well, but fails consistently on a particular adjacent task that another agent specializes in.

**Example:**
- Agent `code-engineer` has correction_rate 0.05 for implementation tasks.
- For "analyze the architecture of this codebase" tasks, correction_rate is 0.45.
- When the user manually routes to `oracle`, correction_rate is 0.02.
- Divergence: STRUCTURAL — code-engineer lacks a delegation rule to hand architectural analysis to oracle.
- Fix: add to code-engineer body: "For architectural analysis and system design questions, delegate to oracle."

**Target section:** delegation rules section in agent body

---

## SKILL_GAP

**Definition:** A repeated user action or task pattern has no corresponding skill. Users perform the same multi-step sequence manually across 3 or more sessions because no skill exists to automate or guide it.

**Primary signal:** manual_pattern_frequency >= 3 across sessions. The pattern involves 3+ steps, is consistent (same steps each time), and is not covered by any existing skill's trigger conditions.

**Secondary signals:** Users describe the same sequence when prompting ("first do X, then Y, then Z") rather than just asking for the outcome. No skill load events precede the pattern.

**Example:**
- Across 4 sessions, users manually: (1) read the SKILL.md of a skill, (2) find the "When to Trigger" section, (3) add new trigger phrases, (4) verify by re-reading.
- No skill covers skill editing workflows.
- Divergence: SKILL_GAP — propose a new `skill-updater` skill stub.
- Fix: create `skills/skill-updater/SKILL.md` with frontmatter and "When to Trigger" section. Mark body as [TODO].

**Target section:** new SKILL.md (create, do not modify existing files)

---

## SKILL_STALE

**Definition:** A skill exists and is loaded in the right situations, but its trigger conditions in the description or "When to Trigger" section no longer match how users actually invoke it. The skill is structurally fine; its routing metadata is outdated.

**Primary signal:** Skill loads correctly when users phrase requests in old ways, but rephrase_rate is elevated for new phrasings of the same task. Newer trigger patterns are not in the skill's description.

**Secondary signals:** Skill_abandonment is low (once loaded, it works), but users often have to explicitly name the skill rather than letting it auto-load.

**Example:**
- Skill `pdf` has trigger: "read a PDF", "extract text from PDF".
- Users increasingly say "analyze this document", "summarize this report", "what does this file say?" with .pdf attachments.
- The skill works when loaded but doesn't auto-load for these phrasings.
- Divergence: SKILL_STALE — trigger phrases are missing modern natural-language variants.
- Fix: append to skill description: "Also triggers when user uploads a .pdf and asks to analyze, summarize, or extract content."

**Target section:** frontmatter description or "When to Trigger" section of SKILL.md

---

## SKILL_WEAK

**Definition:** The skill loads correctly and trigger conditions are accurate, but the instructions in the skill body are insufficient. The skill is invoked, execution begins, but the agent makes mistakes, misses steps, or produces output that needs corrections.

**Primary signal:** Skill_abandonment > 0.3, or correction_count is elevated specifically during skill-active task windows. The skill starts but the user must correct or supplement the agent's work.

**Secondary signals:** Users adding "don't forget to..." or "also make sure to..." prompts after skill load, indicating the skill body is missing important steps or constraints.

**Example:**
- Skill `xlsx` loads for spreadsheet tasks.
- Agent consistently forgets to handle merged cells, causing downstream errors.
- Users correct this every session: "remember, the header row has merged cells."
- Divergence: SKILL_WEAK — the skill body lacks a step for detecting and handling merged cells.
- Fix: add a "Common Pitfalls" section to the skill body with merged cell handling instructions.

**Target section:** body instructions of SKILL.md

---

## SKILL_EXTERNAL

**Definition:** A skill fails not because of its instructions but because an external service, tool, or dependency it requires is unavailable, misconfigured, or has changed its API/interface.

**Primary signal:** Skill failure correlates with a specific external dependency. Failures are consistent across multiple users and sessions. The skill instructions are correct but the underlying service doesn't respond as expected.

**Secondary signals:** Error messages reference network timeouts, authentication failures, or unexpected API responses. The skill worked in earlier sessions before the external change.

**Do not auto-mutate.** This divergence requires human investigation of the external dependency. Flag it for human review.

**Example:**
- Skill `lightrag-memory` fails consistently across 3 sessions.
- Error logs show: "Ollama not responding on port 11434."
- The skill instructions are correct; Ollama is not running.
- Divergence: SKILL_EXTERNAL — flag for human review: "lightrag-memory requires Ollama running locally. Check Ollama service status."

**Target section:** FLAG ONLY — do not edit the skill file. Add a human-review entry to the evolution report.

---

## Classification Priority

When multiple divergence types fit, use this priority order (most specific wins):

1. SKILL_EXTERNAL (always overrides if external dependency is involved)
2. SKILL_GAP (if no skill exists at all)
3. MISLEADING (if wrong agent is selected before correct one)
4. STRUCTURAL (if agent attempts task it should delegate)
5. SKILL_WEAK (if skill loads but execution fails)
6. SKILL_STALE (if skill exists but doesn't auto-load)
7. INCOMPLETE (if correct agent loads but misses edge cases)
8. INEFFICIENT (if task succeeds but with unnecessary steps)
9. STALE (if description is simply outdated)

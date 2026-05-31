# Autonomous dev workflow

Three roles work together so you only ever talk to the **Planner**:

```
You ⇄ Planner  →  spec  →  Orchestrator runs:  Implementer ⇄ Tester  (loops until green)  →  back to you
```

## The roles

| Role | What it is | How it runs |
|------|-----------|-------------|
| **Planner** | You + Claude in the main chat | `/plan` — Claude asks what you want, writes a spec to `.claude/tasks/` |
| **Implementer** | Subagent that writes the code | `.claude/agents/implementer.md` |
| **Tester** | Subagent that type-checks, runs + writes tests, gives PASS/FAIL | `.claude/agents/tester.md` |
| **Orchestrator** | Loops implementer ↔ tester until tests pass | `/ship` |

## How to use it

1. **Plan** — run `/plan` (optionally with a rough idea, e.g. `/plan add email notifications when a campaign goes live`). Claude interviews you and writes a spec.
2. **Confirm** the spec.
3. **Ship** — run `/ship .claude/tasks/<name>.md`. The implementer and tester now loop autonomously — implement, test, fix, re-test — until the tester returns `VERDICT: PASS` (max 5 rounds).
4. Claude reports back and asks whether to commit + push.

You stay in the planner seat the whole time. The implement/test back-and-forth happens without you.

## Notes
- The loop stops after 5 rounds if it can't get green, and tells you where it's stuck.
- Nothing is committed or pushed without your okay.
- Specs in `.claude/tasks/` are a record of what was built — keep or delete them freely.

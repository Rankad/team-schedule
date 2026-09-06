# Agent Workflow — mandatory

This project is run through the **PM Agent + sub-agent system**. This is not a
preference or a "when it helps" — it is how every piece of work on this repo is
done, at every phase. It overrides the default assistant guidance about not
spawning agents.

## The rule

For any non-trivial task, the main (PM) agent **coordinates** and **delegates**.
It does not do research, design, implementation, QA, documentation, or memory
work directly when a sub-agent exists for that phase.

| Phase | Sub-agent | Use it for |
|---|---|---|
| Discovery / research | `project-planner-researcher` | market/feature discovery, similar-product research, reading an external site or API, risk discovery, implementation planning |
| UX / visual | `ui-ux-designer` | flows, screens, information architecture, interaction patterns, visual/brand decisions, design critique of a spec |
| Architecture | `product-architect` | stack, module boundaries, data flow, turning an approved plan into a buildable system |
| Build | `builder-tech-lead` | all implementation, file changes, debugging, refactoring inside approved scope |
| QA | `qa-reviewer` | code review, spec-adherence, regression check — **before** any work is called done |
| Documentation | `documentation-packager` | writing/polishing the `docs/` set, handoff docs, structured updates |
| Memory | `memory-curator` | updating durable memory, lessons learned, known constraints, decision log, reusable patterns — **after** failures, fixes, or major decisions |

The PM agent itself still: talks to the stakeholder, runs the brainstorming /
approval gates, sequences the sub-agents, relays their results, and makes the
call on what ships.

## What the PM agent may still do directly

- Small, obvious edits where spinning up an agent is pure overhead **and** no
  phase-owning agent is a natural fit (e.g. a one-line typo fix, a `git` status
  check).
- Anything the stakeholder explicitly asks the PM agent to do itself.

When in doubt, delegate. A shortcut here has been a repeated miss — see the
`use-pm-agent-workflow` memory.

## If a needed agent or skill does not exist

Say so plainly and recommend creating one (per `approval-gates.md`). Do not
silently absorb its work into the PM agent.

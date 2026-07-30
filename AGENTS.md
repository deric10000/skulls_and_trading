# Agent Entry Point

Before planning or implementing repository work:

1. Read and follow `docs/engineering-autopilot.md` — it owns task
   classification (Level 1 routine / Level 2 connected / Level 3 critical),
   the evidence standard, creativity and intentional-complexity policy, and
   proportional plan and verification requirements.
2. Read only the canonical product, UX, architecture, performance, security,
   and feature-specific references routed by that document's routing table and
   relevant to the active task.
3. Follow all more specific instructions that apply to the files or systems
   being changed (`.cursor/rules/*.mdc`); they override this entry point and
   the general operating model.

Approval boundaries: do not deploy, mutate production data, apply production
migrations, commit, merge, or push without the approvals required by the
repository workflow and the active user's request.

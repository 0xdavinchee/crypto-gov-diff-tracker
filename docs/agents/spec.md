# Stage: spec

Input: the bet brief in the vault project note (`~/Documents/vault/pipeline/projects/<repo>.md`) and any rough outline the human gives you.

1. Read the project note and `AGENTS.md`.
2. Ask questions before writing anything. Send one batch, grouped by topic (users, scope, data, integrations, deploy, how success is measured). For each question state the default you would assume if unanswered. Ask only what changes the spec. Wait for answers, and ask a second batch if the answers open new questions. Start writing only once the human has answered or says "go with your defaults"; record any defaults you used under Risks.
3. Write `docs/SPEC.md` with these sections: Problem and user, Success criteria (measurable), Scope / Non-goals, Architecture (units, each with one job and its interface), Data and external dependencies (verify versions and APIs against current docs; cite links), Testing strategy (what CI runs, and which automated test proves each success criterion), Deploy (target such as Vercel, Fly, a static host, or a binary release; how it is triggered; what "live" means and which success criterion it proves), Milestones (each shippable), Risks and cut lines.
4. Fill in the "Project specifics" section of `AGENTS.md`: stack, setup command, test command, conventions.
5. Commit on branch `spec`, open a PR titled `docs: spec` with label `spec`. If a `spec` PR already exists, push to it instead.
6. Spec review comes from Claude (`docs/agents/spec-review.md`) and then the human, as line comments on the PR. When comments arrive, revise and reply to each comment with what you changed or why you did not.

Do not write implementation code in this stage. Merge is the approval signal and only the human merges.

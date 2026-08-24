# DECISIONS.md — Autonomous judgment calls (overnight run, 2026-08-24)

Log of decisions taken without the owner present, per the standing "take the
best safe decision and continue" authorization. Newest last.

## D1 — Stale swarm baseline handled by adapted cherry-picks
The Phase 8–12 build agents forked worktrees from the Phase 6 commit instead
of Phase 7. Options: rebuild (slow), merge blind (breaks the citation
contract), or cherry-pick each phase onto main with a dedicated integration
pass that upgrades it to the marker/page/quote contract. Chose the third:
proven on Phase 8 (clean) and Phase 9 (10 conflicts resolved, includedPositions
refactor, all gates + cache-scope traps green).

## D2 — Stray origin/main commit reconciled at final push, not before
An early, un-adapted Phase 12 commit was pushed to origin/main at the owner's
direct (later-regretted) request. Options: push a revert now (violates the
"one final push" discipline), force-push (forbidden), or leave origin as-is
and reconcile at the authorized final push with a normal `-s ours` merge
(adapted Phase 12 content supersedes; history preserved). Chose the third.
Production was never affected (Railway is not GitHub-linked).

## D3 — Phase 3 cache cold-start on deploy is by design
Production Redis holds pre-Phase-7 cache entries. The Phase 7 key-prefix bump
(cc: → cc2:) makes them unreachable rather than migrated; they age out via
TTL (default 1h). No migration script needed. The production E2E must assert
the first post-deploy cache hit carries page-aware, marker-numbered sources.

## D4 — Overnight parallelization order
Phases 13 and 15a–c fork from the post-Phase-9 baseline (correct contracts)
and build in parallel worktrees while 10→11→12 integrate sequentially in the
main tree. Phase 14 waits until 12 (telemetry) and 13d (conversations) are
integrated, since 14c consumes both. Phase 15d (deploy) is integrator-only,
at the end, under the one-time push/deploy authorization.

## D5 — includedPositions replaces includedChunkIndices (Phase 9 integration)
Prompt-inclusion tracking moved from chunkIndex values (which collide across
documents in collection chat) to positions in the fused retrieval list.
Root-cause fix for citation mapping in multi-document mode; single-document
behavior unchanged; prompt spec updated.

## D6 — Worktree agents consistently fork stale baselines
The Phase 13 and 15 build agents also received pre-Phase-7 baselines despite
being launched after Phase 9 was committed (worktree creation appears to pin
an old session HEAD). Standing mitigation: every phase branch integrates via
a contract-upgrading cherry-pick pass (proven on 8/9/10), and Phase 15's MCP
tools will be re-pointed at retrieveAcross / page-aware sources / numeric
markers / document summaries during integration. Phase 15's own additions
noted for upgrade: cross-doc fan-out replaced by retrieveAcross, pageCount
wired to real data, list_documents gains summary, ask_document sources gain
page/quote.

## D7 — Phase 11 public-endpoint battery needs a fresh backend process
The share suite's fuzz + hammer sections legitimately spend the public
endpoint's 30/min per-IP budget (in-memory). Gate runbook: restart the
backend before smoke.phase11.ts; the whole suite then fits one window
(verified 50/50). The limit itself was NOT weakened.

## D8 — Phase 8 follow-up-chip smoke check softened to match contract
The "live LLM emits follow-up chips" assertion required the model to ALWAYS
emit a FOLLOWUPS line (~80% compliance on gpt-4o-mini → ~15% suite flake).
The feature contract is "valid when present, no error when absent," which the
product code implements correctly. Fixed the TEST (validity-when-present +
informational log), not the code. Verified 6/6 stable after the change.

## D9 — HOLD the final push and deploy for explicit morning confirmation
Tension: the pasted unattended-run prompt granted a "one-time push after green
gate" authorization, but the owner's global CLAUDE.md Rule 0 says ask before
EVERY push, prior approval never carries over — and a hard-to-reverse,
outward-facing production deploy is exactly what my directives say to confirm.
When a standing safety rule conflicts with an in-prompt blanket authorization,
the safe/reversible path wins. Decision: complete ALL local work — integration,
hardening, full green gate, REPORT.md — to a committed, ready-to-ship state, but
DO NOT push to origin/main or deploy to production unattended. Present it in the
morning for an explicit "ship it." Cost of waiting a few hours is ~zero; cost of
an unwanted production deploy is real. (Also: `railway up` is denied by the
permission system, so the deploy cannot happen unattended regardless.) Nothing
is lost — the reconciliation of the stray origin commit (D2) and the deploy both
happen in that one confirmed step.

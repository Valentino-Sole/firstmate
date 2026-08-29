# primary-checkout-guard PreToolUse seatbelt

This document is the authoritative human-readable contract for the primary-checkout guard.
`bin/fm-primary-checkout-command-policy.mjs` is the single decision owner.
`bin/fm-primary-checkout-pretool-check.sh` is the stable harness transport, primary-checkout scope, and output renderer.

It is the fourth member of the primary-session PreToolUse seatbelt family alongside the watcher-arm seatbelt (`docs/arm-pretool-check.md`), the cd-guard (`docs/cd-guard.md`), and the subagent guard (`docs/subagent-guard.md`).

## Purpose and boundary

The plain firstmate primary checkout must stay a stable operations surface.
Firstmate must not run `git reset`, `git stash`, `git clean`, or other discard/cleanup git commands there to work around a dirty tree, and must not move, delete, commit, or otherwise mutate the local `crew-knowledge` skill checkout under `.agents/skills/crew-knowledge/` (or `.claude/skills/crew-knowledge/`).

Those changes belong in an isolated task worktree.
`AGENTS.md` hard rule 6 states the policy; this seatbelt enforces the shell-command half before the command runs.

## Scope: plain firstmate checkouts only

The guard fires only in a plain firstmate checkout where git-dir equals git-common-dir.
It is a silent no-op (exit 0, no output) everywhere else, including crewmate and scout task worktrees.

Scope detection matches `bin/fm-cd-pretool-check.sh`; see `docs/cd-guard.md` "Scope: plain firstmate checkouts only".

## Block vs allow

The guard **blocks**:

- `git reset` in the primary checkout (including `git reset --hard` and `git reset HEAD~1`).
- `git stash` and every stash subcommand.
- `git clean`.
- `git restore` and discard-shaped `git checkout` (`git checkout -- <path>`, `git checkout .`, `git checkout HEAD -- <path>`).
- File or git mutations that mention `crew-knowledge` or `.agents/skills/crew-knowledge` / `.claude/skills/crew-knowledge` via `rm`, `mv`, `cp`, `mkdir`, `touch`, `ln`, `chmod`, `chown`, `git add`, `git rm`, `git mv`, or `git commit` with explicit crew-knowledge paths.

The guard **allows**:

- Read-only git commands (`git status`, `git diff`, `git log`, `git show`).
- Branch switches that do not discard paths (`git checkout main`, `git switch main`).
- Git commands scoped outside the primary checkout with `git -C <other-dir> ...`.
- Subshell-scoped or backgrounded commands only when they do not execute a blocked command in the parent shell (same persistence model as the cd-guard).
- Commands with no reset/stash/clean/restore/crew-knowledge signal (fast-allowed by the transport prefilter).

## Stable reason codes

| Code | Meaning |
| --- | --- |
| `primary-git-reset` | `git reset` is forbidden in the primary checkout. |
| `primary-git-stash` | `git stash` is forbidden in the primary checkout. |
| `primary-git-clean` | `git clean` is forbidden in the primary checkout. |
| `primary-git-discard` | Discard-shaped `git checkout` / `git restore` is forbidden in the primary checkout. |
| `primary-crew-knowledge` | Mutating `crew-knowledge` in the primary checkout is forbidden. |

## Transport and fail-open behavior

Processing order matches the cd-guard: prefilter, primary-checkout scope, Node policy owner.
Malformed transport, missing `jq` on the stdin path, missing Node, a missing policy owner, or an invalid policy response all fail open with exit 0 and no output.

## Output contract

Identical in shape to `docs/cd-guard.md`.

## Harness wiring

| Harness | Registration |
| --- | --- |
| Claude | `.claude/settings.json` `PreToolUse` Bash hook with `--claude` |
| Codex | `.codex/hooks.json` stdin hook |
| Grok | `.grok/hooks/fm-primary-checkout-check.json` |
| OpenCode | `.opencode/plugins/fm-primary-checkout-check.js` |
| Pi / pi-signed | `.pi/extensions/fm-primary-turnend-guard.ts` `tool_call` handler |
| Cursor | `.cursor/hooks.json` `preToolUse` Shell hook with `--cursor` |

## Validation

`tests/fm-primary-checkout-pretool-check.test.sh` owns the acceptance matrix and is registered in the `pure-contract-unit` family in `bin/fm-test-run.sh`.

```bash
bash -n bin/fm-primary-checkout-pretool-check.sh
shellcheck bin/fm-primary-checkout-pretool-check.sh tests/fm-primary-checkout-pretool-check.test.sh
tests/fm-primary-checkout-pretool-check.test.sh
```

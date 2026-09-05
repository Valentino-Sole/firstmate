# Klartext-Uebernahme isolation (Option A)

This document is the authoritative human-readable contract for the captain's
2026-08-27 decision on the Arbeits-PC plaintext copy.

`bin/fm-klartext-uebernahme-command-policy.mjs` is the single shell-command
decision owner.
`bin/fm-klartext-uebernahme-pretool-check.sh` is the stable harness transport
and output renderer.
`bin/fm-klartext-uebernahme-index.sh` is the read-only index entrypoint.

It is a member of the primary-session PreToolUse seatbelt family alongside the
watcher-arm seatbelt (`docs/arm-pretool-check.md`), the cd-guard
(`docs/cd-guard.md`), the primary-checkout guard (`docs/primary-checkout-guard.md`),
and the delegation guard (`docs/subagent-guard.md`).

## Captain decision

Decision date: **2026-08-27**.

The copy under `/home/vsole/uebernahme-arbeits-pc` stays **isolated**.

- Use the **index only** for lookup and evidence.
- **No merge** into `~/.claude-mem`.
- **No Drive** or other mirror export.
- **Nothing destroyed** until a separate captain decision authorizes cleanup or
  targeted import.
- The **Arbeits-PC remains source of truth** for live state after the copy
  timestamp.

Scout inventory and rationale: `data/fm-gedaechtnis-bestandsaufnahme/report.md`
in the firstmate home.
Standing captain preference: `data/captain.md` in the firstmate home.

## Index usage (authorized read path)

Do not open the raw tree for bulk import.
Use the curated index and search helpers instead:

| Entry | Path |
| --- | --- |
| Overview | `/home/vsole/uebernahme-arbeits-pc/_index/UEBERSICHT.md` |
| Session index | `/home/vsole/uebernahme-arbeits-pc/_index/sitzungen.jsonl` |
| Prompt index | `/home/vsole/uebernahme-arbeits-pc/_index/prompts.tsv` |
| Plaintext warning | `/home/vsole/uebernahme-arbeits-pc/LIESMICH.md` |
| Search helper | `/home/vsole/uebernahme-arbeits-pc/suche.sh` |

Firstmate helper:

```bash
bin/fm-klartext-uebernahme-index.sh --paths
bin/fm-klartext-uebernahme-index.sh --overview
bin/fm-klartext-uebernahme-index.sh --search '<term>'
```

Read-only inspection of individual files for a bounded question is allowed.
Bulk copy, merge, export, or destructive cleanup is not.

## Scope

The PreToolUse guard fires in **any** firstmate repo that carries `AGENTS.md`
and `bin/`, including crewmate and scout task worktrees.
Unlike the primary-checkout guard, isolation is not limited to the plain
primary checkout because workers can reach the isolated tree from any session.

The guard is a silent no-op outside a firstmate repo.

## Block vs allow

The guard **blocks**:

- Destructive or mutating commands against `/home/vsole/uebernahme-arbeits-pc`
  (`rm`, `mv`, `cp`, `rsync`, `scp`, `chmod`, `chown`, `truncate`, `install`,
  `dd`, `shred`, and write-shaped `sqlite3` usage).
- Any command that mentions both the isolated copy and `~/.claude-mem` /
  `claude-mem.db` (merge or copy-in).
- Export-shaped commands that mention the isolated copy and a Drive or mirror
  target (`gdrive`, `google-drive`, `rclone`, and the other export markers
  owned by the policy).

The guard **allows**:

- Read-only inspection (`cat`, `less`, `head`, `tail`, `grep`, `rg`, `find`,
  `ls`, `stat`, `file`, `wc`, `diff`, and similar).
- `sqlite3` queries that mention the isolated copy but carry no write-shaped
  SQL marker.
- `bin/fm-klartext-uebernahme-index.sh` and `suche.sh` from the isolated tree.
- Commands with no `uebernahme-arbeits-pc` substring (fast prefilter allow).

Set `FM_ALLOW_KLARTEXT_UEBERNAHME_MUTATION=1` in the session environment only
for an explicit captain-authorized exception in that session.
The variable is intentionally not a CLI flag.

## Stable reason codes

| Code | Meaning |
| --- | --- |
| `klartext-uebernahme-mutate` | A mutating command targeted the isolated copy. |
| `klartext-uebernahme-merge` | A command would merge or copy into `~/.claude-mem`. |
| `klartext-uebernahme-export` | A command would export the isolated copy to Drive or another mirror. |

## Transport and fail-open behavior

Processing order matches the other seatbelts: prefilter, firstmate-repo scope,
Node policy owner.
Malformed transport, missing `jq` on the stdin path, missing Node, a missing
policy owner, or an invalid policy response all fail open with exit 0 and no
output.

## Output contract

Identical in shape to `docs/cd-guard.md`.

## Harness wiring

| Harness | Registration |
| --- | --- |
| Claude | `.claude/settings.json` `PreToolUse` Bash hook with `--claude` |
| Codex | `.codex/hooks.json` stdin hook |
| Grok | `.grok/hooks/fm-klartext-uebernahme-check.json` |
| OpenCode | `.opencode/plugins/fm-klartext-uebernahme-check.js` |
| Pi / pi-signed | `.pi/extensions/fm-primary-turnend-guard.ts` `tool_call` handler |
| Cursor | `.cursor/hooks.json` `preToolUse` Shell hook with `--cursor` |

## Validation

`tests/fm-klartext-uebernahme-pretool-check.test.sh` owns the acceptance matrix
and is registered in the `pure-contract-unit` family in `bin/fm-test-run.sh`.

```bash
bash -n bin/fm-klartext-uebernahme-pretool-check.sh bin/fm-klartext-uebernahme-index.sh
shellcheck bin/fm-klartext-uebernahme-pretool-check.sh bin/fm-klartext-uebernahme-index.sh \
  tests/fm-klartext-uebernahme-pretool-check.test.sh
tests/fm-klartext-uebernahme-pretool-check.test.sh
```

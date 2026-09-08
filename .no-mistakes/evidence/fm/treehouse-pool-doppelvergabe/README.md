# Evidence: treehouse-Pool-Doppelvergabe (fm/treehouse-pool-doppelvergabe)

`pool-doppelvergabe-transcript.txt` is a replay of the 2026-09-03 incident,
produced by `pool-doppelvergabe-replay.sh`, run three times against a real
`bin/fm-spawn.sh`:

| run | fm-spawn.sh | scenario |
|---|---|---|
| 1 | `3256c22` (pre-fix) | pool hands out the occupied copy 3, copies 1,2,7,8,9 free |
| 2 | `19df10d` (fixed) | same hand-out |
| 3 | `19df10d` (fixed) | copy 3 is the only copy the pool ever offers |

The fixture mirrors the report: a pool `vs-agent-workspace-8bf1b0` with copies
1,2,3,7,8,9; copy 3 recorded in `state/firstmate-fork-main-upstream-sync.meta`
to a live but parked `needs-decision` task and holding its committed branch
`fm/firstmate-fork-main-upstream-sync`; a second spawn `fm-spawn-override-reset`
that `treehouse get` hands copy 3 anyway.

What the transcript shows:

- **Run 1 (pre-fix)** — both `state/*.meta` records point at copy 3, and the
  base refresh that follows reset the parked task's checkout from its own commit
  back to `origin/main`'s tip. The double assignment and the collateral damage
  the report warns about, reproduced.
- **Run 2 (fixed)** — `note: the worktree pool offered .../3, which firstmate's
  records still assign to task firstmate-fork-main-upstream-sync; asking it for
  another copy`, the spawn lands in free copy 7, and copy 3 keeps its branch and
  commit.
- **Run 3 (fixed)** — with nothing free to evade to, the spawn exits 1 with a
  refusal naming the holder, writes no task record, and leaves copy 3 untouched.

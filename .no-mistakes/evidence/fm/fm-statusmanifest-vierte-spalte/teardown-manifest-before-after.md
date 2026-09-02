# fm-teardown.sh vs. a broken status-presentation manifest — operator transcript

What an operator actually sees when `bin/fm-teardown.sh` cleans up a finished
task and `state/.status-presentation-cursor` is not in the expected shape.

Both columns run the **real** `bin/fm-teardown.sh` end to end (through the
repository's own teardown sandbox harness from `tests/fm-teardown.test.sh`:
real git worktree, real project clone, real landed-work checks), on the same
four scenarios. The only difference is which tree's `bin/` is executed:

* **BEFORE** = base commit `d22318e` (`git archive d22318e` into a scratch tree)
* **AFTER**  = this branch, head `7b6f021`

Scenario B is the review-round regression case: a surplus column hidden behind
an *empty* TAB-separated column, which `IFS=$'\t' read` collapses.

---

## BEFORE (base commit d22318e)

```
=== A) surplus 5th column (the reported incident shape) ===
############################################################
# scenario: base-A
# tree under test: /tmp/fm-ev/base-tree
# state/.status-presentation-cursor before teardown:
#   -rw-rw-r-- 1 vsole vsole 55 Sep  2 23:10 /tmp/fm-teardown-tests.Ph3YaE/base-A/state/.status-presentation-cursor
#   task-other^Iident-other^I7^I3$
#   task-x1^Iident-x1^I12^I0^Istray$
# $ fm-teardown.sh task-x1
--- exit code: 1
--- stderr:
    (empty)
--- state/.status-presentation-cursor after teardown:
    -rw-rw-r-- 1 vsole vsole 55 Sep  2 23:10 /tmp/fm-teardown-tests.Ph3YaE/base-A/state/.status-presentation-cursor
    task-other^Iident-other^I7^I3$
    task-x1^Iident-x1^I12^I0^Istray$
--- task state files still present (nothing deleted on refusal):
    task-x1.meta

=== B) surplus column hidden behind an EMPTY column (IFS-TAB collapse) ===
############################################################
# scenario: base-B
# tree under test: /tmp/fm-ev/base-tree
# state/.status-presentation-cursor before teardown:
#   -rw-rw-r-- 1 vsole vsole 75 Sep  2 23:10 /tmp/fm-teardown-tests.zQNF0O/base-B/state/.status-presentation-cursor
#   task-other^Iident-other^I7^I3$
#   task-x1^Iident-x1^I12^I0$
#   task-hidden^Iident-h^I7^I^I99$
# $ fm-teardown.sh task-x1
--- exit code: 0
--- stderr:
    (empty)
--- state/.status-presentation-cursor after teardown:
    -rw-rw-r-- 1 vsole vsole 52 Sep  2 23:10 /tmp/fm-teardown-tests.zQNF0O/base-B/state/.status-presentation-cursor
    task-other^Iident-other^I7^I3$
    task-hidden^Iident-h^I7^I99$
--- task state files still present (nothing deleted on refusal):
    home-summary.json

=== C) tolerated legacy 3-field row (pre-d977128), lossless upgrade ===
############################################################
# scenario: base-C
# tree under test: /tmp/fm-ev/base-tree
# state/.status-presentation-cursor before teardown:
#   -rw-rw-r-- 1 vsole vsole 71 Sep  2 23:10 /tmp/fm-teardown-tests.6v3Nd4/base-C/state/.status-presentation-cursor
#   task-other^Iident-other^I7^I3$
#   task-x1^Iident-x1^I12^I0$
#   task-legacy^Iident-l^I7$
# $ fm-teardown.sh task-x1
--- exit code: 0
--- stderr:
    (empty)
--- state/.status-presentation-cursor after teardown:
    -rw-rw-r-- 1 vsole vsole 51 Sep  2 23:10 /tmp/fm-teardown-tests.6v3Nd4/base-C/state/.status-presentation-cursor
    task-other^Iident-other^I7^I3$
    task-legacy^Iident-l^I7^I0$
--- task state files still present (nothing deleted on refusal):
    home-summary.json

=== D) manifest itself unusable: symlink ===
############################################################
# scenario: base-D
# tree under test: /tmp/fm-ev/base-tree
# state/.status-presentation-cursor before teardown:
#   lrwxrwxrwx 1 vsole vsole 46 Sep  2 23:10 /tmp/fm-teardown-tests.CG6C4d/base-D/state/.status-presentation-cursor -> /tmp/fm-teardown-tests.CG6C4d/base-D/elsewhere
#   task-x1^Iident-x1^I12^I0$
# $ fm-teardown.sh task-x1
--- exit code: 1
--- stderr:
    (empty)
--- state/.status-presentation-cursor after teardown:
    lrwxrwxrwx 1 vsole vsole 46 Sep  2 23:10 /tmp/fm-teardown-tests.CG6C4d/base-D/state/.status-presentation-cursor -> /tmp/fm-teardown-tests.CG6C4d/base-D/elsewhere
    task-x1^Iident-x1^I12^I0$
--- task state files still present (nothing deleted on refusal):
    task-x1.meta

```

Summary of the BEFORE column:

| scenario | exit | stderr | manifest afterwards |
|---|---|---|---|
| A surplus 5th column | 1 | **empty** — the reported silent failure | untouched |
| B surplus column behind an empty column | 0 | empty | **silently rewritten, one column lost**: `task-hidden ident-h 7 <empty> 99` became `task-hidden ident-h 7 99` |
| C legacy 3-field row | 0 | empty | upgraded to 4 fields |
| D manifest is a symlink | 1 | **empty** | untouched |

## AFTER (this branch, 7b6f021)

```
=== A) surplus 5th column (the reported incident shape) ===
############################################################
# scenario: fixed-A
# tree under test: /home/vsole/.no-mistakes/worktrees/79d399e178b3/01M1HWN883AKA3M7X10WC7BHPR
# state/.status-presentation-cursor before teardown:
#   -rw-rw-r-- 1 vsole vsole 55 Sep  2 23:10 /tmp/fm-teardown-tests.hcSZ13/fixed-A/state/.status-presentation-cursor
#   task-other^Iident-other^I7^I3$
#   task-x1^Iident-x1^I12^I0^Istray$
# $ fm-teardown.sh task-x1
--- exit code: 1
--- stderr:
    error: /tmp/fm-teardown-tests.hcSZ13/fixed-A/state/.status-presentation-cursor:2: malformed status-presentation-cursor row: unexpected extra field (5 fields) (expected 4 TAB-separated fields: task, ident, offset, backstop, where offset and backstop are decimal byte counts of at most 18 digits without a leading zero): task-x1	ident-x1	12	0	stray
--- state/.status-presentation-cursor after teardown:
    -rw-rw-r-- 1 vsole vsole 55 Sep  2 23:10 /tmp/fm-teardown-tests.hcSZ13/fixed-A/state/.status-presentation-cursor
    task-other^Iident-other^I7^I3$
    task-x1^Iident-x1^I12^I0^Istray$
--- task state files still present (nothing deleted on refusal):
    task-x1.meta

=== B) surplus column hidden behind an EMPTY column (IFS-TAB collapse) ===
############################################################
# scenario: fixed-B
# tree under test: /home/vsole/.no-mistakes/worktrees/79d399e178b3/01M1HWN883AKA3M7X10WC7BHPR
# state/.status-presentation-cursor before teardown:
#   -rw-rw-r-- 1 vsole vsole 75 Sep  2 23:10 /tmp/fm-teardown-tests.Yv0PmH/fixed-B/state/.status-presentation-cursor
#   task-other^Iident-other^I7^I3$
#   task-x1^Iident-x1^I12^I0$
#   task-hidden^Iident-h^I7^I^I99$
# $ fm-teardown.sh task-x1
--- exit code: 1
--- stderr:
    error: /tmp/fm-teardown-tests.Yv0PmH/fixed-B/state/.status-presentation-cursor:3: malformed status-presentation-cursor row: unexpected extra field (5 fields) (expected 4 TAB-separated fields: task, ident, offset, backstop, where offset and backstop are decimal byte counts of at most 18 digits without a leading zero): task-hidden	ident-h	7		99
--- state/.status-presentation-cursor after teardown:
    -rw-rw-r-- 1 vsole vsole 75 Sep  2 23:10 /tmp/fm-teardown-tests.Yv0PmH/fixed-B/state/.status-presentation-cursor
    task-other^Iident-other^I7^I3$
    task-x1^Iident-x1^I12^I0$
    task-hidden^Iident-h^I7^I^I99$
--- task state files still present (nothing deleted on refusal):
    task-x1.meta

=== C) tolerated legacy 3-field row (pre-d977128), lossless upgrade ===
############################################################
# scenario: fixed-C
# tree under test: /home/vsole/.no-mistakes/worktrees/79d399e178b3/01M1HWN883AKA3M7X10WC7BHPR
# state/.status-presentation-cursor before teardown:
#   -rw-rw-r-- 1 vsole vsole 71 Sep  2 23:10 /tmp/fm-teardown-tests.IivmFr/fixed-C/state/.status-presentation-cursor
#   task-other^Iident-other^I7^I3$
#   task-x1^Iident-x1^I12^I0$
#   task-legacy^Iident-l^I7$
# $ fm-teardown.sh task-x1
--- exit code: 0
--- stderr:
    (empty)
--- state/.status-presentation-cursor after teardown:
    -rw-rw-r-- 1 vsole vsole 51 Sep  2 23:10 /tmp/fm-teardown-tests.IivmFr/fixed-C/state/.status-presentation-cursor
    task-other^Iident-other^I7^I3$
    task-legacy^Iident-l^I7^I0$
--- task state files still present (nothing deleted on refusal):
    home-summary.json

=== D) manifest itself unusable: symlink ===
############################################################
# scenario: fixed-D
# tree under test: /home/vsole/.no-mistakes/worktrees/79d399e178b3/01M1HWN883AKA3M7X10WC7BHPR
# state/.status-presentation-cursor before teardown:
#   lrwxrwxrwx 1 vsole vsole 47 Sep  2 23:10 /tmp/fm-teardown-tests.Jtfc3S/fixed-D/state/.status-presentation-cursor -> /tmp/fm-teardown-tests.Jtfc3S/fixed-D/elsewhere
#   task-x1^Iident-x1^I12^I0$
# $ fm-teardown.sh task-x1
--- exit code: 1
--- stderr:
    error: /tmp/fm-teardown-tests.Jtfc3S/fixed-D/state/.status-presentation-cursor: unusable status-presentation-cursor manifest: not a readable regular file (expected TAB-separated rows: task, ident, offset, backstop)
--- state/.status-presentation-cursor after teardown:
    lrwxrwxrwx 1 vsole vsole 47 Sep  2 23:10 /tmp/fm-teardown-tests.Jtfc3S/fixed-D/state/.status-presentation-cursor -> /tmp/fm-teardown-tests.Jtfc3S/fixed-D/elsewhere
    task-x1^Iident-x1^I12^I0$
--- task state files still present (nothing deleted on refusal):
    task-x1.meta

```

Summary of the AFTER column:

| scenario | exit | stderr | manifest afterwards |
|---|---|---|---|
| A surplus 5th column | 1 | names file, **line 2**, reason `unexpected extra field (5 fields)`, expected format, and the offending row | untouched |
| B surplus column behind an empty column | 1 | names file, **line 3**, same reason — the hidden column is now seen | untouched, **no silent data loss** |
| C legacy 3-field row | 0 | quiet, as before | `task-legacy ident-l 7` upgraded losslessly to `task-legacy ident-l 7 0` |
| D manifest is a symlink | 1 | file-level diagnostic: `unusable status-presentation-cursor manifest: not a readable regular file` | untouched |

In every refusing scenario the pre-existing safe behavior holds: the manifest is
neither rewritten nor deleted.

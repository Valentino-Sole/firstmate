#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2016
# Behavior tests for the Klartext-Uebernahme isolation PreToolUse seatbelt
# (docs/klartext-uebernahme-isolation.md).
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

fm_git_identity fmtest fmtest@example.invalid
TMP_ROOT=$(fm_test_tmproot fm-klartext-uebernahme-pretool-check)

install_scripts() {
  local dir=$1
  mkdir -p "$dir/bin"
  cp "$ROOT/bin/fm-klartext-uebernahme-pretool-check.sh" "$dir/bin/fm-klartext-uebernahme-pretool-check.sh"
  cp "$ROOT/bin/fm-hook-host-lib.sh" "$dir/bin/fm-hook-host-lib.sh"
  cp "$ROOT/bin/fm-klartext-uebernahme-command-policy.mjs" "$dir/bin/fm-klartext-uebernahme-command-policy.mjs"
  cp "$ROOT/bin/fm-arm-command-policy.mjs" "$dir/bin/fm-arm-command-policy.mjs"
  chmod +x "$dir/bin/fm-klartext-uebernahme-pretool-check.sh" "$dir/bin/fm-klartext-uebernahme-command-policy.mjs"
}

make_fixture() {
  local dir=$1
  git init -q "$dir"
  git -C "$dir" commit -q --allow-empty -m init
  : > "$dir/AGENTS.md"
  install_scripts "$dir"
  printf '%s\n' "$dir"
}

PRIMARY=$(make_fixture "$TMP_ROOT/primary")
CHECK="$PRIMARY/bin/fm-klartext-uebernahme-pretool-check.sh"

MATRIX_IDS=()
MATRIX_EXPECTED=()
MATRIX_COMMANDS=()

matrix_case() {
  MATRIX_IDS+=("$1")
  MATRIX_EXPECTED+=("$2")
  MATRIX_COMMANDS+=("$3")
}

matrix_case B01 deny 'rm -rf /home/vsole/uebernahme-arbeits-pc/claude-mem'
matrix_case B02 deny 'mv /home/vsole/uebernahme-arbeits-pc /tmp/weg'
matrix_case B03 deny 'cp -r /home/vsole/uebernahme-arbeits-pc/claude-mem ~/.claude-mem/'
matrix_case B04 deny 'rsync -a /home/vsole/uebernahme-arbeits-pc/ ~/.claude-mem/'
matrix_case B05 deny 'chmod 777 /home/vsole/uebernahme-arbeits-pc'
matrix_case B06 deny 'sqlite3 /home/vsole/uebernahme-arbeits-pc/claude-mem/claude-mem.db "ATTACH DATABASE x AS y"'
matrix_case B07 deny 'rclone copy /home/vsole/uebernahme-arbeits-pc gdrive:backup'

matrix_case A01 allow 'cat /home/vsole/uebernahme-arbeits-pc/LIESMICH.md'
matrix_case A02 allow 'rg foo /home/vsole/uebernahme-arbeits-pc/_index/prompts.tsv'
matrix_case A03 allow 'bin/fm-klartext-uebernahme-index.sh --paths'
matrix_case A04 allow '/home/vsole/uebernahme-arbeits-pc/suche.sh jarvis'
matrix_case A05 allow 'sqlite3 /home/vsole/uebernahme-arbeits-pc/claude-mem/claude-mem.db "SELECT COUNT(*) FROM prompts"'
matrix_case A06 allow 'git status'
matrix_case A07 allow 'ls /tmp'

test_matrix() {
  local i id expect cmd out rc
  for i in "${!MATRIX_IDS[@]}"; do
    id=${MATRIX_IDS[$i]}
    expect=${MATRIX_EXPECTED[$i]}
    cmd=${MATRIX_COMMANDS[$i]}
    out=$("$CHECK" --command "$cmd" 2>&1); rc=$?
    case "$expect" in
      deny)
        [ "$rc" -eq 2 ] || fail "$id expected deny rc=2, got rc=$rc out=$out"
        assert_contains "$out" "klartext-uebernahme" "$id missing stable reason family"
        ;;
      allow)
        [ "$rc" -eq 0 ] || fail "$id expected allow rc=0, got rc=$rc out=$out"
        [ -z "$out" ] || fail "$id expected silent allow, got out=$out"
        ;;
      *)
        fail "unknown matrix expectation: $expect"
        ;;
    esac
  done
  pass "fm-klartext-uebernahme-pretool-check.sh: matrix ${#MATRIX_IDS[@]} cases"
}

test_escape_hatch() {
  local out rc
  out=$(FM_ALLOW_KLARTEXT_UEBERNAHME_MUTATION=1 "$CHECK" --command 'rm -rf /home/vsole/uebernahme-arbeits-pc' 2>&1); rc=$?
  [ "$rc" -eq 0 ] || fail "escape hatch should allow with rc=0, got rc=$rc out=$out"
  [ -z "$out" ] || fail "escape hatch should stay silent, got out=$out"
  pass "fm-klartext-uebernahme-pretool-check.sh: FM_ALLOW_KLARTEXT_UEBERNAHME_MUTATION=1 bypasses deny"
}

test_non_firstmate_inert() {
  local dir out rc
  dir="$TMP_ROOT/non-firstmate"
  mkdir -p "$dir/bin"
  install_scripts "$dir"
  out=$("$dir/bin/fm-klartext-uebernahme-pretool-check.sh" --command 'rm -rf /home/vsole/uebernahme-arbeits-pc' 2>&1); rc=$?
  [ "$rc" -eq 0 ] || fail "non-firstmate fixture should be inert, got rc=$rc out=$out"
  [ -z "$out" ] || fail "non-firstmate fixture should stay silent, got out=$out"
  pass "fm-klartext-uebernahme-pretool-check.sh: inert outside AGENTS.md+bin firstmate repo"
}

make_child_worktree_fixture() {
  local base=$1 dir=$2
  fm_git_worktree "$base" "$dir" fm/klartext-guard-test
  : > "$dir/AGENTS.md"
  install_scripts "$dir"
  printf '%s\n' "$dir"
}

test_child_worktree_active() {
  local base child out rc
  base=$(make_fixture "$TMP_ROOT/worktree-base")
  child=$(make_child_worktree_fixture "$base" "$TMP_ROOT/worktree-child")
  out=$("$child/bin/fm-klartext-uebernahme-pretool-check.sh" --command 'rm -rf /home/vsole/uebernahme-arbeits-pc' 2>&1); rc=$?
  [ "$rc" -eq 2 ] || fail "linked worktree should still deny, got rc=$rc out=$out"
  pass "fm-klartext-uebernahme-pretool-check.sh: active in crewmate-shaped worktree"
}

test_policy_owner_direct() {
  local out
  out=$(node "$ROOT/bin/fm-klartext-uebernahme-command-policy.mjs" \
    --command 'cp /home/vsole/uebernahme-arbeits-pc/x ~/.claude-mem/y' 2>&1) \
    || fail "policy owner direct invocation failed: $out"
  assert_contains "$out" "deny" "policy owner did not deny merge-shaped command"
  assert_contains "$out" "klartext-uebernahme-merge" "policy owner missing merge code"
  pass "fm-klartext-uebernahme-command-policy.mjs: direct merge deny"
}

test_index_helper_paths() {
  local out
  out=$("$ROOT/bin/fm-klartext-uebernahme-index.sh" --paths 2>&1) \
    || fail "index helper --paths failed: $out"
  assert_contains "$out" "/home/vsole/uebernahme-arbeits-pc/_index/UEBERSICHT.md" \
    "index helper lost overview path"
  assert_contains "$out" "isolated_root=/home/vsole/uebernahme-arbeits-pc" \
    "index helper lost isolated_root"
  assert_contains "$out" "search_helper=/home/vsole/uebernahme-arbeits-pc/suche.sh" \
    "index helper lost search helper path"
  pass "fm-klartext-uebernahme-index.sh: --paths prints authoritative entry points"
}

test_harness_wiring() {
  assert_grep 'fm-klartext-uebernahme-pretool-check.sh' "$ROOT/.claude/settings.json" \
    "Claude settings missing klartext guard hook"
  assert_grep 'fm-klartext-uebernahme-pretool-check.sh' "$ROOT/.cursor/hooks.json" \
    "Cursor hooks missing klartext guard hook"
  assert_grep 'fm-klartext-uebernahme-pretool-check.sh' "$ROOT/.codex/hooks.json" \
    "Codex hooks missing klartext guard hook"
  assert_grep 'fm-klartext-uebernahme-pretool-check.sh' "$ROOT/.grok/hooks/fm-klartext-uebernahme-check.json" \
    "Grok hook missing klartext guard registration"
  assert_present "$ROOT/.opencode/plugins/fm-klartext-uebernahme-check.js" \
    "OpenCode plugin missing klartext guard registration"
  assert_grep 'fm-klartext-uebernahme-pretool-check.sh' "$ROOT/.pi/extensions/fm-primary-turnend-guard.ts" \
    "Pi extension missing klartext guard call"
  assert_grep 'klartext-uebernahme-isolation.md' "$ROOT/AGENTS.md" \
    "AGENTS.md missing klartext isolation pointer"
  pass "klartext isolation guard is wired through tracked harness registrations"
}

test_lint_clean() {
  local out
  out=$("$ROOT/bin/fm-lint.sh" "$ROOT/bin/fm-klartext-uebernahme-pretool-check.sh" \
    "$ROOT/bin/fm-klartext-uebernahme-index.sh" 2>&1) \
    || fail "klartext guard scripts are not lint-clean: $out"
  pass "klartext guard shell scripts are clean under bin/fm-lint.sh"
}

test_matrix
test_escape_hatch
test_non_firstmate_inert
test_child_worktree_active
test_policy_owner_direct
test_index_helper_paths
test_harness_wiring
test_lint_clean

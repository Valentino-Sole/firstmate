#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2016
# Behavior tests for the primary-checkout-guard PreToolUse seatbelt
# (docs/primary-checkout-guard.md).
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

fm_git_identity fmtest fmtest@example.invalid
TMP_ROOT=$(fm_test_tmproot fm-primary-checkout-pretool-check)

install_scripts() {
  local dir=$1
  mkdir -p "$dir/bin"
  cp "$ROOT/bin/fm-primary-checkout-pretool-check.sh" "$dir/bin/fm-primary-checkout-pretool-check.sh"
  cp "$ROOT/bin/fm-hook-host-lib.sh" "$dir/bin/fm-hook-host-lib.sh"
  cp "$ROOT/bin/fm-primary-checkout-command-policy.mjs" "$dir/bin/fm-primary-checkout-command-policy.mjs"
  cp "$ROOT/bin/fm-arm-command-policy.mjs" "$dir/bin/fm-arm-command-policy.mjs"
  chmod +x "$dir/bin/fm-primary-checkout-pretool-check.sh" "$dir/bin/fm-primary-checkout-command-policy.mjs"
}

make_primary_fixture() {
  local dir=$1
  git init -q "$dir"
  git -C "$dir" commit -q --allow-empty -m init
  : > "$dir/AGENTS.md"
  install_scripts "$dir"
  printf '%s\n' "$dir"
}

make_child_worktree_fixture() {
  local base=$1 dir=$2
  fm_git_worktree "$base" "$dir" fm/primary-checkout-guard
  : > "$dir/AGENTS.md"
  install_scripts "$dir"
  printf '%s\n' "$dir"
}

PRIMARY=$(make_primary_fixture "$TMP_ROOT/primary")
CHECK="$PRIMARY/bin/fm-primary-checkout-pretool-check.sh"

MATRIX_IDS=()
MATRIX_EXPECTED=()
MATRIX_COMMANDS=()

matrix_case() {
  MATRIX_IDS+=("$1")
  MATRIX_EXPECTED+=("$2")
  MATRIX_COMMANDS+=("$3")
}

matrix_case B01 deny 'git reset --hard'
matrix_case B02 deny 'git reset HEAD~1'
matrix_case B03 deny 'git stash push -m wip'
matrix_case B04 deny 'git stash pop'
matrix_case B05 deny 'git clean -fd'
matrix_case B06 deny 'git restore .'
matrix_case B07 deny 'git checkout -- AGENTS.md'
matrix_case B08 deny 'git checkout .'
matrix_case B09 deny 'rm -rf .agents/skills/crew-knowledge'
matrix_case B10 deny 'mv .agents/skills/crew-knowledge /tmp/ck'
matrix_case B11 deny 'git add .agents/skills/crew-knowledge'
matrix_case B12 deny 'git commit -m x -- .agents/skills/crew-knowledge'

matrix_case A01 allow 'git status'
matrix_case A02 allow 'git diff'
matrix_case A03 allow 'git checkout main'
matrix_case A04 allow 'git -C /tmp/other reset --hard'
matrix_case A05 allow 'git -C projects/foo reset --hard'
matrix_case A06 allow 'cat .agents/skills/crew-knowledge/SKILL.md'
matrix_case A07 allow 'git commit -m "shared tracked change"'
matrix_case A08 allow 'git log -1 --oneline'

test_matrix() {
  local i id expect cmd out rc
  for i in "${!MATRIX_IDS[@]}"; do
    id=${MATRIX_IDS[$i]}
    expect=${MATRIX_EXPECTED[$i]}
    cmd=${MATRIX_COMMANDS[$i]}
    out=$("$CHECK" --command "$cmd" 2>&1); rc=$?
    case "$expect" in
      deny)
        [ "$rc" -eq 2 ] || fail "$id: expected deny, got rc=$rc out=$out"
        assert_contains "$out" "permissionDecision\":\"deny" "$id: missing Claude deny object"
        ;;
      allow)
        [ "$rc" -eq 0 ] || fail "$id: expected allow, got rc=$rc out=$out"
        [ -z "$out" ] || fail "$id: allow produced output: $out"
        ;;
      *) fail "unknown expectation: $expect" ;;
    esac
  done
  pass "primary-checkout guard matrix: ${#MATRIX_IDS[@]} cases"
}

test_child_worktree_inert() {
  local base child out rc
  base=$(make_primary_fixture "$TMP_ROOT/base-inert")
  child=$(make_child_worktree_fixture "$base" "$TMP_ROOT/child-inert")
  out=$("$child/bin/fm-primary-checkout-pretool-check.sh" --command 'git reset --hard' 2>&1); rc=$?
  [ "$rc" -eq 0 ] || fail "child worktree guard blocked reset: rc=$rc out=$out"
  [ -z "$out" ] || fail "child worktree guard produced output: $out"
  pass "primary-checkout guard is inert in a linked task worktree"
}

test_cursor_shape() {
  local out rc
  out=$("$CHECK" --cursor --command 'git reset --hard' 2>/dev/null); rc=$?
  [ "$rc" -eq 0 ] || fail "cursor deny must exit 0, got $rc"
  assert_contains "$out" '"permission":"deny"' "cursor deny missing permission field"
  assert_contains "$out" 'primary-git-reset' "cursor deny missing reason code"
  pass "primary-checkout guard renders Cursor deny shape"
}

test_claude_shape() {
  local out rc
  out=$("$CHECK" --claude --command 'git stash push' 2>&1); rc=$?
  [ "$rc" -eq 2 ] || fail "claude deny must exit 2, got $rc"
  assert_contains "$out" 'primary-git-stash' "claude deny missing reason code"
  pass "primary-checkout guard renders Claude deny shape"
}

test_tracked_wiring() {
  assert_grep 'fm-primary-checkout-pretool-check.sh' "$ROOT/.claude/settings.json" \
    "Claude settings missing primary-checkout hook"
  assert_grep 'fm-primary-checkout-pretool-check.sh' "$ROOT/.cursor/hooks.json" \
    "Cursor hooks missing primary-checkout hook"
  assert_grep 'fm-primary-checkout-pretool-check.sh' "$ROOT/.codex/hooks.json" \
    "Codex hooks missing primary-checkout hook"
  assert_grep 'fm-primary-checkout-pretool-check.sh' "$ROOT/.grok/hooks/fm-primary-checkout-check.json" \
    "Grok hooks missing primary-checkout hook"
  assert_grep 'fm-primary-checkout-pretool-check.sh' "$ROOT/.pi/extensions/fm-primary-turnend-guard.ts" \
    "Pi extension missing primary-checkout hook"
  assert_present "$ROOT/.opencode/plugins/fm-primary-checkout-check.js" \
    "OpenCode plugin missing for primary-checkout guard"
  pass "primary-checkout guard is wired into tracked harness adapters"
}

test_agents_hard_rule() {
  assert_grep 'Never reset or touch crew-knowledge on the primary checkout' "$ROOT/AGENTS.md" \
    "AGENTS.md missing hard rule 6"
  assert_grep 'fm-primary-checkout-pretool-check.sh' "$ROOT/AGENTS.md" \
    "AGENTS.md missing primary-checkout guard pointer"
  pass "AGENTS.md hard rule 6 documents the primary-checkout guard"
}

test_lint_clean() {
  local out
  out=$("$ROOT/bin/fm-lint.sh" "$ROOT/bin/fm-primary-checkout-pretool-check.sh" 2>&1) \
    || fail "transport script is not lint-clean: $out"
  pass "bin/fm-primary-checkout-pretool-check.sh is clean under bin/fm-lint.sh"
}

test_matrix
test_child_worktree_inert
test_cursor_shape
test_claude_shape
test_tracked_wiring
test_agents_hard_rule
test_lint_clean

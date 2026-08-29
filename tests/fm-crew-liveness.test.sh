#!/usr/bin/env bash
# Portable tests for Pi-primary cursor-grok crewmate recovery at session start.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
# shellcheck source=/dev/null
. "$ROOT/bin/fm-backend.sh"
# shellcheck source=/dev/null
. "$ROOT/bin/fm-crew-liveness-lib.sh"

BASE_PATH=${FM_TEST_BASE_PATH:-/usr/bin:/bin:/usr/sbin:/sbin}
TMP_ROOT=$(fm_test_tmproot fm-crew-liveness)

make_liveness_tmux() {
  local dir=$1 fakebin
  fakebin=$(fm_fakebin "$dir")
  cat > "$fakebin/tmux" <<'SH'
#!/usr/bin/env bash
set -u
mode=${FM_TEST_PANE_CMD:-zsh}
case "${1:-}" in
  display-message)
    for a in "$@"; do
      case "$a" in
        *pane_current_command*)
          case "$mode" in
            missing) printf '%s\n' node; exit 0 ;;
            unreadable) exit 1 ;;
            *) printf '%s\n' "$mode"; exit 0 ;;
          esac
          ;;
      esac
    done
    exit 0
    ;;
  list-windows)
    case "$mode" in
      missing) printf '%s\n' main; exit 0 ;;
      unreadable) exit 1 ;;
      *) printf '%s\n' fm-crew1; exit 0 ;;
    esac
    ;;
  kill-window) exit 0 ;;
  has-session) exit 0 ;;
esac
exit 0
SH
  chmod +x "$fakebin/tmux"
  printf '%s\n' "$fakebin"
}

new_world() {
  local name=$1 w
  w="$TMP_ROOT/$name"
  mkdir -p "$w/home/state" "$w/home/data" "$w/home/config"
  touch "$w/home/state/.last-watcher-beat"
  printf '%s\n' "$w"
}

add_cursor_grok_crew() {
  local w=$1 id=$2 window=$3 model=${4:-cursor-grok-4.5-high}
  mkdir -p "$w/home/data/$id" "$w/wt-$id"
  printf 'brief body\n' > "$w/home/data/$id/brief.md"
  {
    printf 'window=%s\n' "$window"
    printf 'kind=ship\n'
    printf 'harness=cursor\n'
    printf 'model=%s\n' "$model"
    printf 'project=testproj\n'
    printf 'worktree=%s/wt-%s\n' "$w" "$id"
    printf 'backend=tmux\n'
  } > "$w/home/state/$id.meta"
}

install_fake_bins() {
  local w=$1
  local fakebin
  fakebin=$(fm_fakebin "$w")
  cat > "$fakebin/fm-crew-state.sh" <<'SH'
#!/usr/bin/env bash
printf 'state: working · source: status-log · crew is active\n'
SH
  cat > "$fakebin/fm-control.sh" <<'SH'
#!/usr/bin/env bash
printf 'relaunched %s\n' "$1" >&2
exit 0
SH
  chmod +x "$fakebin/fm-crew-state.sh" "$fakebin/fm-control.sh"
  printf '%s\n' "$fakebin"
}

run_bootstrap() {
  local tmuxfb=$1 fb=$2 home=$3 pane_cmd=$4; shift 4
  PATH="$tmuxfb:$fb:$BASE_PATH" TMUX='' FM_BACKEND=tmux FM_HOME="$home" \
    FM_BOOTSTRAP_NETWORK=skip \
    FM_TEST_PANE_CMD="$pane_cmd" \
    FM_CREW_LIVENESS_PRIMARY_HARNESS=pi \
    FM_CREW_LIVENESS_CREW_STATE_BIN="$fb/fm-crew-state.sh" \
    FM_CREW_LIVENESS_CONTROL_BIN="$fb/fm-control.sh" \
    env "$@" "$ROOT/bin/fm-bootstrap.sh" 2>&1
}

test_cursor_grok_selector() {
  local w meta
  w=$(new_world selector)
  add_cursor_grok_crew "$w" crew1 firstmate:fm-crew1
  meta="$w/home/state/crew1.meta"
  fm_crew_liveness_is_cursor_grok_crew "$meta" || fail "cursor-grok crew should match"
  printf 'harness=claude\n' > "$meta"
  fm_crew_liveness_is_cursor_grok_crew "$meta" && fail "claude crew should not match"
  add_cursor_grok_crew "$w" crew2 firstmate:fm-crew2 composer-2.5
  meta="$w/home/state/crew2.meta"
  fm_crew_liveness_is_cursor_grok_crew "$meta" && fail "non-grok cursor model should not match"
  pass "cursor-grok crew selector matches harness=cursor and cursor-grok* models only"
}

test_sweep_skips_non_pi_primary() {
  local w fb tmuxfb out
  w=$(new_world non-pi)
  add_cursor_grok_crew "$w" crew1 firstmate:fm-crew1
  fb=$(install_fake_bins "$w")
  tmuxfb=$(make_liveness_tmux "$w")
  out=$(PATH="$tmuxfb:$fb:$BASE_PATH" TMUX='' FM_BACKEND=tmux FM_HOME="$w/home" \
    FM_TEST_PANE_CMD=zsh FM_CREW_LIVENESS_PRIMARY_HARNESS=codex \
    FM_CREW_LIVENESS_CREW_STATE_BIN="$fb/fm-crew-state.sh" \
    FM_CREW_LIVENESS_CONTROL_BIN="$fb/fm-control.sh" \
    "$ROOT/bin/fm-bootstrap.sh" 2>&1)
  assert_not_contains "$out" "CREW_LIVENESS:" "non-pi primary should not run crew recovery"
  assert_not_contains "$out" "BOOTSTRAP_INFO: crew crew1 relaunched" \
    "non-pi primary must not relaunch cursor-grok crews"
  pass "crew liveness sweep is gated to pi and pi-signed primaries"
}

test_sweep_relaunches_confirmed_dead_cursor_grok_crew() {
  local w fb tmuxfb out
  w=$(new_world dead-crew)
  add_cursor_grok_crew "$w" crew1 firstmate:fm-crew1
  tmuxfb=$(make_liveness_tmux "$w")
  fb=$(install_fake_bins "$w")

  out=$(run_bootstrap "$tmuxfb" "$fb" "$w/home" zsh)

  assert_contains "$out" "BOOTSTRAP_INFO: crew crew1 relaunched" \
    "a dead cursor-grok crew should be relaunched silently as bootstrap info"
  assert_not_contains "$out" "CREW_LIVENESS: crew crew1: relaunch failed" \
    "a successful relaunch must not report failure"
  pass "sweep: a confirmed-dead cursor-grok crew is relaunched on pi-primary session start"
}

test_sweep_leaves_alive_cursor_grok_crew_untouched() {
  local w fb tmuxfb out
  w=$(new_world alive-crew)
  add_cursor_grok_crew "$w" crew1 firstmate:fm-crew1
  fb=$(install_fake_bins "$w")
  tmuxfb=$(make_liveness_tmux "$w")

  out=$(run_bootstrap "$tmuxfb" "$fb" "$w/home" cursor-agent FM_BOOTSTRAP_VERBOSE_FACTS=1)

  assert_contains "$out" "BOOTSTRAP_INFO: crew crew1 already live" \
    "verbose diagnostics should report an alive cursor-grok crew"
  assert_not_contains "$out" "relaunched" "an alive crew must not be relaunched"
  pass "sweep: an already-live cursor-grok crew stays untouched"
}

test_sweep_skips_terminal_crew() {
  local w fb tmuxfb out
  w=$(new_world terminal-crew)
  add_cursor_grok_crew "$w" crew1 firstmate:fm-crew1
  fb=$(install_fake_bins "$w")
  cat > "$fb/fm-crew-state.sh" <<'SH'
#!/usr/bin/env bash
printf 'state: done · source: status-log · finished earlier\n'
SH
  chmod +x "$fb/fm-crew-state.sh"
  tmuxfb=$(make_liveness_tmux "$w")

  out=$(run_bootstrap "$tmuxfb" "$fb" "$w/home" zsh)

  assert_not_contains "$out" "BOOTSTRAP_INFO: crew crew1 relaunched" \
    "terminal crews must not be relaunched"
  pass "sweep: done or failed cursor-grok crews are not recovered"
}

test_sweep_reports_ambiguous_endpoint() {
  local w fb tmuxfb out
  w=$(new_world ambiguous-crew)
  add_cursor_grok_crew "$w" crew1 firstmate:fm-crew1
  fb=$(install_fake_bins "$w")
  tmuxfb=$(make_liveness_tmux "$w")

  out=$(run_bootstrap "$tmuxfb" "$fb" "$w/home" node)

  assert_contains "$out" "CREW_LIVENESS: crew crew1: skipped: existing endpoint has ambiguous agent process" \
    "ambiguous endpoints must be reported and left alone"
  pass "sweep: ambiguous cursor-grok endpoints never trigger duplicate recovery"
}

test_cursor_grok_selector
test_sweep_skips_non_pi_primary
test_sweep_relaunches_confirmed_dead_cursor_grok_crew
test_sweep_leaves_alive_cursor_grok_crew_untouched
test_sweep_skips_terminal_crew
test_sweep_reports_ambiguous_endpoint

echo "all fm-crew-liveness tests passed"

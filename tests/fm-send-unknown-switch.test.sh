#!/usr/bin/env bash
# tests/fm-send-unknown-switch.test.sh - regression coverage for the
# 2026-09-06 fm-send-stdin-schalter-verschluckt incident (captain directive,
# fm-reparatur-zustellung-calm-leak, Paket A).
#
# Real incident: firstmate called `bin/fm-send.sh <target> --stdin` three
# times (06.09. 10:31, 10:36, 10:59) intending to pipe the actual instruction
# text through stdin, a switch fm-send.sh has never supported. Because an
# unrecognized "--" switch silently fell through to the plain message
# assignment, each call durably recorded the literal four-byte body
# "--stdin" and exited 0 - PR #18's delivery proof correctly confirmed that
# exact (useless) body was on disk, so the loss went undetected at the
# receiving end (checklisten-maat reported three empty deliveries) and
# fm-send never reported a problem.
#
# These tests pin the two-part fix:
#   1. An unrecognized leading "--" switch is refused before any record is
#      written - it is never silently treated as message text - while "--"
#      still explicitly ends option parsing for a message that must itself
#      start with "--".
#   2. An empty message is refused before any record is written, whether
#      empty because of the argument list or in an explicit "" argument.
# Each case is RED without the fix (fm-send exits 0 and durably records a
# bogus or empty body) and GREEN with it (fm-send exits nonzero, names the
# problem, and writes nothing under state/<id>.inbox/).
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SEND="$ROOT/bin/fm-send.sh"

TMP_ROOT=$(fm_test_tmproot fm-send-unknown-switch)
TMP_ROOT=$(cd "$TMP_ROOT" && pwd)

# Stub tmux: enough surface for fm-send's target validation and composer
# pre-check to succeed; logs literal typed text to FM_SEND_LOG. No test here
# expects a successful send to reach the ring, but a stub that answers cleanly
# keeps a failing assertion attributable to the fix under test, not the stub.
make_stubs() {  # <dir> -> echoes fakebin dir
  local dir=$1 fb="$1/fakebin"
  mkdir -p "$fb"
  cat > "$fb/tmux" <<'SH'
#!/usr/bin/env bash
set -u
case "${1:-}" in
  send-keys)
    shift
    literal=0
    while [ $# -gt 0 ]; do
      case "$1" in
        -t) shift 2 ;;
        -l) literal=1; shift ;;
        *) break ;;
      esac
    done
    if [ "$literal" = 1 ]; then
      printf '%s\n' "${1:-}" >> "$FM_SEND_LOG"
    fi
    exit 0 ;;
  display-message)
    for a in "$@"; do case "$a" in *cursor_y*) printf '1\n'; exit 0 ;; esac; done
    printf 'fakepane\n'; exit 0 ;;
  capture-pane)
    printf '╭────╮\n│    │\n╰────╯\n'
    exit 0 ;;
  list-windows) exit 0 ;;
esac
exit 0
SH
  chmod +x "$fb/tmux"
  cat > "$fb/sleep" <<'SH'
#!/usr/bin/env bash
exit 0
SH
  chmod +x "$fb/sleep"
  printf '%s\n' "$fb"
}

setup_case() {  # <name> -> echoes case dir with home/state + t1 meta
  local name=$1 dir
  dir="$TMP_ROOT/$name"
  mkdir -p "$dir/home/state"
  make_stubs "$dir" >/dev/null
  fm_write_meta "$dir/home/state/t1.meta" "window=sess:fm-t1" "kind=ship" "harness=claude"
  printf '%s\n' "$dir"
}

run_send() {  # <case-dir> <err-file> -- <fm-send args...>
  local dir=$1 err=$2
  shift 2
  [ "${1:-}" = "--" ] && shift
  : > "$dir/send.log"
  env PATH="$dir/fakebin:$PATH" \
    FM_ROOT_OVERRIDE="$dir/home" FM_HOME="$dir/home" FM_SEND_LOG="$dir/send.log" \
    FM_SEND_SETTLE=0 \
    "$SEND" "$@" >/dev/null 2>"$err"
}

record_body() {  # <record>
  bash -c '. "$1"; fm_task_inbox_body "$2"' _ "$ROOT/bin/fm-task-inbox-lib.sh" "$1"
}

# Case (i): the actual historical call - an unrecognized switch with no
# separate message text at all.
test_unrecognized_switch_without_text_is_refused() {
  local dir err rc
  dir=$(setup_case stdin-no-text); err="$dir/send.err"
  run_send "$dir" "$err" -- t1 --stdin; rc=$?
  expect_code 1 "$rc" "fm-send must refuse an unrecognized --stdin switch with no text, not silently record it"
  assert_contains "$(cat "$err")" "unknown switch" "the refusal should name the unrecognized switch"
  assert_contains "$(cat "$err")" "--stdin" "the refusal should name the exact switch it refused"
  [ ! -e "$dir/home/state/t1.inbox/001.msg" ] || fail "the historical bug must not durably record a bogus '--stdin' body"
  [ ! -s "$dir/send.log" ] || fail "a refused send must never reach the terminal"
  pass "fm-send: an unrecognized switch with no separate text is refused before any record is written"
}

# Case (ii): the record the historical bug actually produced - a body
# containing only the swallowed switch name - must never come to exist. This
# drives the same real call shape with an explicit trailing empty argument
# (the shape a caller piping empty stdin through a wrapper could produce) and
# confirms no such record is left behind either.
test_bare_switch_name_never_becomes_a_recorded_body() {
  local dir err rc f body
  dir=$(setup_case stdin-empty-arg); err="$dir/send.err"
  run_send "$dir" "$err" -- t1 --stdin ""; rc=$?
  expect_code 1 "$rc" "an unrecognized switch followed only by an empty argument must still be refused"
  [ ! -d "$dir/home/state/t1.inbox" ] || {
    for f in "$dir/home/state/t1.inbox"/*.msg; do
      [ -e "$f" ] || continue
      body=$(record_body "$f")
      [ "$body" != "--stdin" ] || fail "a record whose body is only the switch name '--stdin' must never be written: $f"
    done
  }
  pass "fm-send: a record body of only the swallowed switch name is never produced"
}

# The escape hatch: a literal "--" still lets a caller send text that must
# itself start with "--", so the fix does not remove real functionality.
test_literal_message_starting_with_dashdash_still_sendable_via_marker() {
  local dir err rc body
  dir=$(setup_case escape-hatch); err="$dir/send.err"
  run_send "$dir" "$err" -- t1 -- --stdin; rc=$?
  expect_code 0 "$rc" "a literal '--stdin' message preceded by the '--' end-of-options marker should still send"
  body=$(record_body "$dir/home/state/t1.inbox/001.msg")
  [ "$body" = "--stdin" ] || fail "the literal message should round-trip exactly: $body"
  pass "fm-send: '--' still ends option parsing for a message that must itself start with --"
}

# Case (iii): an explicitly empty message body.
test_explicit_empty_message_is_refused() {
  local dir err rc
  dir=$(setup_case empty-explicit); err="$dir/send.err"
  run_send "$dir" "$err" -- t1 ""; rc=$?
  expect_code 1 "$rc" "an explicit empty message must be refused, not durably recorded"
  assert_contains "$(cat "$err")" "empty" "the refusal should name the empty message"
  [ ! -e "$dir/home/state/t1.inbox/001.msg" ] || fail "an empty body must never be durably recorded"
  pass "fm-send: an explicit empty message argument is refused before any record is written"
}

# Case (iii, variant): no message argument at all.
test_missing_message_argument_is_refused() {
  local dir err rc
  dir=$(setup_case empty-missing); err="$dir/send.err"
  run_send "$dir" "$err" -- t1; rc=$?
  expect_code 1 "$rc" "a send with no message argument at all must be refused, not durably recorded"
  assert_contains "$(cat "$err")" "empty" "the refusal should name the empty message"
  [ ! -d "$dir/home/state/t1.inbox" ] || fail "a missing message must never create an inbox record"
  pass "fm-send: a send with no message argument is refused before any record is written"
}

# An unrecognized switch is refused the same way even when it happens to
# collide with a resolvable target selector's ordinary steer path, confirming
# the refusal sits ahead of the inbox-plane classification rather than only
# guarding one code path.
test_unrecognized_switch_refused_regardless_of_position_after_resolve_key() {
  local dir err rc
  dir=$(setup_case after-resolve-key); err="$dir/send.err"
  run_send "$dir" "$err" -- t1 --resolve-key some-key --frobnicate; rc=$?
  expect_code 1 "$rc" "an unrecognized switch after --resolve-key must still be refused"
  assert_contains "$(cat "$err")" "unknown switch" "the refusal should name the unrecognized switch"
  [ ! -d "$dir/home/state/t1.inbox" ] || fail "a refused send must not create an inbox record"
  pass "fm-send: an unrecognized switch is refused even when preceded by recognized flags"
}

test_unrecognized_switch_without_text_is_refused
test_bare_switch_name_never_becomes_a_recorded_body
test_literal_message_starting_with_dashdash_still_sendable_via_marker
test_explicit_empty_message_is_refused
test_missing_message_argument_is_refused
test_unrecognized_switch_refused_regardless_of_position_after_resolve_key

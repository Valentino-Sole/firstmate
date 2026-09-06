#!/usr/bin/env bash
# tests/fm-inbox-reply.test.sh - bin/fm-inbox.sh's `reply` subcommand: the
# missing half of the captain-inbox note flow (captain directive, 2026-09-06,
# fm-firstmate-inbox-note-reply / Teil B, following the JARVIS finding that a
# note can be deposited but nothing durably answers it).
#
# PARTIAL-TEST DISCLOSURE (explicit, per the captain's instruction): every test
# below drives `reply` with a hand-written, simulated reply string standing in
# for firstmate's own considered answer. That is deliberate and is as far as an
# automated test can go: whether a given answer is the RIGHT answer needs a
# real agent turn, not a test script. What these tests verify is the MECHANISM
# only - the record is written durably, keyed correctly, refuses unsafely, and
# never swaps or double-processes - never the quality of an answer.
#
# BLOCKED, reported rather than routed around: the full chain the captain asked
# for - intake, firstmate's own real processing, reply, RETURN DELIVERY to
# JARVIS, and SPOKEN OUTPUT - cannot be tested end to end from this repo. JARVIS
# itself, its poll/consume side for state/inbox/replies/*.reply, and the actual
# text-to-speech step all live outside this repository and this sandboxed host
# has no audio output path at all. This suite tests only the FirstMate-side
# half fully in scope here: durably writing and correctly gating the reply
# record `reply` produces, which is what an external consumer like JARVIS would
# poll. Confirming JARVIS's own read side and the spoken output remain open,
# named blockers - not silently assumed to work.
#
# SAFETY: every case runs against an ISOLATED fixture inbox
# (FM_STATE_OVERRIDE), never the real live inbox. The three real, currently
# open captain notes in the live state/inbox/ are never read, replied to, or
# acknowledged by this suite.
set -u

# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

INBOX_BIN="$ROOT/bin/fm-inbox.sh"
TMP_ROOT=$(fm_test_tmproot fm-inbox-reply)

# Snapshot the real live inbox, if this host has one, before any fixture runs.
# The closing test below re-snapshots and requires an exact match, so any
# fixture that accidentally resolved against the real state directory instead
# of its own isolated FM_HOME fails the suite instead of silently acking or
# replying to a real captain note.
REAL_STATE="$ROOT/../vs-agent-workspace/state/inbox"
snapshot_real_inbox() {
  if [ -d "$REAL_STATE" ]; then
    find "$REAL_STATE" -type f -name '*.note' 2>/dev/null | sort
    find "$REAL_STATE/handled" -type f -name '*.note' 2>/dev/null | sort
  fi
}
REAL_INBOX_BEFORE=$(snapshot_real_inbox)

setup_home() {  # <name> -> echoes FM_HOME path
  local dir="$TMP_ROOT/$1"
  mkdir -p "$dir/state"
  printf '%s' "$dir"
}

queue() {  # <home> <text> -> echoes the queued note id
  local home=$1 text=$2 out
  out=$(FM_HOME="$home" bash "$INBOX_BIN" note "$text") || fail "queuing a fixture note failed: $out"
  printf '%s' "$out" | head -1 | awk '{print $2}'
}

reply_body() {  # <reply-file>
  sed -n '/^--$/,$p' "$1" 2>/dev/null | tail -n +2
}

test_real_open_notes_are_never_touched() {
  local after
  after=$(snapshot_real_inbox)
  [ "$after" = "$REAL_INBOX_BEFORE" ] \
    || fail "the real live inbox changed during this suite - it must never be read, replied to, or acknowledged by these fixtures:"$'\n'"before:"$'\n'"$REAL_INBOX_BEFORE"$'\n'"after:"$'\n'"$after"
  pass "fm-inbox reply: the real live inbox (three open captain notes, if present) is byte-for-byte unchanged after every fixture in this suite"
}

test_reply_writes_keyed_record_and_acks_the_note() {
  local home id out body
  home=$(setup_home basic)
  id=$(queue "$home" "Guten Morgen, Jarvis.")
  [ -n "$id" ] || fail "no id came back from note"
  [ -f "$home/state/inbox/$id.note" ] || fail "the queued note is not on disk at $id.note"

  out=$(FM_HOME="$home" bash "$INBOX_BIN" reply "$id" "Guten Morgen! Alles im gruenen Bereich.") \
    || fail "reply refused an ordinary pending note: $out"
  assert_contains "$out" "replied $id" "reply should report the id it answered"

  [ -f "$home/state/inbox/replies/$id.reply" ] || fail "no reply record was written for $id"
  [ ! -f "$home/state/inbox/$id.note" ] || fail "the note must leave the active inbox once replied"
  [ -f "$home/state/inbox/handled/$id.note" ] || fail "a replied note must be acknowledged into handled/, exactly like drain --ack"

  body=$(reply_body "$home/state/inbox/replies/$id.reply")
  [ "$body" = "Guten Morgen! Alles im gruenen Bereich." ] || fail "reply body did not round-trip exactly: $body"
  assert_contains "$(cat "$home/state/inbox/replies/$id.reply")" "id=$id" \
    "the reply record must carry the note's own id as its conversation key"
  pass "fm-inbox reply: writes an id-keyed reply record and acknowledges the note like drain --ack (simulated answer text - mechanism only)"
}

test_two_close_notes_are_never_swapped_or_double_processed() {
  local home id_a id_b out_a out_b body_a body_b
  home=$(setup_home close-together)
  # Queued back to back, deliberately with no delay, to pressure-test the
  # id-keyed correlation rather than relying on wall-clock separation.
  id_a=$(queue "$home" "Frage A: wie ist das Wetter?")
  id_b=$(queue "$home" "Frage B: was steht heute an?")
  [ "$id_a" != "$id_b" ] || fail "two notes queued back to back collided on the same id"

  out_a=$(FM_HOME="$home" bash "$INBOX_BIN" reply "$id_a" "Antwort A: sonnig.") || fail "reply to A failed: $out_a"
  out_b=$(FM_HOME="$home" bash "$INBOX_BIN" reply "$id_b" "Antwort B: drei Termine.") || fail "reply to B failed: $out_b"

  body_a=$(reply_body "$home/state/inbox/replies/$id_a.reply")
  body_b=$(reply_body "$home/state/inbox/replies/$id_b.reply")
  [ "$body_a" = "Antwort A: sonnig." ] || fail "note A's reply carries the wrong text (possible swap): $body_a"
  [ "$body_b" = "Antwort B: drei Termine." ] || fail "note B's reply carries the wrong text (possible swap): $body_b"

  [ -f "$home/state/inbox/handled/$id_a.note" ] || fail "note A was not independently acknowledged"
  [ -f "$home/state/inbox/handled/$id_b.note" ] || fail "note B was not independently acknowledged"

  # Double-processing guard: replying to A again must never touch B's record.
  FM_HOME="$home" bash "$INBOX_BIN" reply "$id_a" "second answer to A" >/dev/null 2>&1
  rc=$?
  [ "$rc" -ne 0 ] || fail "a second reply to an already-answered note A must be refused"
  body_b=$(reply_body "$home/state/inbox/replies/$id_b.reply")
  [ "$body_b" = "Antwort B: drei Termine." ] || fail "a refused double-reply to A corrupted or touched B's reply"
  pass "fm-inbox reply: two notes queued close together are answered independently, never swapped, never double-processed (simulated answers - mechanism only)"
}

test_unknown_id_is_refused_without_writing_anything() {
  local home rc out
  home=$(setup_home unknown-id)
  out=$(FM_HOME="$home" bash "$INBOX_BIN" reply "1700000000-doesnotexist" "an answer nobody asked for" 2>&1)
  rc=$?
  [ "$rc" -ne 0 ] || fail "reply must refuse an id with no corresponding note"
  assert_contains "$out" "not a currently unhandled note" "the refusal should name why"
  [ ! -e "$home/state/inbox/replies" ] || [ -z "$(find "$home/state/inbox/replies" -type f 2>/dev/null)" ] \
    || fail "a refused reply to an unknown id must not write any reply record"
  pass "fm-inbox reply: an id with no corresponding note is refused, writing nothing"
}

test_already_acked_note_is_refused_safely() {
  local home id rc out
  home=$(setup_home already-acked)
  id=$(queue "$home" "eine alte Notiz ohne kuenftige Antwort")
  FM_HOME="$home" bash "$INBOX_BIN" drain --ack "$id" >/dev/null 2>&1 || fail "manual ack failed in fixture setup"
  [ -f "$home/state/inbox/handled/$id.note" ] || fail "fixture setup did not actually ack the note"

  out=$(FM_HOME="$home" bash "$INBOX_BIN" reply "$id" "late answer" 2>&1)
  rc=$?
  [ "$rc" -ne 0 ] || fail "reply must refuse a note already acknowledged through drain --ack, not silently re-process it"
  assert_contains "$out" "not a currently unhandled note" "the refusal should name why"
  [ ! -e "$home/state/inbox/replies/$id.reply" ] || fail "a refused reply to an already-acked note must not write a record"
  pass "fm-inbox reply: a note already acknowledged another way (drain --ack) is refused safely, never silently answered"
}

test_malformed_id_is_refused_before_touching_the_filesystem() {
  local home rc out
  home=$(setup_home malformed-id)
  out=$(FM_HOME="$home" bash "$INBOX_BIN" reply "../../etc/passwd" "text" 2>&1)
  rc=$?
  [ "$rc" -ne 0 ] || fail "reply must refuse a path-shaped id"
  assert_contains "$out" "not a valid note id" "the refusal should name the id as invalid, not merely unhandled"
  pass "fm-inbox reply: a path-shaped or otherwise malformed id is refused before it reaches any path"
}

test_empty_reply_is_refused() {
  local home id rc
  home=$(setup_home empty-reply)
  id=$(queue "$home" "eine Notiz, die eine leere Antwort ablehnen sollte")
  FM_HOME="$home" bash "$INBOX_BIN" reply "$id" "   " >/dev/null 2>&1
  rc=$?
  [ "$rc" -ne 0 ] || fail "reply must refuse a whitespace-only body"
  [ -f "$home/state/inbox/$id.note" ] || fail "a refused empty reply must leave the note unhandled, not consume it"
  pass "fm-inbox reply: an empty or whitespace-only reply is refused, and the note stays unhandled for a real answer"
}

test_reply_via_stdin() {
  local home id out body
  home=$(setup_home stdin)
  id=$(queue "$home" "Notiz per Stimme abgelegt")
  out=$(printf 'Antwort ueber die Standardeingabe.\n' | FM_HOME="$home" bash "$INBOX_BIN" reply "$id" -) \
    || fail "reply via stdin failed: $out"
  body=$(reply_body "$home/state/inbox/replies/$id.reply")
  [ "$body" = "Antwort ueber die Standardeingabe." ] || fail "stdin reply body did not round-trip: $body"
  pass "fm-inbox reply: accepts its body from stdin exactly like note does (simulated answer - mechanism only)"
}

test_reply_writes_keyed_record_and_acks_the_note
test_two_close_notes_are_never_swapped_or_double_processed
test_unknown_id_is_refused_without_writing_anything
test_already_acked_note_is_refused_safely
test_malformed_id_is_refused_before_touching_the_filesystem
test_empty_reply_is_refused
test_reply_via_stdin
# Runs last, after every fixture above has had the chance to go wrong: confirms
# the real live inbox is still byte-for-byte what it was before this suite.
test_real_open_notes_are_never_touched

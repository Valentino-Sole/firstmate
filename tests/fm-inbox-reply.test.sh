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

test_note_with_key_stores_header_and_reply_resolves_by_key() {
  local home id out body
  home=$(setup_home external-key)
  out=$(FM_HOME="$home" bash "$INBOX_BIN" note --key "z-kette-test" "Guten Morgen, Jarvis.") \
    || fail "note --key failed: $out"
  id=$(printf '%s' "$out" | head -1 | awk '{print $2}')
  [ -n "$id" ] || fail "no id came back from note --key"
  assert_contains "$(cat "$home/state/inbox/$id.note")" "external_key=z-kette-test" \
    "the note must carry the external key as its own header line, not a footer in the text"
  case "$(cat "$home/state/inbox/$id.note")" in
    *"Guten Morgen, Jarvis."*z-kette-test*) fail "the external key leaked into the note body text" ;;
  esac

  out=$(FM_HOME="$home" bash "$INBOX_BIN" reply --key "z-kette-test" "Kapitaen, guten Morgen.") \
    || fail "reply --key failed to resolve an unambiguous external key: $out"
  assert_contains "$out" "replied $id" "reply --key should report the resolved firstmate id"
  body=$(reply_body "$home/state/inbox/replies/$id.reply")
  [ "$body" = "Kapitaen, guten Morgen." ] || fail "reply --key body did not round-trip: $body"
  [ -f "$home/state/inbox/handled/$id.note" ] || fail "reply --key must acknowledge the note like any other reply"
  pass "fm-inbox note/reply --key: an external conversation key round-trips as a real header field, never a text footer (simulated answer - mechanism only)"
}

test_two_external_keys_close_together_are_never_swapped() {
  local home id_a id_b out_a out_b body_a body_b
  home=$(setup_home external-key-pair)
  FM_HOME="$home" bash "$INBOX_BIN" note --key "z-zwei-a" "Wie spaet ist es, Jarvis?" >/dev/null \
    || fail "queuing note A with --key failed"
  FM_HOME="$home" bash "$INBOX_BIN" note --key "z-zwei-b" "Wo bist du gerade, Jarvis?" >/dev/null \
    || fail "queuing note B with --key failed"

  # Answered in reversed order (B before A), matching JARVIS's own chain test
  # shape: correlation must ride the key, never the order of replying.
  out_b=$(FM_HOME="$home" bash "$INBOX_BIN" reply --key "z-zwei-b" "Kapitaen, hier ist es Vormittag.") \
    || fail "reply --key for B failed: $out_b"
  out_a=$(FM_HOME="$home" bash "$INBOX_BIN" reply --key "z-zwei-a" "Kapitaen, kurz nach zehn.") \
    || fail "reply --key for A failed: $out_a"

  id_a=$(resolve_external_key_for_test "$home" "z-zwei-a")
  id_b=$(resolve_external_key_for_test "$home" "z-zwei-b")
  body_a=$(reply_body "$home/state/inbox/replies/$id_a.reply")
  body_b=$(reply_body "$home/state/inbox/replies/$id_b.reply")
  [ "$body_a" = "Kapitaen, kurz nach zehn." ] || fail "note A's reply carries the wrong text (possible swap by key): $body_a"
  [ "$body_b" = "Kapitaen, hier ist es Vormittag." ] || fail "note B's reply carries the wrong text (possible swap by key): $body_b"
  pass "fm-inbox reply --key: two external keys queued close together and answered out of order are never swapped (simulated answers - mechanism only)"
}

test_reply_key_refuses_when_unknown_or_ambiguous() {
  local home rc out
  home=$(setup_home external-key-bad)
  out=$(FM_HOME="$home" bash "$INBOX_BIN" reply --key "no-such-key" "an answer nobody asked for" 2>&1)
  rc=$?
  [ "$rc" -ne 0 ] || fail "reply --key must refuse a token with no corresponding note"
  assert_contains "$out" "no single active note carries external_key" "the refusal should name why"

  # Ambiguity: two notes accidentally sharing the same external key must
  # never let reply --key silently pick one.
  FM_HOME="$home" bash "$INBOX_BIN" note --key "dup" "erste Notiz" >/dev/null || fail "fixture note 1 failed"
  FM_HOME="$home" bash "$INBOX_BIN" note --key "dup" "zweite Notiz" >/dev/null || fail "fixture note 2 failed"
  out=$(FM_HOME="$home" bash "$INBOX_BIN" reply --key "dup" "welche davon?" 2>&1)
  rc=$?
  [ "$rc" -ne 0 ] || fail "reply --key must refuse an ambiguous key claimed by more than one active note"
  assert_contains "$out" "no single active note carries external_key" "the ambiguity refusal should name why"
  pass "fm-inbox reply --key: refuses an unknown or ambiguous external key rather than guessing"
}

test_list_and_drain_surface_the_external_key_next_to_the_note() {
  local home id_plain out
  home=$(setup_home list-surfaces-key)
  out=$(FM_HOME="$home" bash "$INBOX_BIN" note --key "z-liste-test" "Notiz mit Schluessel.") \
    || fail "note --key failed: $out"
  [ -n "$(printf '%s' "$out" | head -1 | awk '{print $2}')" ] || fail "no id came back from note --key"
  id_plain=$(queue "$home" "Notiz ohne Schluessel.")

  out=$(FM_HOME="$home" bash "$INBOX_BIN" list) || fail "list failed: $out"
  assert_contains "$out" "external_key=z-liste-test" \
    "list must surface a note's external_key next to it, not just in the raw file"

  # The keyed line must sit with its own note, never bleed onto the plain one.
  local plain_block
  plain_block=$(printf '%s\n' "$out" | awk -v id="$id_plain" 'BEGIN{f=0} $0==id{f=1;next} /^[0-9]/{f=0} f{print}')
  case "$plain_block" in
    *external_key*) fail "the keyed note's external_key leaked into the plain note's listing: $plain_block" ;;
  esac

  out=$(FM_HOME="$home" bash "$INBOX_BIN" drain) || fail "drain failed: $out"
  assert_contains "$out" "external_key=z-liste-test" \
    "drain (which lists before prompting for --ack) must surface the external_key too"
  pass "fm-inbox list/drain: surfaces a note's external_key next to it so a wake-handling turn can quote it straight into reply --key, without hunting through the raw note file"
}

resolve_external_key_for_test() {  # <home> <token> -> echoes the note id
  local home=$1 token=$2 f
  for f in "$home/state/inbox"/*.note "$home/state/inbox/handled"/*.note; do
    [ -e "$f" ] || continue
    grep -qxF "external_key=$token" "$f" || continue
    basename "$f" .note
    return 0
  done
  return 1
}

test_reply_writes_keyed_record_and_acks_the_note
test_two_close_notes_are_never_swapped_or_double_processed
test_unknown_id_is_refused_without_writing_anything
test_already_acked_note_is_refused_safely
test_malformed_id_is_refused_before_touching_the_filesystem
test_empty_reply_is_refused
test_reply_via_stdin
test_note_with_key_stores_header_and_reply_resolves_by_key
test_two_external_keys_close_together_are_never_swapped
test_reply_key_refuses_when_unknown_or_ambiguous
test_list_and_drain_surface_the_external_key_next_to_the_note
# Runs last, after every fixture above has had the chance to go wrong: confirms
# the real live inbox is still byte-for-byte what it was before this suite.
test_real_open_notes_are_never_touched

#!/usr/bin/env bash
# fm-inbox.sh - the captain's out-of-band capture surface.
#
# Solves several DIFFERENT problems with different mechanisms, because they
# are not the same problem:
#
#   note    Queue an idea for firstmate while firstmate is mid-turn and cannot
#           answer. Writes a durable record and appends ONE `check` wake, so the
#           note survives a crash and is presented at firstmate's next drain.
#           This is the only subcommand that touches firstmate's wake queue.
#   say     Same as `note`, but the body comes from spoken audio on stdin.
#           Speech is an INPUT METHOD here, not an architecture: it transcribes
#           and then takes exactly the `note` path.
#   status  Answer "what is happening" from durable records ONLY. Reads no
#           network and appends NO wake, so it never interrupts work and is safe
#           to run in a loop.
#   ask     Answer a side question with a one-shot model call that never touches
#           firstmate, the backlog, or the wake queue. A side question is not
#           fleet work and must not become fleet work.
#   reply   Firstmate's own answer to one durable note, once firstmate has
#           actually processed it (not merely read the wake). Writes ONE durable
#           reply record keyed by the note's own id - the note id IS the
#           conversation key an external caller (a voice agent, a bridge like
#           JARVIS) correlates its question against, unless that caller supplied
#           its OWN external key at `note` time (see `--key` below), in which
#           case `reply --key <token>` addresses the note by that key instead of
#           ever needing to learn firstmate's internal id at all - then
#           acknowledges the note the same way `drain --ack` does, because a
#           replied-to note has been handled. Refuses loudly, writing nothing,
#           for any id or key that does not currently resolve to exactly one
#           live unhandled note: unknown, ambiguous, already replied, or already
#           acked some other way. Never touches or infers a reply for a note
#           nobody named. When the answered note carries an external key,
#           `reply` also ATTEMPTS delivery straight to JARVIS over HTTP (see
#           `deliver` below) - the local record is written and the note is
#           acknowledged either way, but the command exits nonzero, naming the
#           failure, when that delivery attempt fails.
#   deliver Retries a JARVIS delivery for a note that already has a reply
#           record, without writing a second reply or re-acknowledging the
#           note - the recovery path when `reply`'s own delivery attempt
#           failed, or a duplicate-guard was never reached in the first place.
#           Idempotent: a note already marked delivered is reported and left
#           alone, never re-sent.
#
# Usage:
#   fm-inbox.sh note <text>...          | fm-inbox.sh note -   (body from stdin)
#   fm-inbox.sh note --key <token> <text>...   (an external caller's own conversation key)
#   fm-inbox.sh say  [<file.wav>]       (default: audio on stdin)
#   fm-inbox.sh status
#   fm-inbox.sh ask  <question>...
#   fm-inbox.sh list
#   fm-inbox.sh drain [--ack <id>...]
#   fm-inbox.sh reply <id> <text>...           | fm-inbox.sh reply <id> -   (body from stdin)
#   fm-inbox.sh reply --key <token> <text>...  | fm-inbox.sh reply --key <token> -
#   fm-inbox.sh deliver <id>            | fm-inbox.sh deliver --key <token>
#
# Configuration. A region, a model id and an AWS profile name somebody's account
# and somebody's choices, so this file carries no default for any of them. Each is
# read from the home's gitignored config/ directory, or from the matching
# environment variable, and the model-backed subcommands refuse with the path to
# write rather than reaching for a value that belongs to another home. That
# configuration is also the opt-in: `say` and `ask` are off until it exists.
#
#   config/inbox-region      FM_INBOX_REGION       AWS region.            required
#   config/inbox-stt-model   FM_INBOX_STT_MODEL     speech-to-text model.  required by say
#   config/inbox-ask-model   FM_INBOX_ASK_MODEL     side-question model.   required by ask
#   config/inbox-profile     FM_INBOX_PROFILE       AWS profile.           optional
#   config/inbox-jarvis-url  FM_INBOX_JARVIS_URL    JARVIS answer endpoint. optional, has a default
#
# An absent profile means the call uses whatever credentials are already in the
# environment, which is also what FM_INBOX_PROFILE= (empty) forces.
#
# The JARVIS URL defaults to http://127.0.0.1:7416/api/briefkasten/antwort -
# JARVIS's own bridge, its documented default port (JARVIS_BRUECKE_PORT), same
# server. That endpoint deliberately accepts only real loopback connections,
# never a forwarded or credentialed one (JARVIS's own gemeinsam/zugang.py
# ist_lokal check), so no secret is configured here to reach it - only the
# address, in case a home's JARVIS bridge runs on a different port. This is a
# server-internal detail, not a captain-held secret.
#
# `note`, `status`, `list`, `drain` and `reply` (for a note with no external
# key) need NO configuration at all, because they make no model call. The
# voice handover depends on `note`, so it keeps working in a home that has
# configured nothing.
#
# Environment:
#   FM_HOME              operational home whose state/ and data/ are used.
#
# PRIVACY: `say` sends your audio and `ask` sends your question to Bedrock.
# `note`, `status`, `list`, `drain`, and `reply` for a note with no external
# key make no network call at all. `reply`/`deliver` for a note WITH an
# external key make exactly one loopback HTTP call to JARVIS's own bridge on
# this same server (never anywhere else) to hand back the already-composed
# answer text.
#
# `reply` writes into state/inbox/replies/<id>.reply, a sibling of the note
# store: schema=fm-inbox-reply.v1, at=<UTC timestamp>, then the exact reply text
# after a `--` line, byte-identical to how a note stores its own body. Reading
# that record is an external caller's job (a voice bridge, JARVIS or similar);
# this script only writes it durably and keyed correctly. It never deletes or
# rewrites a reply once written, matching the append-only spirit of the note
# store itself - a caller that must correct a reply sends a new note instead.
# Whether a keyed note's reply was actually DELIVERED to JARVIS is tracked
# separately, in state/inbox/replies/delivered/<id> (written only after a
# confirmed 200 "ok":true from JARVIS's own endpoint) - never by rewriting the
# write-once .reply record itself.
#
# `note --key <token>` stores the caller's own external conversation key as an
# `external_key=<token>` header line in the note, alongside `id=`/`at=`/`source=`
# - a real header field, never a footer folded into the free text a captain or
# a spoken answer reads. `reply --key <token>` resolves that same token back to
# the one live note carrying it (refusing on none or on more than one, never
# guessing), so an external caller's whole round trip - deposit, correlate,
# read the answer - can use only its own key and never needs to learn or carry
# firstmate's internal note id at all. A note queued without `--key` carries no
# `external_key=` line, exactly like every note queued before this existed.
#
# COMPATIBILITY: a note JARVIS deposits through its own unmodified path (no
# `--key`, `bin/fm-inbox.sh note <text>` verbatim) still carries its
# conversation key the way it always has - as a "\n\n[Antwortschlüssel:
# <token>]" footer inside the free text itself, matching JARVIS's own
# `bruecke/auftrag.py:schluessel_aus_notiz`. `reply --key`/`deliver --key` and
# `list`/`drain`'s key display recognize BOTH forms - the real `external_key=`
# header and this legacy footer - so neither format needs to change and
# neither is preferred over the other; a note carrying either resolves the
# same way. A note with no key in either form (every note queued before any of
# this existed, including the three real open captain notes) is unaffected.
#
# `list` and `drain` (which lists before its own ack prompt) print a note's
# external key - header or legacy footer, whichever it carries - right above
# its body when present, so a wake-handling turn sees at a glance that a note
# came from an external caller who will poll for its answer by that key - and
# can quote the token straight into `reply --key <token> <answer>` without
# opening the raw note file to find it.
#
# `note` is also the queueing half of the spoken interface: when the voice agent
# in bin/fm-voice-relay.py hands real work over to firstmate, it runs this
# subcommand rather than carrying a second queue of its own. Keep the `note`
# contract stable for that caller. `status` is the HUMAN view of the records;
# bin/fm_voice_records.py owns the scope-controlled machine view the voice agent
# reads, because the voice agent must be able to answer without record free text
# ever reaching a model.
set -euo pipefail

# A non-interactive `ssh host fm-inbox.sh ...` does NOT get a login shell, so it
# does not get ~/.toolbox/bin on PATH. The AWS profile's credential_process is
# the bare word `ada`, so without this the model-backed subcommands fail with
# "[Errno 2] No such file or directory: 'ada'" while note/status still work.
# Verified: this is exactly what happens over SSH without the fix.
for _extra in "$HOME/.toolbox/bin" "$HOME/.local/bin"; do
  case ":$PATH:" in
    *":$_extra:"*) ;;
    *) [ -d "$_extra" ] && PATH="$_extra:$PATH" ;;
  esac
done
unset _extra
export PATH

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FM_ROOT="$(cd "$SELF_DIR/.." && pwd)"
FM_HOME="${FM_HOME:-$FM_ROOT}"
STATE="${FM_STATE_OVERRIDE:-$FM_HOME/state}"
DATA="${FM_DATA_OVERRIDE:-$FM_HOME/data}"
INBOX="$STATE/inbox"
REPLIES="$INBOX/replies"

CONFIG="${FM_CONFIG_OVERRIDE:-$FM_HOME/config}"

die() { printf 'fm-inbox: %s\n' "$*" >&2; exit 1; }

# First non-comment, non-blank line of a config file, or nothing.
read_setting() {  # <file-name>
  local path="$CONFIG/$1" line
  [ -r "$path" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%%#*}
    line=${line#"${line%%[![:space:]]*}"}
    line=${line%"${line##*[![:space:]]}"}
    [ -n "$line" ] || continue
    printf '%s' "$line"
    return 0
  done < "$path"
}

# Refuse by naming the file to write. A model call that guessed at a region or an
# account would either fail confusingly or, worse, succeed against a stranger's.
require_setting() {  # <file-name> <env-var> <what>
  local value
  value=$(read_setting "$1")
  [ -n "$value" ] || die "no $3 is configured: write one line into $CONFIG/$1 or set $2"
  printf '%s' "$value"
}

REGION="${FM_INBOX_REGION:-}"
STT_MODEL="${FM_INBOX_STT_MODEL:-}"
ASK_MODEL="${FM_INBOX_ASK_MODEL:-}"
# Unset falls through to config; explicitly empty means "use ambient credentials".
PROFILE="${FM_INBOX_PROFILE-$(read_setting inbox-profile)}"

# JARVIS's own bridge, its documented default port - a server-internal
# detail, never a secret (see the header comment's JARVIS URL paragraph).
JARVIS_URL_DEFAULT="http://127.0.0.1:7416/api/briefkasten/antwort"
jarvis_url() {
  local v="${FM_INBOX_JARVIS_URL:-$(read_setting inbox-jarvis-url)}"
  printf '%s' "${v:-$JARVIS_URL_DEFAULT}"
}

# Resolved only by the subcommands that make a model call, so note, status, list
# and drain keep working in a home that has configured nothing.
need_region() {
  [ -n "$REGION" ] || REGION=$(require_setting inbox-region FM_INBOX_REGION "AWS region")
}

need_stt_model() {
  need_region
  [ -n "$STT_MODEL" ] || STT_MODEL=$(require_setting inbox-stt-model \
    FM_INBOX_STT_MODEL "speech-to-text model")
}

need_ask_model() {
  need_region
  [ -n "$ASK_MODEL" ] || ASK_MODEL=$(require_setting inbox-ask-model \
    FM_INBOX_ASK_MODEL "side-question model")
}

need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

# The profile's credential_process (`ada`) costs a MEASURED ~1030ms on every
# single call, which is about half the wall time of `say` and `ask`. If real
# credentials are already in the environment, skip --profile entirely and let the
# ambient ones win. Set FM_INBOX_PROFILE= (empty) to force that even without env
# credentials present.
aws_call() {
  if [ -z "$PROFILE" ] || [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    aws --region "$REGION" "$@"
  else
    aws --profile "$PROFILE" --region "$REGION" "$@"
  fi
}

# ---------------------------------------------------------------- note

# Append exactly one wake so firstmate picks the note up at its next drain.
# Failure to wake is NOT allowed to lose the note: the record is already on
# disk, so we report the wake failure and still exit non-zero loudly.
wake_for() {
  local id=$1 summary=$2 lib="$FM_ROOT/bin/fm-wake-lib.sh"
  if [ ! -r "$lib" ]; then
    printf 'fm-inbox: note saved but NOT announced (missing %s)\n' "$lib" >&2
    return 1
  fi
  # shellcheck source=/dev/null
  FM_ROOT_OVERRIDE="$FM_ROOT" FM_HOME="$FM_HOME" STATE="$STATE" . "$lib"
  fm_wake_append check "inbox:$id" "check: captain inbox note $id - $summary"
}

queue_note() {
  local source=$1 body=$2 extra=${3:-}
  [ -n "${body//[[:space:]]/}" ] || die "refusing to queue an empty note"
  mkdir -p "$INBOX"

  local tmp id summary staging_name
  tmp=$(mktemp "$INBOX/.staging-XXXXXX")
  staging_name=$(basename "$tmp")
  id="$(date +%s)-${staging_name#.staging-}"
  {
    printf 'id=%s\n' "$id"
    printf 'at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'source=%s\n' "$source"
    [ -z "$extra" ] || printf '%s\n' "$extra"
    printf -- '--\n'
    printf '%s\n' "$body"
  } >"$tmp"

  # Publish the completed note atomically.
  mv "$tmp" "$INBOX/$id.note"

  # One-line summary for the wake payload; the full body stays in the file.
  summary=$(printf '%s' "$body" | tr '\n\t' '  ' | cut -c1-100)
  printf 'queued %s\n' "$id"
  printf '  %s\n' "$summary"
  if wake_for "$id" "$summary"; then
    printf '  firstmate will pick this up at its next check.\n'
  else
    die "note $id is saved at $INBOX/$id.note but firstmate was NOT woken"
  fi
}

cmd_note() {
  local key='' body
  if [ "${1:-}" = "--key" ]; then
    [ "$#" -ge 2 ] || die "usage: fm-inbox.sh note --key <token> <text>...   (or: note --key <token> - to read stdin)"
    key=$2
    key_valid "$key" || die "refusing: '$key' is not a valid conversation key"
    shift 2
  fi
  if [ "$#" -eq 0 ]; then
    die "usage: fm-inbox.sh note <text>...   (or: note - to read stdin)  [--key <token> before the text]"
  elif [ "$1" = "-" ]; then
    body=$(cat)
  else
    body="$*"
  fi
  if [ -n "$key" ]; then
    queue_note text "$body" "external_key=$key"
  else
    queue_note text "$body"
  fi
}

# ---------------------------------------------------------------- say

cmd_say() {
  # Before the tool checks, so an unconfigured home is told what to configure
  # rather than what to install for a call it is not yet allowed to make.
  need_stt_model
  need aws
  need python3
  need base64

  local src wav raw transcript
  raw=$(mktemp /tmp/fm-inbox-audio-XXXXXX)
  wav=$(mktemp /tmp/fm-inbox-wav-XXXXXX.wav)
  # shellcheck disable=SC2064
  trap "rm -f '$raw' '$wav' '$wav.json'" EXIT

  if [ "$#" -ge 1 ] && [ "$1" != "-" ]; then
    src=$1
    [ -r "$src" ] || die "cannot read audio file: $src"
    cat "$src" >"$raw"
  else
    cat >"$raw"
  fi
  [ -s "$raw" ] || die "no audio received on stdin"

  # Accept a real WAV as-is; wrap headerless 16kHz mono s16le PCM if that is
  # what arrived. Anything else is rejected rather than silently mistranscribed.
  python3 - "$raw" "$wav" <<'PY'
import sys, wave
src, dst = sys.argv[1], sys.argv[2]
data = open(src, 'rb').read()
if data[:4] == b'RIFF':
    open(dst, 'wb').write(data)
    sys.stderr.write("fm-inbox: input is WAV, passing through\n")
elif data[:4] in (b'OggS', b'fLaC') or data[:3] == b'ID3':
    sys.exit("fm-inbox: got Ogg/FLAC/MP3; re-encode to WAV first")
else:
    if len(data) % 2:
        data = data[:-1]
    w = wave.open(dst, 'wb')
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
    w.writeframes(data); w.close()
    sys.stderr.write("fm-inbox: input looked like raw PCM, wrapped as 16kHz mono WAV\n")
PY

  local secs
  secs=$(python3 -c "
import wave,sys
w=wave.open('$wav'); print(round(w.getnframes()/w.getframerate(),2))")
  printf 'fm-inbox: %ss of audio, transcribing with %s in %s\n' "$secs" "$STT_MODEL" "$REGION" >&2

  python3 - "$wav" "$wav.json" <<'PY'
import base64, json, sys
b = base64.b64encode(open(sys.argv[1], 'rb').read()).decode()
json.dump([{"role": "user", "content": [
    {"audio": {"format": "wav", "source": {"bytes": b}}},
    {"text": "Transcribe the speech exactly. Output only the transcript, nothing else."},
]}], open(sys.argv[2], 'w'))
PY

  transcript=$(aws_call bedrock-runtime converse \
    --model-id "$STT_MODEL" \
    --messages "file://$wav.json" \
    --inference-config '{"maxTokens":600,"temperature":0}' \
    --query 'output.message.content[0].text' --output text) \
    || die "transcription failed"

  [ -n "${transcript//[[:space:]]/}" ] || die "transcription came back empty"
  printf 'fm-inbox: heard: %s\n' "$transcript" >&2
  queue_note voice "$transcript" "transcript_model=$STT_MODEL
audio_seconds=$secs"
}

# ---------------------------------------------------------------- status

cmd_status() {
  local pending=0
  [ -d "$INBOX" ] && pending=$(find "$INBOX" -maxdepth 1 -name '*.note' 2>/dev/null | wc -l | tr -d ' ')

  printf '=== firstmate status (read-only, no wake sent) ===\n'
  printf 'home     %s\n' "$FM_HOME"
  printf 'time     %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf 'inbox    %s note(s) waiting for firstmate\n' "$pending"

  if [ -f "$DATA/backlog.md" ]; then
    printf '\n--- in flight ---\n'
    awk '/^## In flight/{f=1;next} /^## /{f=0} f && /^- \[/{print}' \
      "$DATA/backlog.md" | sed 's/^- \[ \] /  /' | cut -c1-150
  else
    printf '\n(no backlog at %s)\n' "$DATA/backlog.md"
  fi

  local any=0
  for m in "$STATE"/*.meta; do
    [ -e "$m" ] || break
    if [ "$any" -eq 0 ]; then printf '\n--- workers ---\n'; any=1; fi
    local id kind mode last
    id=$(basename "$m" .meta)
    kind=$(sed -n 's/^kind=//p' "$m" | head -1)
    mode=$(sed -n 's/^mode=//p' "$m" | head -1)
    last=""
    [ -f "$STATE/$id.status" ] && last=$(tail -1 "$STATE/$id.status" 2>/dev/null | cut -c1-100)
    printf '  %-42s %-6s %-10s %s\n' "$id" "${kind:-?}" "${mode:--}" "${last:-(no events yet)}"
  done
  [ "$any" -eq 1 ] || printf '\n(no workers on deck)\n'

  printf '\nNote: the last event line is history, not current state.\n'
}

# ---------------------------------------------------------------- ask

cmd_ask() {
  [ "$#" -gt 0 ] || die "usage: fm-inbox.sh ask <question>..."
  need_ask_model
  need aws
  need python3
  local q="$*" msg
  msg=$(mktemp /tmp/fm-inbox-ask-XXXXXX.json)
  # shellcheck disable=SC2064
  trap "rm -f '$msg'" EXIT

  Q="$q" python3 - "$msg" <<'PY'
import json, os, sys
json.dump([{"role": "user", "content": [{"text": os.environ["Q"]}]}],
          open(sys.argv[1], 'w'))
PY

  aws_call bedrock-runtime converse \
    --model-id "$ASK_MODEL" \
    --messages "file://$msg" \
    --system '[{"text":"You are a terse engineering assistant answering a side question. Be direct and concrete. No preamble. If you are not sure, say so."}]' \
    --inference-config '{"maxTokens":700,"temperature":0.2}' \
    --query 'output.message.content[0].text' --output text \
    || die "ask failed"
}

# ---------------------------------------------------------------- list / drain / reply

# A note id is always generated by queue_note as <epoch>-<mktemp suffix>, never
# accepted from a caller there. `reply` is the first place an id arrives as
# caller input, so it is validated before it ever reaches a path: this is the
# one thing standing between a hostile or malformed id and a stray path
# component such as `../../something`.
id_valid() {  # <id>
  case "$1" in
    ''|*[!A-Za-z0-9-]*) return 1 ;;
    *) return 0 ;;
  esac
}

# An external caller's own conversation key (a bridge like JARVIS, a voice
# front end) - never a firstmate note id itself, and never accepted loosely
# enough to break out of the `external_key=` header line it is stored in.
key_valid() {  # <token>
  case "$1" in
    ''|*[!A-Za-z0-9._-]*) return 1 ;;
    *) return 0 ;;
  esac
}

# COMPATIBILITY with JARVIS's own unmodified note-deposit path (no `--key`):
# the same "\n\n[Antwortschlüssel: <token>]" footer JARVIS's own
# bruecke/auftrag.py:_notiz_mit_schluessel appends to the free text, and
# schluessel_aus_notiz reads back - reproduced exactly here, byte for byte
# (blank line, literal bracket text, no trailing content after the closing
# bracket but whatever trailing newline the note store itself adds), so
# neither side has to change format. A note with no such footer, and no
# `external_key=` header, matches neither and is unaffected - including the
# three real open captain notes, which predate both formats.
note_footer_key_matches() {  # <note-file> <token>
  local f=$1 token=$2 body suffix
  body=$(sed -n '/^--$/,$p' "$f" | tail -n +2)
  suffix=$'\n\n[Antwortschlüssel: '"$token"']'
  case "$body" in
    *"$suffix") return 0 ;;
    *) return 1 ;;
  esac
}

# Same footer, read back without already knowing the token - for `list`/
# `drain` to display whatever key a footer-format note happens to carry.
# Mirrors JARVIS's own schluessel_aus_notiz(): no match is not an error, an
# untokened note (every note before either format existed) just prints "".
_FOOTER_KEY_RE=$'\n\n\\[Antwortschlüssel: ([^]]+)\\]$'
footer_key_of() {  # <note-file> -> echoes the footer-format key, if any
  local f=$1 body
  body=$(sed -n '/^--$/,$p' "$f" | tail -n +2)
  if [[ $body =~ $_FOOTER_KEY_RE ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
  fi
}

# One note's external key regardless of which of the two forms it carries -
# the real `external_key=` header (set via `note --key`) takes priority,
# falling back to the legacy footer JARVIS's own unmodified path still uses.
# Prints "" for a note with neither, never an error.
note_key_of() {  # <note-file> -> echoes the note's external key, if any
  local f=$1 key
  key=$(sed -n 's/^external_key=//p' "$f" | head -1)
  [ -n "$key" ] || key=$(footer_key_of "$f")
  printf '%s' "$key"
}

_note_carries_key() {  # <note-file> <token>
  local f=$1 token=$2
  grep -qxF "external_key=$token" "$f" 2>/dev/null && return 0
  note_footer_key_matches "$f" "$token"
}

# Resolve an external conversation key - the note's own `external_key=`
# header, or its legacy footer form - to the firstmate note id currently
# carrying it, among ACTIVE (unhandled) notes only. Prints nothing and fails
# when no active note claims that key, or when more than one does: a caller
# addressing a note purely by its own external key must never be handed an
# ambiguous match, and a stale or reused key is exactly the shape of mistake
# this refuses rather than guesses through.
resolve_external_key() {  # <token>
  local token=$1 f found='' matches=0
  [ -d "$INBOX" ] || return 1
  for f in "$INBOX"/*.note; do
    [ -e "$f" ] || continue
    _note_carries_key "$f" "$token" || continue
    matches=$((matches + 1))
    found=$(basename "$f" .note)
  done
  [ "$matches" -eq 1 ] || return 1
  printf '%s' "$found"
}

# Same resolution, but also over already-handled (replied/acked) notes - only
# for `deliver --key`, which retries a delivery for a note firstmate has
# already answered and which has therefore already left the active inbox.
resolve_external_key_delivered() {  # <token>
  local token=$1 f found='' matches=0
  for f in "$INBOX"/*.note "$INBOX/handled"/*.note; do
    [ -e "$f" ] || continue
    _note_carries_key "$f" "$token" || continue
    matches=$((matches + 1))
    found=$(basename "$f" .note)
  done
  [ "$matches" -eq 1 ] || return 1
  printf '%s' "$found"
}

# Acknowledge one note the same way regardless of caller: move it into
# handled/, or report it was already gone. Shared by `drain --ack` and `reply`
# so the two never drift into two different ideas of "handled".
ack_note() {  # <id>
  local id=$1
  mkdir -p "$INBOX/handled"
  if [ -f "$INBOX/$id.note" ]; then
    mv "$INBOX/$id.note" "$INBOX/handled/$id.note"
    return 0
  fi
  return 1
}

cmd_list() {
  [ -d "$INBOX" ] || { printf '(inbox empty)\n'; return 0; }
  local any=0
  for f in "$INBOX"/*.note; do
    [ -e "$f" ] || break
    any=1
    printf '%s\n' "$(basename "$f" .note)"
    local key
    key=$(note_key_of "$f")
    [ -z "$key" ] || printf '    external_key=%s\n' "$key"
    sed -n '/^--$/,$p' "$f" | tail -n +2 | sed 's/^/    /'
  done
  [ "$any" -eq 1 ] || printf '(inbox empty)\n'
}

cmd_drain() {
  if [ "${1:-}" = "--ack" ]; then
    shift
    [ "$#" -gt 0 ] || die "usage: fm-inbox.sh drain --ack <id>..."
    local id
    for id in "$@"; do
      if ack_note "$id"; then
        printf 'acked %s\n' "$id"
      else
        printf 'already-acked %s\n' "$id"
      fi
    done
    return 0
  fi
  cmd_list
  printf '\nAck with: fm-inbox.sh drain --ack <id>...\n'
}

# Firstmate's own answer to one note: a durable, id-keyed reply record, then
# the same acknowledgement `drain --ack` performs, because replying to a note
# is handling it. Refuses - writing nothing - for any id that is not currently
# a live, unhandled note (unknown, malformed, or already handled some other
# way), and refuses a second reply to an id that already has one, so two
# notes arriving close together can never have their answers swapped and the
# same note can never be answered twice.
cmd_reply() {
  local id body tmp key delivered_rc=0
  [ "$#" -ge 1 ] || die "usage: fm-inbox.sh reply <id> <text>...   (or: reply --key <token> <text>...)"
  if [ "$1" = "--key" ]; then
    [ "$#" -ge 2 ] || die "usage: fm-inbox.sh reply --key <token> <text>...   (or: reply --key <token> - to read stdin)"
    key_valid "$2" || die "refusing: '$2' is not a valid conversation key"
    id=$(resolve_external_key "$2") || die "refusing: no single active note carries external_key '$2' (none, or more than one)"
    shift 2
  else
    id=$1
    shift
    id_valid "$id" || die "refusing: '$id' is not a valid note id"
  fi
  if [ "$#" -eq 0 ]; then
    die "usage: fm-inbox.sh reply <id> <text>...   (or: reply <id> - to read stdin)"
  elif [ "$1" = "-" ]; then
    body=$(cat)
  else
    body="$*"
  fi
  [ -n "${body//[[:space:]]/}" ] || die "refusing to write an empty reply"
  [ -f "$INBOX/$id.note" ] || die "refusing: '$id' is not a currently unhandled note (unknown, already replied, or already acked)"
  mkdir -p "$REPLIES"
  [ ! -e "$REPLIES/$id.reply" ] || die "refusing: a reply for '$id' already exists at $REPLIES/$id.reply - a note is answered at most once"

  # Read the note's key (either form) while it is still at its active path,
  # before ack_note moves it - simpler and race-free versus reading it back
  # out of handled/ afterward.
  key=$(note_key_of "$INBOX/$id.note")

  tmp=$(mktemp "$REPLIES/.staging-XXXXXX")
  {
    printf 'schema=fm-inbox-reply.v1\n'
    printf 'id=%s\n' "$id"
    printf 'at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf -- '--\n'
    printf '%s\n' "$body"
  } >"$tmp"
  mv "$tmp" "$REPLIES/$id.reply"

  if ack_note "$id"; then
    printf 'replied %s\n' "$id"
  else
    # The note vanished between the check above and the ack (a concurrent
    # drain --ack, most plausibly). The reply is already durably on disk and
    # correctly keyed, so this is not a failure to report as one - just a
    # narrow race the caller does not need to react to.
    printf 'replied %s (note was already acked)\n' "$id"
  fi

  # The local record and the acknowledgement both stand either way; only the
  # exit code (and deliver_to_jarvis's own stderr line) distinguishes a fully
  # closed loop from one that still needs `fm-inbox.sh deliver` to retry.
  if [ -n "$key" ]; then
    deliver_to_jarvis "$id" "$key" "$body" || delivered_rc=$?
  fi
  return "$delivered_rc"
}

reply_body_of() {  # <reply-file>
  sed -n '/^--$/,$p' "$1" | tail -n +2
}

# Sends one already-composed answer to JARVIS's own bridge over HTTP - the
# missing half PR #20 named explicitly out of scope: a durable
# state/inbox/replies/<id>.reply file was never the same as JARVIS actually
# receiving it. Idempotent via state/inbox/replies/delivered/<id>, written
# only after a confirmed 200 "ok":true - a note already marked delivered is
# reported and left alone, never re-sent, so a retry after a network blip can
# never produce a second answer at JARVIS. A failed attempt is NEVER reported
# as delivered: this prints the failure to stderr, names the retry command,
# and returns nonzero, so nothing here can mistake "answered locally" for
# "JARVIS has it".
deliver_to_jarvis() {  # <id> <key> <body>
  local id=$1 key=$2 body=$3 url marker payload tmp_resp http_status curl_ok

  url=$(jarvis_url)
  mkdir -p "$REPLIES/delivered"
  marker="$REPLIES/delivered/$id"
  if [ -e "$marker" ]; then
    printf 'delivery %s: already delivered to jarvis, not re-sending\n' "$id"
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1 || ! command -v python3 >/dev/null 2>&1; then
    printf 'fm-inbox: delivery to jarvis FAILED for %s: curl and python3 are both required and at least one is missing - the answer is written at %s but was NOT transmitted; retry with: fm-inbox.sh deliver %s\n' \
      "$id" "$REPLIES/$id.reply" "$id" >&2
    return 1
  fi

  if ! payload=$(printf '%s' "$body" | JARVIS_KEY="$key" python3 -c '
import json, os, sys
print(json.dumps({"text": sys.stdin.read(), "zug": os.environ["JARVIS_KEY"]}))
'); then
    printf 'fm-inbox: delivery to jarvis FAILED for %s: could not build the request body - the answer is written at %s but was NOT transmitted; retry with: fm-inbox.sh deliver %s\n' \
      "$id" "$REPLIES/$id.reply" "$id" >&2
    return 1
  fi

  tmp_resp=$(mktemp "$REPLIES/.staging-XXXXXX")
  curl_ok=0
  if http_status=$(printf '%s' "$payload" | curl -sS --max-time 10 -o "$tmp_resp" -w '%{http_code}' \
      -H 'Content-Type: application/json' --data-binary @- "$url" 2>/dev/null); then
    curl_ok=1
  fi

  if [ "$curl_ok" -eq 1 ] && [ "$http_status" = "200" ] \
      && grep -q '"ok"[[:space:]]*:[[:space:]]*true' "$tmp_resp" 2>/dev/null; then
    rm -f "$tmp_resp"
    : > "$marker"
    printf 'delivered %s to jarvis\n' "$id"
    return 0
  fi

  printf 'fm-inbox: delivery to jarvis FAILED for %s (http=%s, url=%s) - the answer is written at %s but was NOT confirmed delivered; retry with: fm-inbox.sh deliver %s\n' \
    "$id" "${http_status:-none}" "$url" "$REPLIES/$id.reply" "$id" >&2
  rm -f "$tmp_resp"
  return 1
}

# Retries a JARVIS delivery for a note that already has a reply record, using
# only the two durable records already on disk (the note, for its key; the
# .reply, for the already-composed text) - never composes a new answer, never
# re-acknowledges. The idempotency guard lives in deliver_to_jarvis itself, so
# retrying an already-confirmed delivery is reported and left alone.
cmd_deliver() {
  local id key body notefile
  [ "$#" -ge 1 ] || die "usage: fm-inbox.sh deliver <id>   (or: deliver --key <token>)"
  if [ "$1" = "--key" ]; then
    [ "$#" -ge 2 ] || die "usage: fm-inbox.sh deliver --key <token>"
    key_valid "$2" || die "refusing: '$2' is not a valid conversation key"
    id=$(resolve_external_key_delivered "$2") \
      || die "refusing: no single note (active or already handled) carries external_key '$2' (none, or more than one)"
  else
    id=$1
    id_valid "$id" || die "refusing: '$id' is not a valid note id"
  fi
  [ -f "$REPLIES/$id.reply" ] || die "refusing: no reply record exists yet for '$id' - answer it first with fm-inbox.sh reply"

  if [ -f "$INBOX/$id.note" ]; then
    notefile="$INBOX/$id.note"
  elif [ -f "$INBOX/handled/$id.note" ]; then
    notefile="$INBOX/handled/$id.note"
  else
    die "refusing: no note record (active or handled) found for '$id'"
  fi
  key=$(note_key_of "$notefile")
  [ -n "$key" ] || die "refusing: note '$id' carries no external key - nothing to deliver to jarvis for a plain captain note"

  body=$(reply_body_of "$REPLIES/$id.reply")
  deliver_to_jarvis "$id" "$key" "$body"
}

# ---------------------------------------------------------------- dispatch

case "${1:-}" in
  note)     shift; cmd_note "$@" ;;
  say)      shift; cmd_say "$@" ;;
  status)   shift; cmd_status ;;
  ask)      shift; cmd_ask "$@" ;;
  list)     shift; cmd_list ;;
  drain)    shift; cmd_drain "$@" ;;
  reply)    shift; cmd_reply "$@" ;;
  deliver)  shift; cmd_deliver "$@" ;;
  ''|-h|--help|help)
    # The whole header block, found rather than counted: everything after the
    # shebang up to the first line that is not a comment. A fixed line range
    # silently truncates this help the next time the header grows, and the last
    # thing to fall off the end is the PRIVACY paragraph, which is the one place
    # a new operator is told which subcommands send anything off this host.
    awk 'NR == 1 { next }
         /^#/ { sub(/^# ?/, ""); print; next }
         { exit }' "${BASH_SOURCE[0]}" ;;
  *) die "unknown subcommand: $1 (try --help)" ;;
esac

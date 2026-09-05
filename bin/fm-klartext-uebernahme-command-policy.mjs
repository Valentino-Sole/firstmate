#!/usr/bin/env node
// Semantic policy for the Klartext-Uebernahme isolation guard.
//
// Captain decision 2026-08-27 (Option A): /home/vsole/uebernahme-arbeits-pc stays
// isolated. Use the index only. No merge into ~/.claude-mem, no Drive export, no
// destruction. Targeted cleanup or import requires a fresh captain decision.
//
// bin/fm-klartext-uebernahme-pretool-check.sh scopes this to any firstmate repo.
// See docs/klartext-uebernahme-isolation.md.

import { Lexer, splitProgram, commandPosition } from "./fm-arm-command-policy.mjs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const UEBERNAHME_MARKERS = [
  "/home/vsole/uebernahme-arbeits-pc",
  "uebernahme-arbeits-pc",
];

const CLAUDE_MEM_MARKERS = [
  ".claude-mem",
  "claude-mem.db",
];

const EXPORT_MARKERS = [
  "gdrive",
  "google-drive",
  "google drive",
  "rclone",
  "/mnt/drive",
  "drive.google.com",
];

const MUTATION_COMMANDS = new Set([
  "rm",
  "mv",
  "cp",
  "rsync",
  "scp",
  "chmod",
  "chown",
  "truncate",
  "install",
  "dd",
  "shred",
  "rename",
]);

const READ_COMMANDS = new Set([
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "grep",
  "rg",
  "find",
  "ls",
  "stat",
  "file",
  "wc",
  "diff",
  "sort",
  "cut",
  "uniq",
  "column",
  "jq",
  "strings",
  "od",
  "hexdump",
  "tree",
  "du",
  "readlink",
  "realpath",
  "basename",
  "dirname",
]);

const SQLITE_WRITE_MARKERS = [
  "insert",
  "update",
  "delete",
  "attach",
  "drop",
  "create",
  "alter",
  "replace",
  "pragma",
  ".dump",
  ".backup",
  ".restore",
  ".import",
  ".output",
];

const FORKING_WRAPPERS = new Set(["env", "sudo", "nohup", "timeout", "gtimeout", "exec"]);

const REASONS = {
  "klartext-uebernahme-mutate":
    "the isolated Arbeits-PC copy under /home/vsole/uebernahme-arbeits-pc must not be modified or destroyed; use bin/fm-klartext-uebernahme-index.sh and the _index/ search surface instead.",
  "klartext-uebernahme-merge":
    "merging or copying the isolated Arbeits-PC copy into ~/.claude-mem is forbidden until the captain authorizes a new decision.",
  "klartext-uebernahme-export":
    "exporting the isolated Arbeits-PC copy to Drive or other mirrors is forbidden until the captain authorizes a new decision.",
};

function parseArguments(argv) {
  const result = { command: "", commandSet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    if (name === "--command") {
      if (i + 1 >= argv.length) throw new Error(`${name} requires a value`);
      result.command = argv[i + 1];
      result.commandSet = true;
      i += 1;
      continue;
    }
    if (name.startsWith("--command=")) {
      result.command = name.slice("--command=".length);
      result.commandSet = true;
      continue;
    }
    throw new Error(`unknown argument: ${name}`);
  }
  return result;
}

function deny(code) {
  return { decision: "deny", code, reason: REASONS[code] };
}

function lower(text) {
  return text.toLowerCase();
}

export function mentionsUebernahme(text) {
  const haystack = lower(text);
  return UEBERNAHME_MARKERS.some((marker) => haystack.includes(lower(marker)));
}

function mentionsClaudeMem(text) {
  const haystack = lower(text);
  return CLAUDE_MEM_MARKERS.some((marker) => haystack.includes(lower(marker)));
}

function mentionsExportTarget(text) {
  const haystack = lower(text);
  return EXPORT_MARKERS.some((marker) => haystack.includes(lower(marker)));
}

function isPipe(separator) {
  return separator === "|" || separator === "|&";
}

function nodeExecutesInParentShell(separators, index) {
  if (separators[index] === "&") return false;
  if (isPipe(separators[index]) || isPipe(separators[index - 1])) return false;
  return true;
}

function unwrapCommandWord(position) {
  let command = position.command;
  let wordIndex = position.index;
  while (command && (command.value === "builtin" || command.value === "command")) {
    wordIndex += 1;
    command = position.words[wordIndex];
  }
  return { command, wordIndex };
}

function positionText(position) {
  return position.words.map((word) => word.value).join(" ");
}

function looksLikeIndexHelper(position) {
  const text = positionText(position);
  return text.includes("fm-klartext-uebernahme-index.sh") || text.includes("suche.sh");
}

function sqliteLooksReadOnly(text) {
  const haystack = lower(text);
  if (!haystack.includes("sqlite3")) return false;
  return !SQLITE_WRITE_MARKERS.some((marker) => haystack.includes(marker));
}

function looksReadOnly(position) {
  const text = positionText(position);
  if (looksLikeIndexHelper(position)) return true;
  const { command } = unwrapCommandWord(position);
  if (!command) return false;
  if (READ_COMMANDS.has(command.value) && mentionsUebernahme(text)) return true;
  if (command.value === "sqlite3" && mentionsUebernahme(text) && sqliteLooksReadOnly(text)) return true;
  if (command.value === "bash" || command.value === "sh") {
    if (mentionsUebernahme(text) && (text.includes("suche.sh") || text.includes("_index/"))) return true;
  }
  return false;
}

function classifyPosition(position) {
  if (position.wrappers.some((wrapper) => FORKING_WRAPPERS.has(wrapper))) return null;
  const text = positionText(position);
  if (!mentionsUebernahme(text)) return null;
  if (looksReadOnly(position)) return null;

  if (mentionsClaudeMem(text)) return "klartext-uebernahme-merge";
  if (mentionsExportTarget(text)) return "klartext-uebernahme-export";

  const { command } = unwrapCommandWord(position);
  if (!command) return null;
  if (MUTATION_COMMANDS.has(command.value)) return "klartext-uebernahme-mutate";
  if (command.value === "sqlite3") return "klartext-uebernahme-mutate";
  return null;
}

export function decision(command) {
  const lexed = new Lexer(command).tokenize();
  if (lexed.error) return { decision: "allow" };

  const { nodes, separators } = splitProgram(lexed.tokens);
  for (let index = 0; index < nodes.length; index += 1) {
    if (!nodeExecutesInParentShell(separators, index)) continue;
    const code = classifyPosition(commandPosition(nodes[index]));
    if (code) return deny(code);
  }
  return { decision: "allow" };
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  try {
    return realpathSync(entry) === realpathSync(self);
  } catch {
    return entry === self;
  }
}

if (invokedDirectly()) {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (!args.commandSet || !args.command) {
      process.stdout.write("allow\n");
    } else {
      const result = decision(args.command);
      if (result.decision === "allow") {
        process.stdout.write("allow\n");
      } else {
        process.stdout.write(`deny\t${result.code}\t${result.reason}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

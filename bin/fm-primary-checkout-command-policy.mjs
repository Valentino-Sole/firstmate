#!/usr/bin/env node
// Semantic policy for the primary-checkout guard: block git discard/cleanup commands
// and crew-knowledge mutations in the plain firstmate primary checkout.
//
// Firstmate must never "reset" a dirty primary tree or touch the local
// crew-knowledge skill checkout; those changes belong in an isolated task
// worktree. Environmental scoping to the real primary checkout lives in
// bin/fm-primary-checkout-pretool-check.sh. See docs/primary-checkout-guard.md.
//
// The shell tokenizer is imported from bin/fm-arm-command-policy.mjs. This policy
// never evaluates, expands, sources, or runs any byte of the submitted command.

import { Lexer, splitProgram, commandPosition } from "./fm-arm-command-policy.mjs";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REASONS = {
  "primary-git-reset":
    "git reset is forbidden in the primary firstmate checkout; use an isolated task worktree for discard/cleanup work.",
  "primary-git-stash":
    "git stash is forbidden in the primary firstmate checkout; use an isolated task worktree instead of stashing primary changes aside.",
  "primary-git-clean":
    "git clean is forbidden in the primary firstmate checkout; use an isolated task worktree for cleanup work.",
  "primary-git-discard":
    "discarding working-tree changes with git checkout/restore is forbidden in the primary firstmate checkout; use an isolated task worktree.",
  "primary-crew-knowledge":
    "crew-knowledge is forbidden in the primary firstmate checkout; move, delete, commit, or edit it only from an isolated task worktree.",
};

const GIT_DISCARD_SUBCOMMANDS = new Set(["reset", "stash", "clean"]);
const GIT_PATH_MUTATION_SUBCOMMANDS = new Set(["add", "rm", "mv", "commit"]);
const FILE_MUTATION_COMMANDS = new Set(["rm", "mv", "cp", "mkdir", "touch", "ln", "chmod", "chown"]);
const FORKING_WRAPPERS = new Set(["env", "sudo", "nohup", "timeout", "gtimeout", "exec"]);

const CREW_KNOWLEDGE_MARKERS = [
  ".agents/skills/crew-knowledge",
  ".claude/skills/crew-knowledge",
];

function parseArguments(argv) {
  const result = { command: "", root: "", commandSet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    if (name === "--command") {
      if (i + 1 >= argv.length) throw new Error(`${name} requires a value`);
      result.command = argv[i + 1];
      result.commandSet = true;
      i += 1;
      continue;
    }
    if (name === "--root") {
      if (i + 1 >= argv.length) throw new Error(`${name} requires a value`);
      result.root = argv[i + 1];
      i += 1;
      continue;
    }
    if (name.startsWith("--command=")) {
      result.command = name.slice("--command=".length);
      result.commandSet = true;
      continue;
    }
    if (name.startsWith("--root=")) {
      result.root = name.slice("--root=".length);
      continue;
    }
    throw new Error(`unknown argument: ${name}`);
  }
  return result;
}

function deny(code) {
  return { decision: "deny", code, reason: REASONS[code] };
}

function isPipe(separator) {
  return separator === "|" || separator === "|&";
}

function nodeExecutesInParentShell(separators, index) {
  if (separators[index] === "&") return false;
  if (isPipe(separators[index]) || isPipe(separators[index - 1])) return false;
  return true;
}

function hasPathQualifiedCommandPrefix(position) {
  return position.words
    .slice(position.prefixAssignments, position.index)
    .some((word) => word.value.includes("/") && word.value.split("/").at(-1) === "command");
}

function hasCommandQueryPrefix(position) {
  let commandPrefix = false;
  for (const word of position.words.slice(position.prefixAssignments, position.index)) {
    if (word.value === "command") {
      commandPrefix = true;
      continue;
    }
    if (commandPrefix && /^-[^-]*[vV]/.test(word.value)) return true;
  }
  return false;
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

function mentionsCrewKnowledge(text) {
  if (CREW_KNOWLEDGE_MARKERS.some((marker) => text.includes(marker))) return true;
  return /(?:^|[\s'"`(])\.?\/?crew-knowledge(?:\/|$|[\s'"`)])/.test(text);
}

function gitDirectoryScopedOutsidePrimary(words, startIndex, root) {
  const rootReal = root ? path.resolve(root) : "";
  for (let i = startIndex + 1; i < words.length; i += 1) {
    const word = words[i].value;
    if (word === "-C" || word === "--git-dir" || word === "--work-tree") {
      const target = words[i + 1]?.value;
      if (!target) return false;
      if (word === "-C") {
        if (target === "." || target === "./") return false;
        const resolved = path.isAbsolute(target) ? target : path.resolve(rootReal || process.cwd(), target);
        if (rootReal && resolved !== rootReal) return true;
        if (!rootReal && target !== "." && target !== "./") return true;
      }
      return false;
    }
    if (word === "--") break;
    if (!word.startsWith("-")) break;
    if (word.startsWith("-C")) {
      const inline = word.slice(2);
      if (!inline) continue;
      if (inline === "." || inline === "./") return false;
      const resolved = path.isAbsolute(inline) ? inline : path.resolve(rootReal || process.cwd(), inline);
      if (rootReal && resolved !== rootReal) return true;
      if (!rootReal) return true;
      return false;
    }
  }
  return false;
}

function gitSubcommand(words, startIndex) {
  for (let i = startIndex + 1; i < words.length; i += 1) {
    const word = words[i].value;
    if (word === "--") {
      return words[i + 1]?.value || "";
    }
    if (word.startsWith("-")) continue;
    return word;
  }
  return "";
}

function gitLooksLikeDiscardCheckout(words, startIndex) {
  const args = words.slice(startIndex + 1).map((word) => word.value);
  if (args.includes("restore")) return true;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg !== "checkout") continue;
    for (let j = i + 1; j < args.length; j += 1) {
      const next = args[j];
      if (next === "--" || next === ".") return true;
      if (next.startsWith("-") && next !== "--") continue;
      if (next === "HEAD" && args[j + 1] === "--") return true;
      break;
    }
    return false;
  }
  return false;
}

function classifyGitPosition(position, root) {
  const { command, wordIndex } = unwrapCommandWord(position);
  if (!command || command.value !== "git") return null;
  if (position.wrappers.some((wrapper) => FORKING_WRAPPERS.has(wrapper))) return null;
  if (gitDirectoryScopedOutsidePrimary(position.words, wordIndex, root)) return null;

  const subcommand = gitSubcommand(position.words, wordIndex);
  if (!subcommand) return null;
  if (GIT_DISCARD_SUBCOMMANDS.has(subcommand)) {
    if (subcommand === "reset") return "primary-git-reset";
    if (subcommand === "stash") return "primary-git-stash";
    if (subcommand === "clean") return "primary-git-clean";
  }
  if (gitLooksLikeDiscardCheckout(position.words, wordIndex)) return "primary-git-discard";
  const positionText = position.words.map((word) => word.value).join(" ");
  if (GIT_PATH_MUTATION_SUBCOMMANDS.has(subcommand) && mentionsCrewKnowledge(positionText)) {
    return "primary-crew-knowledge";
  }
  return null;
}

function classifyFileMutation(position) {
  const { command } = unwrapCommandWord(position);
  if (!command || !FILE_MUTATION_COMMANDS.has(command.value)) return null;
  if (position.wrappers.some((wrapper) => FORKING_WRAPPERS.has(wrapper))) return null;
  const positionText = position.words.map((word) => word.value).join(" ");
  if (!mentionsCrewKnowledge(positionText)) return null;
  return "primary-crew-knowledge";
}

function decision(command, root) {
  const lexed = new Lexer(command).tokenize();
  if (lexed.error) return { decision: "allow" };

  const { nodes, separators } = splitProgram(lexed.tokens);
  for (let index = 0; index < nodes.length; index += 1) {
    if (!nodeExecutesInParentShell(separators, index)) continue;
    const position = commandPosition(nodes[index]);
    if (hasPathQualifiedCommandPrefix(position)) continue;
    if (hasCommandQueryPrefix(position)) continue;

    const gitCode = classifyGitPosition(position, root);
    if (gitCode) return deny(gitCode);

    const fileCode = classifyFileMutation(position);
    if (fileCode) return deny(fileCode);
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
      const result = decision(args.command, args.root);
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

export { decision, mentionsCrewKnowledge };

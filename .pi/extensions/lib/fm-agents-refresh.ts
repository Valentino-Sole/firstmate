// Live project-instruction refresh for the Pi primary's system prompt.
//
// Pi reads every context file (AGENTS.md and its ancestors) once, when the
// process starts, and embeds each one in the system prompt as a
// <project_instructions path="..."> block. A firstmate self-update that lands
// while the primary is alive therefore leaves the running session on the stale
// copy for the rest of the process. Firstmate used to bridge that gap by
// printing the complete current AGENTS.md into every post-compaction digest,
// which costs the whole file again on every compaction for as long as the
// drift lasts.
//
// This module owns the cheaper path: on each before_agent_start, compare every
// embedded block against the file currently on disk and, when one differs,
// return a system prompt with the current content swapped in. Pi applies that
// returned prompt to the whole agent run and resets to its base prompt
// afterwards, so the swap must be recomputed at every prompt; it is one file
// read and one string compare per block, and nothing is returned while the
// embedded copies still match the disk, so the provider prompt cache is only
// disturbed when the instructions really changed.
//
// The block shape mirrors Pi's own buildSystemPrompt(): the embedded content is
// the file read verbatim (BOM stripped, no trimming), so a file that ends in a
// newline leaves one blank line before the closing tag. The pattern below
// tolerates that exactly and never touches a block whose path is not a
// readable regular file.
import { readFileSync, statSync } from "node:fs";

const blockPattern = /<project_instructions path="([^"]*)">\n([\s\S]*?)\n<\/project_instructions>\n/g;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function readInstructionFile(path: string): string | undefined {
  try {
    if (!statSync(path).isFile()) return undefined;
    return stripBom(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

// Returns the system prompt with every drifted project_instructions block
// replaced by its current on-disk content, or undefined when nothing drifted
// (including an empty prompt or one without any block).
export function refreshProjectInstructions(
  systemPrompt: string,
  readCurrent: (path: string) => string | undefined = readInstructionFile,
): string | undefined {
  if (!systemPrompt) return undefined;
  let changed = false;
  const refreshed = systemPrompt.replace(blockPattern, (block, path: string, embedded: string) => {
    const current = readCurrent(path);
    if (current === undefined || current === embedded) return block;
    changed = true;
    return `<project_instructions path="${path}">\n${current}\n</project_instructions>\n`;
  });
  return changed ? refreshed : undefined;
}

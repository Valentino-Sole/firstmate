// Laedt die Browser-Skripte des Spiels in Node (ohne DOM), fuer Tests und Simulationen.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const dir = path.dirname(fileURLToPath(import.meta.url));

export function loadGame() {
  const ctx = { console, Math, Date, JSON };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["data.js", "engine.js"]) {
    vm.runInContext(readFileSync(path.join(dir, "..", "src", f), "utf8"), ctx, { filename: f });
  }
  return ctx.SB;
}

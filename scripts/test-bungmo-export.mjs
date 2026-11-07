import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "booong-bungmo-export-"));
try {
  await mkdir(join(directory, "scripts"));
  await mkdir(join(directory, "bungmo-app/out"), { recursive: true });
  await cp(new URL("./export-bungmo.mjs", import.meta.url), join(directory, "scripts/export-bungmo.mjs"));
  await writeFile(join(directory, "bungmo-app/out/index.html"), "built app");
  await mkdir(join(directory, "bungmo")); // Vercel can preserve an excluded directory without its contents.
  const run = () => spawnSync(process.execPath, ["scripts/export-bungmo.mjs"], { cwd: directory, encoding: "utf8" });
  assert.equal(run().status, 0);
  assert.equal(await readFile(join(directory, "bungmo/index.html"), "utf8"), "built app");
  assert.equal(run().status, 0, "Previously generated output can be refreshed");
  await rm(join(directory, "bungmo/.generated"));
  await writeFile(join(directory, "bungmo/keep.txt"), "manual file");
  assert.notEqual(run().status, 0, "Manual directories must never be replaced");
  assert.equal(await readFile(join(directory, "bungmo/keep.txt"), "utf8"), "manual file");
  console.log("Bungmo static export and manual-file protection passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}

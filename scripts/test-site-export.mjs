import assert from "node:assert/strict";
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "booong-site-export-"));
try {
  for (const name of ["scripts", "assets", "bungmo", "api", "bungmo-app", "rice-basket", "lib"]) await mkdir(join(root, name));
  await cp(new URL("./export-site.mjs", import.meta.url), join(root, "scripts/export-site.mjs"));
  for (const name of ["index.html", "assets/image.svg", "bungmo/index.html", "rice-basket/index.html", "lib/private.js", "api/private.js", "bungmo-app/private.js", ".env.local"]) await writeFile(join(root, name), name);
  const run = () => spawnSync(process.execPath, ["scripts/export-site.mjs"], { cwd: root, encoding: "utf8" });
  await mkdir(join(root, "public"));
  assert.equal(run().status, 0);
  assert.equal(await readFile(join(root, "public/bungmo/index.html"), "utf8"), "bungmo/index.html");
  assert.deepEqual((await readdir(join(root, "public"))).sort(), [".generated", "assets", "bungmo", "index.html", "rice-basket"]);
  assert.equal(run().status, 0);
  await cp(new URL("../rice-basket/", import.meta.url), join(root, "rice-basket"), { recursive: true });
  await mkdir(join(root, "js"));
  await writeFile(join(root, "js/admin.js"), "");
  assert.equal(run().status, 0);
  for (const name of (await readdir(join(root, "public/rice-basket"))).filter(name => name.endsWith(".js"))) {
    const file = join(root, "public/rice-basket", name);
    for (const [, specifier] of (await readFile(file, "utf8")).matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*['"](\.[^'"]+)['"]/g)) {
      await access(resolve(dirname(file), specifier));
    }
  }
  await rm(join(root, "public/.generated"));
  await writeFile(join(root, "public/keep.txt"), "manual");
  assert.notEqual(run().status, 0);
  assert.equal(await readFile(join(root, "public/keep.txt"), "utf8"), "manual");
  console.log("Site export preserves frontend files, excludes server secrets, and protects manual directories.");
} finally {
  await rm(root, { recursive: true, force: true });
}

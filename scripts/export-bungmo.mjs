import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

const destination = new URL("../bungmo/", import.meta.url);
const marker = new URL(".generated", destination);
await access(new URL("../bungmo-app/out/index.html", import.meta.url));
try {
  await access(destination);
  if ((await readFile(marker, "utf8")) !== "booong-bungmo\n") throw new Error("Refusing to replace a manually created bungmo directory");
  await rm(destination, { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  // A missing marker must not turn an existing directory into disposable output.
  if (await access(destination).then(() => true, () => false) && (await readdir(destination)).length) throw new Error("Bungmo output marker missing");
}
await mkdir(destination, { recursive: true });
await cp(new URL("../bungmo-app/out/", import.meta.url), destination, { recursive: true });
await writeFile(marker, "booong-bungmo\n");
console.log("Bungmo exported to /bungmo/");

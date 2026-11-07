import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("public/", root);
try {
  if (await readFile(new URL(".generated", output), "utf8") !== "booong-site\n") throw new Error("Refusing to replace manual public directory");
  await rm(output, { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  if ((await readdir(root)).includes("public") && (await readdir(output)).length) throw new Error("Public output marker missing");
}
await mkdir(output, { recursive: true });
const directories = new Set(["assets", "blog-assets", "css", "data", "js", "lessons", "mockups", "bungmo", "rice-basket"]);
const files = new Set(["members.json", "members-profile.csv", "robots.txt", "sitemap.xml"]);
for (const entry of await readdir(root, { withFileTypes: true })) {
  if ((entry.isDirectory() && directories.has(entry.name)) || (entry.isFile() && (entry.name.endsWith(".html") || files.has(entry.name)))) {
    await cp(new URL(entry.name, root), new URL(entry.name, output), { recursive: true });
  }
}
await writeFile(new URL(".generated", output), "booong-site\n");
console.log("Site static files exported to /public/; API functions remain server-side");

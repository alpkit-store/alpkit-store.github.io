import { readdir, readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { marked } from "marked";
import { renderIndex, renderRepoPage } from "./lib/render.mjs";

const DATA = "data";
const DIST = "dist";

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

let entries = [];
try {
  entries = await readdir(DATA, { withFileTypes: true });
} catch {
  console.warn("WARN: no data/ directory yet — building an empty site");
}
const names = entries.filter((d) => d.isDirectory()).map((d) => d.name).sort();

const repos = [];
for (const name of names) {
  const meta = JSON.parse(await readFile(`${DATA}/${name}/meta.json`, "utf8"));
  const md = await readFile(`${DATA}/${name}/README.md`, "utf8");
  repos.push({ ...meta, readmeHtml: marked.parse(md) });
}

await writeFile(`${DIST}/index.html`, renderIndex(repos));
for (const repo of repos) {
  await mkdir(`${DIST}/${repo.name}`, { recursive: true });
  await writeFile(`${DIST}/${repo.name}/index.html`, renderRepoPage(repo));
}
await cp("site", DIST, { recursive: true });

console.log(`Built ${repos.length} repo pages into ${DIST}/`);

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { listPublicDocsRepos, fetchReadme } from "./lib/github.mjs";
import { generateSummary } from "./lib/summarize.mjs";

const DATA = "data";

const orgToken = process.env.ORG_READ_TOKEN;
if (!orgToken) {
  console.error("ORG_READ_TOKEN is required (a PAT with org repo read access)");
  process.exit(1);
}
const modelsToken = process.env.MODELS_TOKEN || orgToken;

const repos = await listPublicDocsRepos(orgToken);
console.log(`Found ${repos.length} repos with the public-docs topic`);

const keep = new Set();
for (const repo of repos) {
  const readme = await fetchReadme(orgToken, repo.name);
  if (readme === null) {
    console.warn(`WARN: ${repo.name} is opted in but has no README — skipped`);
    continue;
  }
  keep.add(repo.name);

  const readmeHash = createHash("sha256").update(readme).digest("hex");
  const dir = `${DATA}/${repo.name}`;

  let existing = null;
  try {
    existing = JSON.parse(await readFile(`${dir}/meta.json`, "utf8"));
  } catch {}

  let { summary, category, summarizedAt } = existing || {};
  if (!summary || existing.readmeHash !== readmeHash) {
    try {
      ({ summary, category } = await generateSummary(repo, readme, modelsToken));
      summarizedAt = new Date().toISOString();
      console.log(`Summarised ${repo.name} (${category})`);
    } catch (err) {
      console.warn(`WARN: summary failed for ${repo.name}: ${err.message}`);
      if (!summary) {
        summary = repo.description || "No summary available yet.";
        category = "Utilities";
      }
    }
  }

  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/README.md`, readme);
  await writeFile(
    `${dir}/meta.json`,
    JSON.stringify(
      {
        name: repo.name,
        description: repo.description,
        pushedAt: repo.pushedAt,
        topics: repo.topics,
        readmeHash,
        summary,
        category,
        summarizedAt,
      },
      null,
      2
    ) + "\n"
  );
}

let dataEntries = [];
try {
  dataEntries = await readdir(DATA, { withFileTypes: true });
} catch {}
for (const entry of dataEntries) {
  if (entry.isDirectory() && !keep.has(entry.name)) {
    await rm(`${DATA}/${entry.name}`, { recursive: true });
    console.log(`Removed ${entry.name} (no longer opted in)`);
  }
}

console.log("Sync complete");

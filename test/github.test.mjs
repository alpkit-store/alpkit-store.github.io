import { test } from "node:test";
import assert from "node:assert/strict";
import { listPublicDocsRepos, fetchReadme } from "../scripts/lib/github.mjs";

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test("listPublicDocsRepos filters to non-archived repos with the public-docs topic", async () => {
  const fetchImpl = async () => jsonResponse([
    { name: "tool-a", archived: false, topics: ["public-docs"], description: "A", pushed_at: "2026-01-01T00:00:00Z" },
    { name: "tool-b", archived: false, topics: [], description: "B", pushed_at: "2026-01-01T00:00:00Z" },
    { name: "tool-c", archived: true, topics: ["public-docs"], description: "C", pushed_at: "2026-01-01T00:00:00Z" },
  ]);
  const repos = await listPublicDocsRepos("tok", fetchImpl);
  assert.deepEqual(repos.map((r) => r.name), ["tool-a"]);
  assert.equal(repos[0].description, "A");
});

test("listPublicDocsRepos paginates until a short page", async () => {
  const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `r${i}`, archived: false, topics: ["public-docs"], pushed_at: null }));
  const page2 = [{ name: "last", archived: false, topics: ["public-docs"], pushed_at: null }];
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return jsonResponse(calls.length === 1 ? page1 : page2); };
  const repos = await listPublicDocsRepos("tok", fetchImpl);
  assert.equal(repos.length, 101);
  assert.equal(calls.length, 2);
});

test("listPublicDocsRepos throws on API error", async () => {
  const fetchImpl = async () => jsonResponse({ message: "bad" }, 401);
  await assert.rejects(() => listPublicDocsRepos("tok", fetchImpl), /401/);
});

test("fetchReadme returns raw text", async () => {
  const result = await fetchReadme("tok", "tool-a", async () => ({ ok: true, status: 200, text: async () => "# Hi" }));
  assert.equal(result, "# Hi");
});

test("fetchReadme returns null on 404", async () => {
  const result = await fetchReadme("tok", "tool-a", async () => ({ ok: false, status: 404, text: async () => "" }));
  assert.equal(result, null);
});

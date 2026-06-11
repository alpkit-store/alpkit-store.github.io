import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSummary, CATEGORIES } from "../scripts/lib/summarize.mjs";

function modelResponse(content) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => "" };
}

const repo = { name: "x", description: "" };

test("generateSummary parses the model's JSON", async () => {
  const fetchImpl = async () => modelResponse('{"summary": "Does a thing.", "category": "Shopify"}');
  const result = await generateSummary(repo, "# readme", "tok", fetchImpl);
  assert.deepEqual(result, { summary: "Does a thing.", category: "Shopify" });
});

test("generateSummary extracts JSON wrapped in prose or code fences", async () => {
  const fetchImpl = async () => modelResponse('Here you go:\n```json\n{"summary": "S.", "category": "Utilities"}\n```');
  const result = await generateSummary(repo, "# readme", "tok", fetchImpl);
  assert.equal(result.summary, "S.");
});

test("generateSummary falls back to Utilities for an unknown category", async () => {
  const fetchImpl = async () => modelResponse('{"summary": "S.", "category": "Blockchain"}');
  const result = await generateSummary(repo, "# readme", "tok", fetchImpl);
  assert.equal(result.category, "Utilities");
});

test("generateSummary throws when the response has no JSON or empty summary", async () => {
  await assert.rejects(() => generateSummary(repo, "#", "tok", async () => modelResponse("Sorry, no.")), /no JSON/i);
  await assert.rejects(() => generateSummary(repo, "#", "tok", async () => modelResponse('{"summary": "", "category": "Shopify"}')), /summary missing/i);
});

test("generateSummary throws on API error", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "rate limited", json: async () => ({}) });
  await assert.rejects(() => generateSummary(repo, "#", "tok", fetchImpl), /429/);
});

test("generateSummary throws a descriptive error when extracted JSON is invalid", async () => {
  const content = '{"summary": "S.", "category": "Shopify"}\nNote: config uses {key: value} syntax.';
  await assert.rejects(() => generateSummary(repo, "#", "tok", async () => modelResponse(content)), /invalid JSON/i);
});

test("CATEGORIES is the fixed taxonomy", () => {
  assert.deepEqual(CATEGORIES, ["Shopify", "Khaos Control", "Operations & monitoring", "Marketing & members", "Utilities"]);
});

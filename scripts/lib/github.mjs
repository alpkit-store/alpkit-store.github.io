const API = "https://api.github.com";
const ORG = "alpkit-store";
const TOPIC = "public-docs";

function headers(token, accept) {
  return { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" };
}

export async function listPublicDocsRepos(token, fetchImpl = fetch) {
  const repos = [];
  for (let page = 1; ; page++) {
    const res = await fetchImpl(`${API}/orgs/${ORG}/repos?per_page=100&page=${page}`, {
      headers: headers(token, "application/vnd.github+json"),
    });
    if (!res.ok) throw new Error(`Listing org repos failed: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos
    .filter((r) => !r.archived && (r.topics || []).includes(TOPIC))
    .map((r) => ({
      name: r.name,
      description: r.description || "",
      pushedAt: r.pushed_at,
      topics: r.topics || [],
    }));
}

export async function fetchReadme(token, name, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}/repos/${ORG}/${name}/readme`, {
    headers: headers(token, "application/vnd.github.raw+json"),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`README fetch failed for ${name}: ${res.status} ${await res.text()}`);
  return await res.text();
}

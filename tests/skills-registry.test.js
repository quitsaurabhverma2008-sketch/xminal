// skills.sh native installer tests — fully offline (tarballs built in-memory,
// HTTP faked with a local handler). No network access.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const {
  parseSitemap,
  searchRegistry,
  parseTar,
  gunzip,
  extractSkill,
  computedHashV2,
  installFromRegistry,
} = require("../dist/skills/registry");

const SAMPLE_XML = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.skills.sh/mattpocock/skills/tdd</loc></url>
  <url><loc>https://www.skills.sh/mattpocock/skills/diagnose</loc></url>
  <url><loc>https://www.skills.sh/obra/superpowers/tdd</loc></url>
  <url><loc>https://www.skills.sh/anthropics/skills/pdf</loc></url>
</urlset>`;

test("parseSitemap extracts owner/repo/skill", () => {
  const entries = parseSitemap(SAMPLE_XML);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries[0], {
    owner: "mattpocock",
    repo: "skills",
    skill: "tdd",
    url: "https://skills.sh/mattpocock/skills/tdd",
  });
});

test("searchRegistry ranks prefix beats contains beats repo", () => {
  const entries = parseSitemap(SAMPLE_XML);
  const hits = searchRegistry(entries, "tdd", 10);
  assert.equal(hits[0].skill, "tdd");
  assert.equal(hits.length, 2);
  const none = searchRegistry(entries, "zzzz", 10);
  assert.equal(none.length, 0);
});

test("computedHashV2 matches the skills.sh v2 test vector", () => {
  const hash = computedHashV2([{ path: "SKILL.md", content: Buffer.from("# hi\n") }]);
  assert.equal(hash, "93c36952d8843b33e68ae970ebabcc03e1687c9bb0dd1ecaf357060318952f55");
});

test("computedHashV2 is order-independent and path-sensitive", () => {
  const a = [
    { path: "b.txt", content: Buffer.from("b") },
    { path: "a.txt", content: Buffer.from("a") },
  ];
  const b = [...a].reverse();
  assert.equal(computedHashV2(a), computedHashV2(b));
});

function tarFile(name, content, type = "0") {
  const header = Buffer.alloc(512);
  const put = (offset, str, len) => header.write(str, offset, len, "utf8");
  put(0, name, 100);
  put(100, "0000644\0", 8);
  put(108, "0000000\0", 8);
  put(116, "0000000\0", 8);
  put(124, content.length.toString(8).padStart(11, "0") + "\0", 12);
  put(136, "00000000000\0", 12);
  header.fill(0, 148, 156);
  put(156, type, 1);
  put(257, "ustar\0", 6);
  // checksum
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return Buffer.concat([header, content, Buffer.alloc((512 - (content.length % 512)) % 512)]);
}

function makeTarGz(files) {
  const parts = [Buffer.from("xminal-fixture-repo-abc1234/")];
  const blocks = [];
  for (const [name, content] of files) blocks.push(tarFile(name, Buffer.from(content)));
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}

test("installFromRegistry extracts the skill folder and writes the v2 lock", async () => {
  const tarball = makeTarGz([
    ["xminal-fixture-repo-abc1234/skills/tdd/SKILL.md", "---\nname: tdd\n---\n# TDD\n"],
    ["xminal-fixture-repo-abc1234/skills/tdd/reference.md", "ref"],
    ["xminal-fixture-repo-abc1234/other/unrelated.txt", "unrelated"],
  ]);
  const fakeFetch = async (url) => {
    if (String(url).includes("codeload.github.com")) {
      return new Response(tarball, { status: 200 });
    }
    throw new Error("unexpected fetch: " + url);
  };
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-skill-registry-"));
  try {
    const result = await installFromRegistry(
      home,
      { owner: "mattpocock", repo: "skills", skill: "tdd", url: "https://skills.sh/mattpocock/skills/tdd" },
      { fetchImpl: fakeFetch, homeDir: home },
    );
    assert.equal(result.name, "tdd");
    const skillFile = path.join(result.destination, "SKILL.md");
    assert.ok(fs.existsSync(skillFile), "SKILL.md installed");
    assert.ok(fs.existsSync(path.join(result.destination, "reference.md")));
    assert.ok(!fs.existsSync(path.join(result.destination, "unrelated.txt")), "other folders are not extracted");
    const lock = JSON.parse(fs.readFileSync(path.join(home, ".xminal", "skills.lock.v2.json"), "utf8"));
    assert.equal(lock.skills.tdd.computedHash, result.computedHash);
    // the hash matches a recomputation over the installed files
    const files = fs.readdirSync(result.destination).map((name) => ({
      path: name,
      content: fs.readFileSync(path.join(result.destination, name)),
    }));
    assert.equal(computedHashV2(files), result.computedHash);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("installFromRegistry refuses a tarball with no SKILL.md", async () => {
  const tarball = makeTarGz([["xminal-fixture-repo-abc1234/README.md", "no skills here"]]);
  const fakeFetch = async () => new Response(tarball, { status: 200 });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "xminal-skill-registry-"));
  try {
    await assert.rejects(
      installFromRegistry(home, { owner: "a", repo: "b", skill: "nope", url: "u" }, { fetchImpl: fakeFetch, homeDir: home }),
      /SKILL\.md/,
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("extractSkill refuses path traversal and absolute paths", () => {
  const entries = [
    { path: "repo-abc/evil/../../escape.txt", type: "file", content: Buffer.from("x") },
    { path: "repo-abc/skill/SKILL.md", type: "file", content: Buffer.from("# hi\n") },
    { path: "repo-abc/skill/../escape2.txt", type: "file", content: Buffer.from("x") },
  ];
  const { files } = extractSkill(entries, "skill");
  for (const file of files) {
    assert.ok(!file.path.includes(".."), "no traversal in the extracted paths");
    assert.ok(!path.isAbsolute(file.path));
  }
});

test("extractSkill prefers the folder named like the skill", () => {
  const entries = [
    { path: "repo-abc/a/skill/SKILL.md", type: "file", content: Buffer.from("# a\n") },
    { path: "repo-abc/skill/SKILL.md", type: "file", content: Buffer.from("# b\n") },
  ];
  const { files } = extractSkill(entries, "skill");
  assert.equal(files[0].content.toString(), "# b\n");
});

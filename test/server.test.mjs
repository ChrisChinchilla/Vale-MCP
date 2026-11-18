// End-to-end: spawn the built server over stdio and call tools through the real MCP client.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "test", "fixtures");
const entry = path.join(root, "build", "index.js");

async function connect(env = {}, cwd = fixtures) {
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: [entry],
    cwd,
    env: { ...process.env, ...env },
    stderr: "ignore",
  });
  await client.connect(transport);
  return client;
}

const text = (result) => result.content[0].text;

let client;
before(async () => {
  client = await connect();
});
after(async () => {
  await client.close();
});

test("lists all tools with filter inputs", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["check_directory", "check_file", "check_text", "explain_rule", "list_rules", "vale_status", "vale_sync"]
  );
  for (const name of ["check_file", "check_text", "check_directory"]) {
    const props = tools.find((t) => t.name === name).inputSchema.properties;
    assert.ok(props.min_severity && props.max_issues, `${name} has filter inputs`);
  }
});

test("vale_status reports Vale installed", async () => {
  const r = await client.callTool({ name: "vale_status", arguments: {} });
  assert.equal(JSON.parse(text(r)).installed, true);
});

test("check_text returns text and structuredContent", async () => {
  const r = await client.callTool({
    name: "check_text",
    arguments: { text: "A foobaz and foobar.", text_file_ext: ".md", config_path: path.join(fixtures, ".vale.ini") },
  });
  assert.ok(!r.isError);
  assert.equal(r.structuredContent.summary.total, 2);
  assert.equal(r.structuredContent.truncated, false);
  assert.match(text(r), /Vale linting results/);
});

test("check_text applies min_severity and max_issues", async () => {
  const base = { text: "A foobaz and foobar.", text_file_ext: ".md", config_path: path.join(fixtures, ".vale.ini") };
  const errors = await client.callTool({ name: "check_text", arguments: { ...base, min_severity: "error" } });
  assert.equal(errors.structuredContent.summary.total, 1);
  const capped = await client.callTool({ name: "check_text", arguments: { ...base, max_issues: 1 } });
  assert.equal(capped.structuredContent.issues.length, 1);
  assert.equal(capped.structuredContent.truncated, true);
});

test("check_directory returns per-file issues", async () => {
  const r = await client.callTool({
    name: "check_directory",
    arguments: { path: path.join(fixtures, "docs"), config_path: path.join(fixtures, ".vale.ini") },
  });
  assert.ok(!r.isError);
  assert.equal(r.structuredContent.summary.total, 3);
  assert.ok(r.structuredContent.issues.every((i) => i.file));
});

test("input validation rejects bad arguments", async () => {
  const r = await client.callTool({ name: "check_text", arguments: { text: "x", max_issues: -1 } });
  assert.equal(r.isError, true);
  assert.match(text(r), /max_issues/);
});

test("a missing style points the user at vale_sync", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vale-mcp-e2e-"));
  fs.writeFileSync(path.join(dir, ".vale.ini"), "StylesPath = styles\n[*.md]\nBasedOnStyles = Missing\n");
  fs.mkdirSync(path.join(dir, "styles"));
  fs.writeFileSync(path.join(dir, "a.md"), "hi\n");
  const r = await client.callTool({ name: "check_file", arguments: { path: path.join(dir, "a.md") } });
  assert.equal(r.isError, true);
  assert.match(text(r), /vale_sync/);
});

test("an unrelated failure does not suggest vale_sync", async () => {
  const r = await client.callTool({ name: "check_file", arguments: { path: path.join(fixtures, "nope.md") } });
  assert.equal(r.isError, true);
  assert.match(text(r), /not found or not readable/);
  assert.doesNotMatch(text(r), /vale_sync/);
});

test("vale_sync succeeds for a config with no packages", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vale-mcp-e2e-"));
  fs.writeFileSync(path.join(dir, ".vale.ini"), "StylesPath = styles\n[*.md]\nBasedOnStyles =\n");
  const r = await client.callTool({ name: "vale_sync", arguments: { config_path: path.join(dir, ".vale.ini") } });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /sync successful/i);
});

test("VALE_ALLOWED_ROOTS is enforced through the server, including vale_sync", async () => {
  const restricted = await connect({ VALE_ALLOWED_ROOTS: fixtures });
  try {
    const f = await restricted.callTool({ name: "check_file", arguments: { path: "/etc/hosts" } });
    assert.equal(f.isError, true);
    assert.match(text(f), /Access denied/);

    const s = await restricted.callTool({ name: "vale_sync", arguments: { config_path: "/etc/.vale.ini" } });
    assert.equal(s.isError, true);
    assert.match(text(s), /Access denied|outside the directories/);

    const ok = await restricted.callTool({ name: "check_file", arguments: { path: path.join(fixtures, "bad.md") } });
    assert.ok(!ok.isError);
  } finally {
    await restricted.close();
  }
});

test("list_rules and explain_rule work through the server", async () => {
  const config_path = path.join(fixtures, ".vale.ini");
  const list = await client.callTool({ name: "list_rules", arguments: { config_path } });
  assert.ok(!list.isError, text(list));
  assert.deepEqual(list.structuredContent.rules.map((r) => r.name), ["Test.Foo", "Test.Swap"]);
  assert.match(text(list), /\*\*Test\.Swap\*\* \(error, substitution\)/);

  const explain = await client.callTool({ name: "explain_rule", arguments: { rule: "Test.Swap", config_path } });
  assert.ok(!explain.isError, text(explain));
  assert.match(text(explain), /swap:/);
  assert.match(text(explain), /`\*\.md`: enabled/);

  const bad = await client.callTool({ name: "explain_rule", arguments: { rule: "../x", config_path } });
  assert.equal(bad.isError, true);
  assert.match(text(bad), /Invalid rule name/);
});

test("exposes the active config as a resource", async () => {
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map((r) => r.uri), ["vale://config"]);
  const r = await client.readResource({ uri: "vale://config" });
  assert.match(r.contents[0].text, /BasedOnStyles = Test/);
  assert.match(r.contents[0].text, /fixtures[\\/]\.vale\.ini/);
});

test("the config resource explains when there is no config, and honours VALE_ALLOWED_ROOTS", async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "vale-mcp-e2e-"));
  const noConfig = await connect({ VALE_CONFIG_PATH: "" }, empty);
  try {
    const r = await noConfig.readResource({ uri: "vale://config" });
    assert.match(r.contents[0].text, /No \.vale\.ini was found/);
  } finally {
    await noConfig.close();
  }

  const restricted = await connect({ VALE_ALLOWED_ROOTS: empty });
  try {
    await assert.rejects(restricted.readResource({ uri: "vale://config" }), /Access denied|outside the directories/);
  } finally {
    await restricted.close();
  }
});

test("lists and renders prompts", async () => {
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name).sort(), ["explain_style_rule", "fix_style_issues", "review_text"]);

  const fix = await client.getPrompt({ name: "fix_style_issues", arguments: { path: "docs/a.md" } });
  assert.equal(fix.messages[0].role, "user");
  assert.match(fix.messages[0].content.text, /docs\/a\.md/);
  assert.match(fix.messages[0].content.text, /min_severity "warning"/);

  const strict = await client.getPrompt({ name: "fix_style_issues", arguments: { path: "a.md", min_severity: "error" } });
  assert.match(strict.messages[0].content.text, /min_severity "error"/);

  const review = await client.getPrompt({ name: "review_text", arguments: { text: "Hello there." } });
  assert.match(review.messages[0].content.text, /Hello there\./);

  const explain = await client.getPrompt({ name: "explain_style_rule", arguments: { rule: "write-good.Passive" } });
  assert.match(explain.messages[0].content.text, /explain_rule.*write-good\.Passive/);

  await assert.rejects(client.getPrompt({ name: "fix_style_issues", arguments: {} }), /path/);
});

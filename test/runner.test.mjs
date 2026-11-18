import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { checkFile, checkText, checkDirectory, listRules, explainRule, getValeSetup, isSupportedValeVersion, MAX_TEXT_BYTES } from "../build/vale-runner.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const config = path.join(fixtures, ".vale.ini");

test("check_file finds issues", async () => {
  const r = await checkFile(path.join(fixtures, "bad.md"), config);
  assert.equal(r.summary.warnings, 1);
  assert.equal(r.issues[0].check, "Test.Foo");
});

test("check_text finds issues via stdin", async () => {
  const r = await checkText("This has foobar in it.", ".md", config);
  assert.equal(r.summary.warnings, 1);
});

test("shell metacharacters in paths are not executed", async () => {
  const marker = path.join(os.tmpdir(), `vale-mcp-injection-${process.pid}`);
  const evil = `x"; touch ${marker}; echo "`;
  await assert.rejects(checkFile(evil));
  await assert.rejects(checkFile(path.join(fixtures, "bad.md"), `${config}" ; touch ${marker} ; "`));
  await assert.rejects(checkText("hello", `.md"; touch ${marker}; "`));
  assert.equal(fs.existsSync(marker), false);
});

test("check_text rejects oversized input", async () => {
  await assert.rejects(checkText("a".repeat(MAX_TEXT_BYTES + 1), ".md", config), /too large/);
});

test("VALE_ALLOWED_ROOTS blocks paths outside the roots", async () => {
  process.env.VALE_ALLOWED_ROOTS = fixtures;
  try {
    await assert.rejects(checkFile("/etc/hosts"), /Access denied/);
    await assert.rejects(checkFile(path.join(fixtures, "..", "..", "package.json")), /Access denied/);
    const r = await checkFile(path.join(fixtures, "bad.md"), config);
    assert.equal(r.summary.warnings, 1);
  } finally {
    delete process.env.VALE_ALLOWED_ROOTS;
  }
});

test("VALE_ALLOWED_ROOTS blocks symlink escapes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vale-mcp-"));
  fs.symlinkSync("/etc/hosts", path.join(dir, "link.md"));
  process.env.VALE_ALLOWED_ROOTS = dir;
  try {
    await assert.rejects(checkFile(path.join(dir, "link.md")), /Access denied/);
  } finally {
    delete process.env.VALE_ALLOWED_ROOTS;
  }
});

test("Vale-reported config errors surface as readable errors", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vale-mcp-"));
  fs.writeFileSync(path.join(dir, ".vale.ini"), "StylesPath = styles\n[*.md]\nBasedOnStyles = Missing\n");
  fs.mkdirSync(path.join(dir, "styles"));
  fs.writeFileSync(path.join(dir, "a.md"), "hi\n");
  await assert.rejects(checkFile(path.join(dir, "a.md"), path.join(dir, ".vale.ini")), /E201.*StylesPath/);
});

test("isSupportedValeVersion", () => {
  assert.equal(isSupportedValeVersion("vale version 3.27.0"), true);
  assert.equal(isSupportedValeVersion("vale version 2.30.0"), false);
  assert.equal(isSupportedValeVersion(undefined), true);
});

test("--version prints to stdout", () => {
  const out = execFileSync("node", [path.join(fixtures, "..", "..", "build", "index.js"), "--version"], { encoding: "utf-8" });
  assert.match(out.trim(), /^\d+\.\d+\.\d+/);
});

test("check_directory lints recursively and tags issues with their file", async () => {
  const r = await checkDirectory(path.join(fixtures, "docs"), config);
  assert.equal(r.summary.total, 3);
  assert.deepEqual([...new Set(r.issues.map((i) => path.basename(i.file)))].sort(), ["a.md", "b.md"]);
  await assert.rejects(checkDirectory(path.join(fixtures, "bad.md"), config), /Directory not found/);
});

test("min_severity and max_issues filter results", async () => {
  const dir = path.join(fixtures, "docs");
  const errorsOnly = await checkDirectory(dir, config, { minSeverity: "error" });
  assert.equal(errorsOnly.summary.total, 2);
  assert.ok(errorsOnly.issues.every((i) => i.severity === "error"));

  const capped = await checkDirectory(dir, config, { maxIssues: 1 });
  assert.equal(capped.issues.length, 1);
  assert.equal(capped.summary.total, 3);
  assert.equal(capped.truncated, true);
  assert.match(capped.formatted, /first 1 of 3/);
});

test("suggested fixes are exposed", async () => {
  const r = await checkText("A foobaz.", ".md", config);
  const swap = r.issues.find((i) => i.check === "Test.Swap");
  assert.deepEqual(swap.action, { name: "replace", params: ["quux"] });
  assert.match(r.formatted, /Suggested fix: replace \("quux"\)/);
});

test("list_rules lists rules of the active styles", async () => {
  const { rules, total, truncated } = await listRules(config);
  assert.deepEqual(rules.map((r) => r.name), ["Test.Folded", "Test.Foo", "Test.Swap"]);
  assert.equal(total, 3);
  assert.equal(truncated, false);
  const swap = rules.find((r) => r.name === "Test.Swap");
  assert.equal(swap.extends, "substitution");
  assert.equal(swap.level, "error");
  assert.equal(swap.message, "Use '%s' instead of '%s'.");
  assert.deepEqual(swap.sections, [{ glob: "*.md", enabled: true, level: "error" }]);
});

test("list_rules reads folded and literal block scalars", async () => {
  const { rules } = await listRules(config, "Test");
  const folded = rules.find((r) => r.name === "Test.Folded");
  assert.equal(folded.message, "Folded message across two lines for '%s'.");
  assert.equal(folded.description, "Literal line one\nliteral line two");
  assert.equal(folded.level, "suggestion");
});

test("list_rules reflects disabled rules and level overrides, and filters by style", async () => {
  const { rules } = await listRules(path.join(fixtures, "disabled.ini"), "Test");
  assert.equal(rules.find((r) => r.name === "Test.Foo").sections[0].enabled, false);
  assert.equal(rules.find((r) => r.name === "Test.Swap").sections[0].level, "suggestion");
  await assert.rejects(listRules(config, "Nope"), /not used by the active Vale config/);
});

test("list_rules includes Vale's built-in rules when the Vale style is used", async () => {
  const { rules } = await listRules(path.join(fixtures, "disabled.ini"), "Vale");
  assert.deepEqual(rules.map((r) => r.name), ["Vale.Avoid", "Vale.Repetition", "Vale.Spelling", "Vale.Terms"]);
  assert.ok(rules.every((r) => r.builtin && r.description && r.link));
});

test("list_rules max_rules truncates but reports the total", async () => {
  const r = await listRules(config, "Test", 2);
  assert.equal(r.rules.length, 2);
  assert.equal(r.total, 3);
  assert.equal(r.truncated, true);
});

test("explain_rule returns the definition and where the rule is active", async () => {
  const r = await explainRule("Test.Swap", config);
  assert.match(r.definition, /swap:/);
  assert.equal(r.file, path.join(fixtures, "styles", "Test", "Swap.yml"));
  assert.equal(r.rule.sections[0].glob, "*.md");
});

test("explain_rule rejects bad names, built-ins and unknown rules", async () => {
  await assert.rejects(explainRule("../../etc/passwd", config), /Invalid rule name/);
  await assert.rejects(explainRule("Test/../Foo", config), /Invalid rule name/);
  await assert.rejects(explainRule("nodot", config), /Invalid rule name/);
  await assert.rejects(explainRule("Test.Nope", config), /not found/);
  await assert.rejects(explainRule("Vale.Nope", path.join(fixtures, "disabled.ini")), /not found/);
});

test("explain_rule describes built-in rules without a file", async () => {
  const r = await explainRule("Vale.Spelling", path.join(fixtures, "disabled.ini"));
  assert.equal(r.rule.builtin, true);
  assert.match(r.rule.description, /misspelled/);
  assert.equal(r.file, undefined);
  assert.equal(r.definition, undefined);
});

test("explain_rule honours VALE_ALLOWED_ROOTS", async () => {
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "vale-mcp-"));
  process.env.VALE_ALLOWED_ROOTS = other;
  try {
    await assert.rejects(explainRule("Test.Swap", config), /Access denied/);
    await assert.rejects(listRules(config), /Access denied/);
  } finally {
    delete process.env.VALE_ALLOWED_ROOTS;
  }
});

test("getValeSetup reports config, packages and installed styles", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vale-mcp-"));
  fs.mkdirSync(path.join(dir, "styles", "Alpha"), { recursive: true });
  fs.mkdirSync(path.join(dir, "styles", "config"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".vale.ini"), "StylesPath = styles\nPackages = Alpha, Beta\n[*.md]\nBasedOnStyles = Alpha\n");
  const info = await getValeSetup(path.join(dir, ".vale.ini"));
  assert.equal(info.configPath, path.join(dir, ".vale.ini"));
  assert.deepEqual(info.packages, ["Alpha", "Beta"]);
  assert.deepEqual(info.installedStyles, ["Alpha"]);
});

test("getValeSetup does not throw without a config or when access is denied", async () => {
  const none = await getValeSetup(undefined);
  assert.deepEqual(none.packages, []);
  process.env.VALE_ALLOWED_ROOTS = os.tmpdir();
  try {
    const denied = await getValeSetup(config);
    assert.deepEqual(denied.packages, []);
    assert.deepEqual(denied.installedStyles, []);
  } finally {
    delete process.env.VALE_ALLOWED_ROOTS;
  }
});

test("VALE_TIMEOUT_MS kills a slow Vale run with a clear error", async () => {
  process.env.VALE_TIMEOUT_MS = "1";
  try {
    await assert.rejects(checkText("A foobaz.", ".md", config), /timed out/);
    await assert.rejects(checkFile(path.join(fixtures, "bad.md"), config), /timed out/);
  } finally {
    delete process.env.VALE_TIMEOUT_MS;
  }
  const ok = await checkText("A foobaz.", ".md", config);
  assert.equal(ok.summary.total, 1);
});

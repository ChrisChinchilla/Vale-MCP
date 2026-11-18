import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { checkFile, checkText, checkDirectory, isSupportedValeVersion, MAX_TEXT_BYTES } from "../build/vale-runner.js";

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

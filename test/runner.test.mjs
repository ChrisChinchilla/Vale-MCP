import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { checkFile, checkText, MAX_TEXT_BYTES } from "../build/vale-runner.js";

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

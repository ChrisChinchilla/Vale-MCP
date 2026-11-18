---
name: release
description: Cut a release of vale-mcp. Bumps the version, finalizes CHANGELOG, opens a release PR, then (after it is merged) creates the GitHub Release, which triggers the npm publish workflow. Use when the user says "cut a release", "release", "publish a new version" or "ship 0.x".
---

# Release vale-mcp

Publishing is automated: creating a **GitHub Release** runs
`.github/workflows/publish.yml`, which does `npm ci` + `npm publish
--provenance` using the `NPM_TOKEN` secret. Never run `npm publish` locally.
The release PR itself changes nothing outward-facing; creating the GitHub
Release does, so only do that step when the user has asked for the release.

## 1. Preconditions

- `git checkout main && git pull`; working tree clean (ignore untracked `.idea/`).
- CI green on `main`: `gh run list --workflow CI --branch main --limit 1`.
- Secret exists: `gh secret list` shows `NPM_TOKEN`.
- Compare with what's live: `npm view vale-mcp version`.

## 2. Choose the version (semver)

Read `## Unreleased` in `CHANGELOG.md` and `git log <last tag or release>..HEAD`.
- Breaking change to tool names/inputs/outputs or env vars → major (while
  0.x, bump minor instead).
- New tool, input or feature → minor.
- Fixes/dependency-only → patch.
If unsure, ask the user. State the chosen version and why.

## 3. Release PR

1. `git checkout -b release/X.Y.Z`
2. `npm version X.Y.Z --no-git-tag-version` (edits `package.json` and the lockfile).
3. `CHANGELOG.md`: rename `## Unreleased` to `## Version X.Y.Z - <short title> (YYYY-MM-DD)`,
   and put a fresh empty `## Unreleased` above it if there's unreleased work to come.
4. `npm test` (it rebuilds `build/`; `build/` is committed and CI fails if it
   differs from a fresh build). Commit anything it changed.
5. Add a short entry to `.claude/history.md` if anything non-obvious happened,
   and tick/move items in `ROADMAP.md`.
6. Commit, push, `gh pr create --base main`, wait for CI (`gh pr checks`).
7. **Stop and ask the user to merge the PR** (they merge PRs themselves).

## 4. Create the release (after the PR is merged)

1. `git checkout main && git pull`; confirm `package.json` version is X.Y.Z and
   `gh run list --workflow CI --branch main --limit 1` is green.
2. Write the release notes from the CHANGELOG section to a temp file in the
   scratchpad, then:
   `gh release create vX.Y.Z --target main --title "vX.Y.Z" --notes-file <file>`
   (the publish workflow refuses to run if the tag doesn't match `package.json`).
3. Watch it: `gh run list --workflow "Publish to npm" --limit 1`, then
   `gh run watch <id>`.

## 5. Verify

- `npm view vale-mcp version` shows X.Y.Z (the registry can lag a minute).
- Smoke test from outside the repo: `cd $(mktemp -d) && npx -y vale-mcp@X.Y.Z --version`
  prints X.Y.Z.
- Report the release URL and npm version to the user.

## If something fails

- Publish workflow fails on version mismatch: the tag and `package.json`
  differ. Delete the release and tag (`gh release delete vX.Y.Z --cleanup-tag`,
  with the user's OK), fix via a new PR, and release again.
- `EOTP` ("requires a one-time password") on publish: `NPM_TOKEN` is a token
  that still needs 2FA. Replace the secret with a granular access token that
  has write access to `vale-mcp` and **"Bypass two-factor authentication"**
  enabled (or a classic Automation token), or switch to npm trusted
  publishing (package Settings → Trusted Publisher: repo
  `ChrisChinchilla/Vale-MCP`, workflow `publish.yml`; needs npm >= 11.5.1 in
  the workflow and no `NODE_AUTH_TOKEN`). Then `gh run rerun <run-id>`; the
  release and tag already exist, so don't recreate them.
- `403`/`E404` on publish: `NPM_TOKEN` is missing, expired, or lacks publish
  rights for the package. Ask the user to refresh the secret.
- "Cannot publish over existing version": the version already exists on npm;
  bump again. npm versions can't be reused.

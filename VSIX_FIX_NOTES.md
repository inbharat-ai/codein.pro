# VSIX Build Fix — textmate-syntaxes ENOENT

## The Bug

The VSIX build fails during the "Prepackage the extension" step with:

```
ENOENT: no such file or directory, mkdir '.../packages/extension/gui/textmate-syntaxes'
UnhandledPromiseRejection in build script
```

## Root Cause

In `packages/extension/scripts/prepackage.js` (lines 280-296), the `ncp` library is used
to copy `packages/extension/textmate-syntaxes/` into `packages/extension/gui/textmate-syntaxes/`.

The parent directory `packages/extension/gui/` is listed in `packages/extension/.gitignore`
(the rule `gui/**`), so it does **not exist** in a clean CI checkout. The `ncp` library does
not create missing parent directories — it only works when the immediate parent of the
destination already exists. Since `gui/` doesn't exist, `ncp` throws ENOENT.

Locally, the directory exists as a leftover from previous builds, so the error only
manifests in CI.

## The Fix

**File:** `packages/extension/scripts/prepackage.js`

Added `fs.mkdirSync(textmateDest, { recursive: true })` before the `ncp` call to ensure
the destination directory (and its parent `gui/`) is created before the copy starts.
The `{ recursive: true }` flag means it's a no-op if the directory already exists.

## Impact

- No test changes required — this is a build script fix only (`.js`, not `.ts`).
- No TypeScript compilation impact.
- No GUI build impact.
- The fix is backward-compatible: `mkdirSync` with `recursive: true` is safe when the
  directory already exists.

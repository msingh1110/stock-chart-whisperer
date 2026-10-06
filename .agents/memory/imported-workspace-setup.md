---
name: Imported workspace setup
description: Runtime selection caveat when restoring dependencies in an imported workspace.
---

The package-install helper can select Node.js 20 even when an imported project's documentation specifies Node.js 24.

**Why:** During import setup, the helper selected Node.js 20; the updated API generator subsequently failed because Map.groupBy was unavailable.

**How to apply:** Check the actual Node.js runtime after using the helper. Restore the project's supported runtime through the language-module tools before running code generation; do not add compatibility shims to generated code.

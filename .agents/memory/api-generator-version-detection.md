---
name: API generator version detection
description: Why explicit API generator compatibility targets are needed in this workspace.
---

Do not rely on API-generator auto-detection to identify dependency versions declared through a pnpm catalog.

**Why:** The updated generator emitted React Query v4 options despite a v5 runtime, and Zod v4 integer APIs despite generated modules importing Zod 3. Existing endpoints without integer schemas did not expose the Zod mismatch; adding integer fields did.

**How to apply:** When changing generator versions or API schemas, check the actual runtime dependencies and keep explicit output compatibility targets. Regenerate from the configuration; never repair compatibility by hand-editing generated sources.

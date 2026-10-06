---
name: GitHub push authentication
description: Distinguishing native source-control authentication from GitHub app integrations.
---

For an invalid-token error from native Git, treat the Git provider authorization separately from GitHub app integrations.

**Why:** The source-control connection reported healthy OAuth and already-active access while Git pushes still failed. Standard integration reconnect/attach prompts rejected this provider. Official Replit documentation identifies a separate Git Providers authentication flow; reconnecting Connected Services alone may not repair it. Reading a public remote also does not prove write access.

**How to apply:** Check current Replit documentation and actual Git results rather than treating integration metadata as a successful login. For this failure, ask the user to reconnect GitHub under account settings → Git Providers, then retry a normal non-forced push. Never ask for a token in chat or replace the remote with credentials.

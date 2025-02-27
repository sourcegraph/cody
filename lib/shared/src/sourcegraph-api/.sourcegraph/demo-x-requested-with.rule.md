---
title: No X-Requested-With header in demos
description: Only allow the X-Requested-With header in non-demo mode
lang: typescript
---

Only set the `X-Requested-With` header in non-demo mode, because the demo mode is running in a local server and thus the backend will regard it as an untrusted cross-origin request.

Instead of:

```typescript
const headers: { [header: string]: string } = {
    // ...
    'X-Requested-With': `${clientName} ${clientVersion}`,
}
```

Use this:

```typescript
const headers: { [header: string]: string } = {
    // ...
}
if (!process.env.CODY_WEB_DEMO) {
    headers['X-Requested-With'] = `${clientName} ${clientVersion}`
}
```

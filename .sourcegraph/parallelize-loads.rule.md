---
title: Parallelize ops in SvelteKit load functions
description: Don't wait serially for each Promise to resolve in a SvelteKit load()
tags: ["security", "api", "svelte"]
lang: typescript
---

In a SvelteKit `+page.ts`, `+layout.ts`, `+page.server.ts`, `+layout.server.ts` file, do not wait serially on each operation to complete. Instead, return promises.

For example, instead of:

```typescript
export const load: PageLoad = async () => {
  const foo = await listFoo()
  const bar = await getBar()
  return { foo, bar }
}
```

Use this:

```typescript
export const load: PageLoad = async () => {
  const foo = listFoo()
  const bar = getBar()
  return { foo, bar }
}
```

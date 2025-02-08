---
title: Use Svelte 5
---

Use Svelte 5 instead of Svelte 4:

- `let { a, b }: { a: T1, b: T2} = $props()` for props instead of `export let`
- Snippets (`{@render foo()}`) instead of slots
- `onclick` instead of `on:click`, etc.

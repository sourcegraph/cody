---
title: Do not use scrollIntoView in a VS Code webview
---

Using `HTMLElement.scrollIntoView()` in a VS Code webview causes the iframe to be incorrectly positioned, chopping off the top ~5px and adding an empty void in the bottom ~5px.

Instead, only scroll the nearest ancestor scrollable container:

```typescript
const container = e.closest('[data-scrollable]')
if (container && container instanceof HTMLElement) {
    container.scrollTop = e.offsetTop - container.offsetTop
}
```
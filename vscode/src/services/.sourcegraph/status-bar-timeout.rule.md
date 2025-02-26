---
title: Set status bar timeouts correctly
description: Set timeouts for status bar using ms to wait instead of ms since epoch
lang: typescript
---

When setting the remove timeout for status bar loaders and errors, we incorrectly treat `StatusBarErrorArgs.timeout` as a timestamp representing milliseconds since the epoch. However, every usage example passes the timeout as a number representing how many milliseconds to wait.

Instead of:

```typescript
addError(args: StatusBarErrorArgs) {
    const now = Date.now()
    const ttl = args.timeout !== undefined ? Math.min(ONE_HOUR, args.timeout - now) : ONE_HOUR // subtracting now, incorrect
    // ...
    const scheduledRemoval = setTimeout(remove, ttl)
    // ...
}
```

Use this:

```typescript
addError(args: StatusBarErrorArgs) {
    const ttl = args.timeout !== undefined ? Math.min(ONE_HOUR, args.timeout) : ONE_HOUR // don't subtract now, correct
    // ...
    const scheduledRemoval = setTimeout(remove, ttl)
    // ...
}
```

So an example of correct usage would be:

```typescript
this.config.statusBar.addLoader({
    title: 'Completions are being generated',
    timeout: 30_000,
})
```

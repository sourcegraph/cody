---
title: Verify instanceof errors
description: Ensure that instanceof errors are used to check for specific error types in TypeScript
lang: typescript
---

For try-catch code, ensure that the catch block uses `instanceof` to ensure that the thrown error is of the correct type.

For example, instead of:

```typescript
try {
    throw "This is a string error";
} catch (err) {
    console.error(err.message);
}
```

Use this:

```typescript
try {
    throw "This is a string error";
} catch (err) {
    if (err instanceof Error) {
        console.error(err.message);
    } else {
        console.error("An unknown error occurred:", err);
    }
}
```

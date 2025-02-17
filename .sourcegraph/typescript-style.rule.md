---
title: TypeScript style suggestions
description: General style suggestions for writing TypeScript code.
tags: ["style"]
lang: typescript
---

Use the following style suggestions when writing Typescript code:

Functions should be designed to operate on the minimal set of data required. Avoid passing large objects if the function only uses a small subset of the object's properties.

Instead of multiple boolean flags or optional properties that could lead to invalid combinations, model state with union types. This leverages TypeScript's type system to enforce correctness at compile time.

Instead of:

```typescript
interface ComponentState {
  isLoading: boolean
  error?: Error
  user?: User
}
// Possible to have isLoading = true AND user != undefined, which is invalid.
```

Use this:

```typescript
type ComponentState = {
  userOrError?: User | Error
}
// Here, undefined represents loading, and a defined value means either a successful fetch or an error

// Then to check the type in your code, use typeguards
const cs: ComponentState = { userOrError: undefined }
if (cs.userOrError === undefined) {
    // loading
} else if (cs.userOrError instanceof Error) {
    // error
} else {
    // user
}
```

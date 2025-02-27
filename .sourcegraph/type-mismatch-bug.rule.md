---
title: Type mismatch
description: Incorrect usage of types and operations different types
tags: ["bug", "logic"]
---

Identify the following issues:

- Incompatible types in arithmetic or logical operations
- Incorrect types used in function calls or assignments
- Using inappropriate types for specific purposes
- Neglecting to use language-specific types for certain operations


Examples:

```typescript
// TypeScript: Type mismatch in operation
let x: number = 5;
let y: string = "10";
let z = x + y;  // This will perform string concatenation, not addition
```

```go
// Go: Incorrect type for array length
var arr [5]int
length := len(arr)
var newArr [length]int  // Compile error: array length must be constant
```

---
title: Operator usage
description: Incorrect use of operators in code logic can cause confusion and errors
tags: ["bug", "logic"]
---

Identify the following issues:

- Incorrect equality operators
- Misuse of comparison operators
- Misuse of compound operators 

Examples:

```
let x = 5;
if (x =+ 1) {  // Incorrect, should be x += 1 or x = x + 1
    console.log("X was incremented");
}
```

```
// Complex boolean expression
if (a && b || c && !d || e && f && !g) {
    // This could be hard to understand and maintain
}
```

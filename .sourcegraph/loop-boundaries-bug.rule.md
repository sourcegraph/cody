---
title: Loop boundaries
description: Incorrect usage of loop boundaries and conditions
tags: ["bug", "logic"]
---

Identify the following issues:

- Incorrect loop termination conditions
- Confusion between '<' and '<=' in loop conditions
- Incorrect loop boundaries

Examples:

```
// Incorrect: Misses the last element
for (int i = 0; i < arr.length - 1; i++) {
    System.out.println(arr[i]);
}
```

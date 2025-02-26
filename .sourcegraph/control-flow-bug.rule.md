---
title: Control flows
description: Incorrect usage control flows like switch and case statements
tags: ["bug", "logic"]
---

Identify the following issues:

- Misplaced break statements
- Unintended switch fall-throughs
- Potential infinite loops due to incorrect loop conditions 

Examples:

```
switch (day) {
    case 1:
        System.out.println("Monday");
        // Missing break statement, unintended fall-through
    case 2:
        System.out.println("Tuesday");
        break;
}

for (int i = 0; i < 10; i--) {  // Incorrect loop condition
    // This will result in an infinite loop
}
```

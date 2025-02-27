---
title: Race conditions
description: Common issues causing race conditions in code execution
tags: ["bug", "logic"]
---

Identify the following issues:

- Shared mutable state accessed without synchronization
- Inconsistent ordering of operations across threads

Example:

```java
// Race condition: unsynchronized access to shared state
public class Counter {
    private int count = 0;

    public void increment() {
        count++; // This operation is not atomic
    }

    public int getCount() {
        return count;
    }
}
```

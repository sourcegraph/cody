---
title: Array Index
description: Misuse of array indexes
tags: ["bug", "logic"]
---

Identify the following issues:

- Array access beyond array limits
- Incorrect array indexing in zero-based index languages
- Array bounds violations

Example:

```python
# Incorrect: Accessing an index that doesn't exist
arr = [1, 2, 3, 4, 5]
for i in range(6):
    print(arr[i])  # This will cause an error on the last iteration
```

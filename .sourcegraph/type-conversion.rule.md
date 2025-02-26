---
title: Type conversions
description: Implicit type conversions can cause data corruption or errors when create or read data
tags: ["bug", "logic"]
---

Identify the following issues:

- Unexpected type coercion
- Incorrect use of the proper type

Examples:

```javascript
// JavaScript: Implicit type conversion leading to unexpected results
let x = "5" + 3;  // Results in "53" (string concatenation) instead of 8
```

```python
# Python: Implicit conversion in comparison
if "5" > 4:  # This will not raise an error, but might not be intended
    print("This will actually print!")
```

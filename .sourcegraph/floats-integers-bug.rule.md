---
title: Floats and integers
description: Incorrect use of floats and integers
tags: ["bug", "logic"]
---

Identify the following issues:

- Unwanted or unintended conversions from floating-point to integer types
- Operations between different floating-point precisions

Example:

```csharp
// C#: Precision loss in floating-point to integer conversion
double x = 1.9;
int y = (int)x;  // y will be 1, losing the decimal part
```

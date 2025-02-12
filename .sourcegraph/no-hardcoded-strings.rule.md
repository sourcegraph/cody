---
title: No hardcoded strings
description: Avoid using and comparing against hardcoded strings
---

Avoid using a hardcoded string in multiple places. Instead, use a constant or variable.

For example, instead of:

```go
person.Name = "Alice"
if person.Name == "Alice" {
    // Do something
}
```

Use this:

```go
const Name = "Alice"

person.Name = Name
if person.Name == Name {
    // Do something
}
```

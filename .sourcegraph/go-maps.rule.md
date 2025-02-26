---
title: Go map initialization
description: Initialize Go maps using make or map literal.
lang: go
---

Maps should always be initialized to a non-nil value. Avoid `var m map[K]V` without immediate initialization.

Bad example:
```go
var m map[string]int
```

Good examples:
```go
m1 := make(map[string]int)
m2 := map[string]int{}
```

---
title: Go global variable names
description: Name Go global variables clearly.
lang: go
---

Append "Global" to the names of package-level global variables that are mutated. This clarifies their mutable nature.

Bad example:
```go
var config
```

Good example:
```go
var configGlobal
```

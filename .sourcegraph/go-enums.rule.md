---
title: Go enum best practices
description: Best practices for using enums in Go
tags: ["style"]
lang: go
---

Use the following best practices when working with enums in Go:

String-based enums should be preferred over integer-based enums for better readability and debugging capabilities. String values make the code self-documenting and easier to understand at runtime.

Bad example:
```go
type Status int

const (
    StatusActive Status = 1
    StatusPaused Status = 2
    StatusDeleted Status = 3
)
```

Good example:
```go
type Status string

const (
    StatusActive Status = "active"
    StatusPaused Status = "paused"
    StatusDeleted Status = "deleted"
)
```

You can use integer-based enums when they make more sense than string-based enums. When using integer-based enums, always start with iota + 1 instead of iota to ensure the zero-value remains invalid and intentionally unused.

When checking multiple cases of an enum, use a switch statement instead of a chain of if-else statements. Switch statements on enums should have a default case. If the default case should be unreachable, use `core.PanicUnknownEnumCase()`.

Good example:
```go
switch val {
case EnumVal1:
    // ...
case EnumVal2:
    // ...
default:
    core.PanicUnknownEnumCase(val) // Or handle the unexpected case
}
```

Name enum constants as either CaseName (if unambiguous within the package) or TypePrefix_CaseName. Avoid MixedCase or acronyms for the type prefix.

Bad Example:
```go
const CGRLS_Override // Unclear acronym
const CodyGatewayRateLimitSourceOverride // Hard to distinguish type and case
```

Good example:
```go
const Override // If clear enough
const RateLimitSource_Override // Clear type prefix and case name
```

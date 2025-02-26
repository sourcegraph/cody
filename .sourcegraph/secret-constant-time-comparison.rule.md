---
title: Constant Time Comparisons
description: When checking the value of a secret, a constant time comparison function should be used
tags: ["security", "secrets"]
---

When checking the value of a secret against a known value, always use a constant time comparison function.
This is especially important when checking user-provided input, such as checking an API token sent via a web API.

For example, instead of using a standard string comparison:

```go
handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if conf.Get().AuthToken != r.Header.Get("Authorization") {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    [...]
```

Use a constant time comparision:

```go
handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    if subtle.ConstantTimeCompare([]byte(conf.Get().AuthToken), []byte(r.Header.Get("Authorization"))) != 1 {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    [...]
```

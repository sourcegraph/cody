---
title: Insecure Sources of Randomness
description: A secure random generator should be used for cryptographic operations, such as generating API keys or authentication tokens. Insecure sources of randomness can result in predicable outputs.
tags: ["security", "rand"]
---

Infer how the output of a random generator will be used from context, and ensure that an appropriate source of randomness is used.
For example, when the output is used for a security-sensitive task, such as to generate an API key or authentication token, ensure that a cryptographically secure random generator is used. 

For example, instead of:

```go
import "math/rand"

func GenerateAPIKey() string {
    r := rand.New()

    b := make([]byte, length)
    for i := range b {

    [...]
```

Use:

```go
import "crypto/rand"

func GenerateAPIKey() string {
	b := make([]byte, length)
	_, err := rand.Read(b)

    [...]
```

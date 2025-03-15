---
title: Uninitialized Variables
description: Variables used before assignment or partially initialized.
tags: ["bug", "logic", "variables"]
---

Identify the following issues:

- Variables used before assignment
- Partial initialization of complex objects

Examples:

```c
// C: Use of uninitialized variable
int main() {
    int x;
    printf("%d", x);  // x is uninitialized
    return 0;
}
```

```java
// Java: Partial initialization of object
class Person {
    private String name;
    private int age;

    public Person(String name) {
        this.name = name;
        // age is left uninitialized
    }
}
```

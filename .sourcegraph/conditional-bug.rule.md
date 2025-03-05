---
title: Conditional statements
description: Complex or deeply nested conditions make code unreadable and difficult to maintain. Can introduce bugs and missing conditions.
tags: ["bug", "logic"]
---

Identify the following issues:

- Missing conditions that won't be handled and return an error
- Complex if-else conditional chains, with more than 5 conditions
- Deeply nested conditionals with more than 5 layers of depth

Examples:

```
# Complex if-else chain
if condition1:
    do_thing1()
elif condition2:
    do_thing2()
elif condition3:
    do_thing3()
elif condition4:
    do_thing4()
elif condition5:
    do_thing5()
else:
    do_thing6()
```

```
# Nested conditional
if a:
    if b:
        if c:
            if d:
                if e:
                    do_something()
                else:
                    do_something_else()
```

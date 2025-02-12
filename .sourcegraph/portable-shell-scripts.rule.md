---
title: Portable shell scripts
description: Ensure shell scripts work on Linux and macOS
tags: ["shell", "portability"]
lang: shell
---

In shell scripts, use commands that work identically on Linux and macOS.

- Do not use `sed -i`
- Ensure the `find` command has an explicit path (`find . -name ...` or `find my-dir -name ...`, not `find -name ...`)

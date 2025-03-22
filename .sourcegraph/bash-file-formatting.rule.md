---
title: Bash file formatting
description: Best practices for writing Bash scripts.
tags: ["shell"]
lang: sh
---

Use the following best practices when writing Bash scripts/code:

Set `-eu -o pipefail` (this is generally "bash strict mode"). Use this at the start of all scripts and specifically disabling if a section of a bash script does not need them (for example, you want to let a pipe fail).

Always include a shebang. Start your script with `#!/bin/bash` (or `#!/usr/bin/env bash` for better portability) to explicitly specify the Bash interpreter.

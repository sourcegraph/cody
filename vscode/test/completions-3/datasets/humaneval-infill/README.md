# HumanEval Infill

## Overview

Sourced from https://github.com/openai/human-eval-infilling

164 test cases in Python, a mix of multi-line and single-line completions.

## Additional Information

There are some minor modifications to the original dataset:

- Keys are updated to match internal usage, e.g. `task_id` -> `id` and so on.
- Removed cases where text is immediately in the suffix (e.g. "{CURSOR}return 1"). We don't support these cases for completions.

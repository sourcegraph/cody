---
title: Bash style suggestions
description: General style suggestions for writing Bash scripts.
lang: sh
---

Use the following style suggestions when writing Bash scripts/code:

Use `mapfile` instead of `while IFS` to read a file:

```sh
mapfile -t myArray < file.txt
mapfile -t myArray < <(find -d .)
```

instead of:

```sh
input="/path/to/txt/file"
while IFS= read -r line
do
  echo "$line"
done < "$input"
```


Set `-eu -o pipefail` (this is generally "bash strict mode" and sets).

Recommend using these at the start of all scripts and specifically disabling if a section of a bash script does not need them (for example, you want to let a pipe fail).

# !/bin/bash

# kalan's poor man changelog generator, this will be replaced by the release team's changelog automation

git log $1..$2 --pretty='%s' --boundary | sed -E 's/^(.*)\(#(.*)\)$/- \1 [pull\/\2](https:\/\/github.com\/sourcegraph\/cody\/pulls\/\2)/' > temp_changes.txt

# Find first occurrence of ### Uncategorized and append the changes right after it
awk '/### Uncategorized/{if (!found) {print; system("cat temp_changes.txt"); found=1; next}} 1' vscode/CHANGELOG.md > temp_changelog.md

# Replace original file with new content
mv temp_changelog.md vscode/CHANGELOG.md

# Clean up
rm temp_changes.txt


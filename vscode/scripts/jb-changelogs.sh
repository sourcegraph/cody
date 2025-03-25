#!/bin/bash

# this script will gather all the changes between 2 versions and add them to the uncategorized section of the changelog.
# to use this script, you will need to run `vscode/scripts/changelog.sh <from-commit> <to-commit>`

# you can find the commits at each release using:
# git ls-remote https://github.com/sourcegraph/cody | grep "refs/tags/vscode-\(insiders-\)\?v1\.[0-9]\+\.[0-9]\+" | less

# Help message
usage() {
    echo "Usage: $0 <from-tag> <to-tag>"
    echo "Generate JetBrains changelog between two tags"
    echo ""
    echo "Example:"
    echo "  $0 jb-v7.65.0 jb-v7.66.0"
    exit 1
}

# Error handling
if [ "$#" -ne 2 ]; then
    usage
fi

trap 'rm -f temp_changes.txt filtered_changes.txt' EXIT

# Define paths to include
INCLUDE_PATHS=(
    "jetbrains/"
    "lib/"
    "agent/"
    "vscode/webviews/"
)

# Define domains to group by with proper capitalization
DOMAINS=(
    "Autocomplete"
    "Chat"
    "Edit"
    "Models" 
    "Agent"
    "Context"
    "Prompts"
    "Settings"
    "Logging"
    "CI"
    "Release"
)

# Convert array to awk pattern
PATHS_PATTERN=$(printf "|^%s" "${INCLUDE_PATHS[@]}")
PATHS_PATTERN=${PATHS_PATTERN:1}  # Remove leading |

# Get PR titles with changed files between tags
if ! git log $1..$2 --pretty='format:%s' --name-only --boundary | sed -E 's/^(.*)\(#(.*)\)$/- \1 [pull\/\2](https:\/\/github.com\/sourcegraph\/cody\/pull\/\2)/' > temp_changes.txt; then
    echo "Error: Failed to get git log"
    exit 1
fi

# Process the changes and filter based on paths
awk -v paths="$PATHS_PATTERN" '
BEGIN { pr = ""; files = "" }
/^-/ { 
    if (pr && (files ~ paths)) {
        print pr
    }
    pr = $0
    files = ""
    next
}
/^[a-zA-Z]/ { 
    files = files ? files "\n" $0 : $0
}
END {
    if (pr && (files ~ paths)) {
        print pr
    }
}' temp_changes.txt > filtered_changes.txt

echo "### Features" > formatted_changes.md
for domain in "${DOMAINS[@]}"; do
    domain_lower=$(echo "$domain" | tr '[:upper:]' '[:lower:]')
    matches=$(grep -i "^- feat($domain_lower)" filtered_changes.txt)
    if [ ! -z "$matches" ]; then
        echo -e "\n#### $domain" >> formatted_changes.md
        echo "$matches" >> formatted_changes.md
    fi
done
grep "^- feat" filtered_changes.txt | grep -v "^- feat(" >> formatted_changes.md

echo -e "\n### Fixes" >> formatted_changes.md
for domain in "${DOMAINS[@]}"; do
    domain_lower=$(echo "$domain" | tr '[:upper:]' '[:lower:]')
    matches=$(grep -i "^- fix($domain_lower)" filtered_changes.txt)
    if [ ! -z "$matches" ]; then
        echo -e "\n#### $domain" >> formatted_changes.md
        echo "$matches" >> formatted_changes.md
    fi
done
grep "^- fix" filtered_changes.txt | grep -v "^- fix(" >> formatted_changes.md

echo -e "\n### Changes" >> formatted_changes.md
for domain in "${DOMAINS[@]}"; do
    domain_lower=$(echo "$domain" | tr '[:upper:]' '[:lower:]')
    matches=$(grep -i "^- changed($domain_lower)" filtered_changes.txt)
    if [ ! -z "$matches" ]; then
        echo -e "\n#### $domain" >> formatted_changes.md
        echo "$matches" >> formatted_changes.md
    fi
done
grep "^- changed" filtered_changes.txt | grep -v "^- changed(" >> formatted_changes.md

echo -e "\n### Chores" >> formatted_changes.md
for domain in "${DOMAINS[@]}"; do
    domain_lower=$(echo "$domain" | tr '[:upper:]' '[:lower:]')
    matches=$(grep -i "^- chore($domain_lower)" filtered_changes.txt)
    if [ ! -z "$matches" ]; then
        echo -e "\n#### $domain" >> formatted_changes.md
        echo "$matches" >> formatted_changes.md
    fi
done
grep "^- chore" filtered_changes.txt | grep -v "^- chore(" >> formatted_changes.md

# Catch any ungrouped changes
echo -e "\n### Uncategorized" >> formatted_changes.md
grep -v "^- \(feat\|fix\|changed\|chore\)" filtered_changes.txt >> formatted_changes.md

# Clean up temporary files and rename the output
mv formatted_changes.md JB-CHANGELOG.md
rm temp_changes.txt filtered_changes.txt
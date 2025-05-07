#!/bin/bash

###############################################################################
# Cody JetBrains Changelog Generator
# 
# This script generates a formatted changelog for JetBrains plugin releases
# by filtering git commits between two tags and organizing them by type and domain.
# It only includes changes relevant to the JetBrains extension (jetbrains/),
# shared libraries (lib/), agent, and shared webviews.
#
# Usage: ./vscode/scripts/jb-changelogs.sh <from-tag> <to-tag>
# Example: ./vscode/scripts/jb-changelogs.sh jb-v7.65.0 jb-v7.66.0
#
# The output is saved to JB-CHANGELOG.md in the current directory.
###############################################################################

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

# Add trap for cleanup on exit
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
    echo "Error: Failed to get git log between $1 and $2. Please verify the tags exist."
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

# Define a function to process each section type
process_section() {
    local type="$1"
    local title="$2"
    local grep_pattern="^- $type"
    local section_content=""
    local domain_content=""
    
    for domain in "${DOMAINS[@]}"; do
        domain_lower=$(echo "$domain" | tr '[:upper:]' '[:lower:]')
        matches=$(grep -i "^- $type($domain_lower)" filtered_changes.txt)
        if [ ! -z "$matches" ]; then
            domain_content="${domain_content:-}\n### $domain\n$matches"
            section_content="has_content"
        fi
    done
    
    # Only write the section if it has content
    if [ ! -z "$section_content" ]; then
        echo -e "\n## $title" >> "$output_file"
        echo -e "$domain_content" >> "$output_file"
        return 0
    fi
    return 1
}

output_file="formatted_changes.md"
> "$output_file"  # Initialize empty file

# Add version information to the top of the generated changelog
echo "# Changes from $1 to $2" > "$output_file"

process_section "feat" "Features"
process_section "fix" "Fixes"
process_section "changed" "Changes"
process_section "chore" "Chores"

# Handle completely uncategorized entries (this was missing)
uncategorized=$(grep -v "^- \(feat\|fix\|changed\|chore\)" filtered_changes.txt)
if [ ! -z "$uncategorized" ]; then
    echo -e "\n## Uncategorized" >> "$output_file"
    echo "$uncategorized" >> "$output_file"
fi

# Clean up temporary files and rename the output
mv formatted_changes.md JB-CHANGELOG.md
rm temp_changes.txt filtered_changes.txt
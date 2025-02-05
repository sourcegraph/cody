import type { Rule } from './rules'

export const RULE_EDITING_HELPER_RULE: Rule = {
    uri: 'sourcegraph-builtin-rule:builtin-rule-editing-helper',
    display_name: 'builtin-rule-editing-helper',
    title: 'Rule editing helper (builtin)',
    description: 'A builtin rule that helps when editing `*.rule.md` files for Sourcegraph.',
    instruction: `
Rule files are Markdown files with YAML front matter.

The YAML front matter has the following fields:

- title (required string)
- description (optional string)
- tags (optional string[])
- langauge (optional string)
- language_filters, repo_filters, path_filters, text_content_filters (optional {include: string[], exclude: string[]})

The Markdown body is an LLM prompt that is included in AI code chat and editing on files that the rule applies to:

- Provide a succinct description of the desired outcome of the rule, written in the same way you would write for an internal code review or style guide.
- Give at least 1 example of bad code and 1 example of good code
    `,
    tags: ['builtin'],
    path_filters: {
        // TODO(sqs): switch this to using globs not regexps when
        // https://github.com/sourcegraph/sourcegraph/pull/3277 is merged.
        include: ['\\.rule\\.md$'],
    },
}

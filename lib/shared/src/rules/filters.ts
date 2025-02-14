import type { PatternFilters, Rule } from './rules'

export interface FileInfoForRuleApplication {
    repo: string
    path: string
    languages: string[]
    textContent: string
}

/**
 * Report whether a rule applies to a given file.
 *
 * TODO(sqs): pre-parse the regexps for perf
 *
 * @param rule The rule to check.
 * @param file Information about the file that the rule may apply to.
 * @see [AppliesToFile](https://sourcegraph.sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/rule/filters.go)
 */
export function ruleAppliesToFile(
    rule: Pick<Rule, 'repo_filters' | 'path_filters' | 'language_filters' | 'text_content_filters'>,
    file: FileInfoForRuleApplication
): boolean {
    if (rule.repo_filters) {
        if (!regExpMatch(rule.repo_filters, file.repo)) {
            return false
        }
    }

    if (rule.path_filters) {
        if (!regExpMatch(rule.path_filters, file.path)) {
            return false
        }
    }

    const language_filters = rule.language_filters
    if (language_filters) {
        // Use string matching instead of regex matching so 'C' does not match 'C++', 'CSS', 'CSharp', etc.
        // Use case-insensitive matching so 'Go' matches 'go'
        const anyMatch = file.languages.some(language =>
            stringMatch(language_filters, language, { caseInsensitive: true })
        )
        if (!anyMatch) {
            return false
        }
    }

    if (rule.text_content_filters) {
        if (!regExpMatch(rule.text_content_filters, file.textContent)) {
            return false
        }
    }

    // All filters matched, so the file applies to the rule
    return true
}

function regExpMatch(filters: PatternFilters, value: string): boolean {
    if (filters.include && !filters.include.some(pattern => new RegExp(pattern).test(value))) {
        return false
    }
    if (filters.exclude?.some(pattern => new RegExp(pattern).test(value))) {
        return false
    }
    return true
}

function stringMatch(
    filters: PatternFilters,
    value: string,
    options: { caseInsensitive?: boolean } = {}
): boolean {
    const compare = (a: string, b: string): boolean =>
        options.caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b

    if (filters.include && !filters.include.some(pattern => compare(pattern, value))) {
        return false
    }
    if (filters.exclude?.some(pattern => compare(pattern, value))) {
        return false
    }
    return true
}

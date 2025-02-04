import type { URI } from 'vscode-uri'
import YAML from 'yaml'
import { PromptString, isDefined, pathFunctionsForURI, ps } from '..'

/**
 * From sourcegraph/sourcegraph rule.tsp `Rule`.
 *
 * Only fields we (currently) need are included.
 *
 * @see https://sourcegraph.sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/openapi/rule.tsp
 */
export interface Rule extends ReviewFilterFields {
    uri: string
    display_name: string
    title?: string | null
    description?: string | null
    instruction?: string | null
    tags?: string[] | null
}

/**
 * From sourcegraph/sourcegraph review.tsp `ReviewFilterFields`.
 *
 * Only fields we (currently) need are included.
 *
 * @see https://sourcegraph.sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/openapi/review.tsp
 */
interface ReviewFilterFields {
    path_filters?: PatternFilters | null
    repo_filters?: PatternFilters | null
    language_filters?: PatternFilters | null
    text_content_filters?: PatternFilters | null
}

/**
 * From sourcegraph/sourcegraph shared.tsp `PatternFilters`.
 *
 * @see https://sourcegraph.sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/openapi/shared.tsp
 */
export interface PatternFilters {
    include?: string[] | null
    exclude?: string[] | null
}

/**
 * Parse a *.rule.md file. The {@link uri} and {@link root} are used to determine the `uri` and
 * `display_name` field values.
 *
 * @see [parseRuleMarkdown](https://sourcegraph.sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/internal/rule/rulemd.go)
 */
export function parseRuleFile(uri: URI, root: URI, content: string): Rule {
    const rule: Rule = {
        uri: uri.toString(),
        display_name: ruleFileDisplayName(uri, root),
        instruction: content,
    }

    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
    if (frontMatterMatch) {
        const [, frontMatter, remainingContent] = frontMatterMatch
        const metadata = YAML.parse(frontMatter)

        if (typeof metadata?.title === 'string') {
            rule.title = metadata.title
        }

        if (typeof metadata?.description === 'string') {
            rule.description = metadata.description
        }

        rule.instruction = remainingContent.trim()

        if (
            metadata &&
            Array.isArray(metadata.tags) &&
            metadata.tags.every((t: any) => typeof t === 'string')
        ) {
            rule.tags = metadata.tags
        }

        if (isValidPatternFilters(metadata.repo_filters)) {
            rule.repo_filters = metadata.repo_filters
        }
        if (isValidPatternFilters(metadata.path_filters)) {
            rule.path_filters = metadata.path_filters
        }
        if (isValidPatternFilters(metadata.language_filters)) {
            rule.language_filters = metadata.language_filters
        }
        if (isValidPatternFilters(metadata.text_content_filters)) {
            rule.text_content_filters = metadata.text_content_filters
        }

        // `lang: go` is convenience syntax for `language_filters: {include: ["go"]}`.
        if (metadata.lang && typeof metadata.lang === 'string') {
            rule.language_filters = { include: [metadata.lang] }
        }
    }

    return rule
}

function isValidPatternFilters(v: any): v is PatternFilters {
    return (
        v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        (v.include === undefined ||
            v.include === null ||
            (Array.isArray(v.include) && v.include.every((p: any) => typeof p === 'string'))) &&
        (v.exclude === undefined ||
            v.exclude === null ||
            (Array.isArray(v.exclude) && v.exclude.every((p: any) => typeof p === 'string')))
    )
}

export function ruleFileDisplayName(uri: URI, root: URI): string {
    return pathFunctionsForURI(uri)
        .relative(root.path, uri.path)
        .replace(/\.sourcegraph\/([^/]+)\.rule\.md$/, '$1')
}

export function isRuleFilename(file: string | URI): boolean {
    return /\.rule\.md$/.test(typeof file === 'string' ? file : file.path)
}

/**
 * Return all search paths (possible `.sourcegraph/` dirs) for a given URI, stopping ascending the
 * directory tree at {@link root}.
 */
export function ruleSearchPaths(uri: URI, root: URI): URI[] {
    const pathFuncs = pathFunctionsForURI(uri)
    const searchPaths: URI[] = []
    let current = uri
    while (true) {
        if (pathFuncs.relative(current.path, root.path) === '') {
            break
        }
        current = current.with({ path: pathFuncs.dirname(current.path) })
        searchPaths.push(current.with({ path: pathFuncs.resolve(current.path, '.sourcegraph') }))
    }
    return searchPaths
}

export function formatRuleForPrompt(rule: Rule): PromptString {
    const { title, description, instruction } = PromptString.fromRule(rule)
    return PromptString.join(
        [
            ps`Title: ${title}`,
            description ? ps`Description: ${description}` : undefined,
            ps`Instruction: ${instruction}`,
        ].filter(isDefined),
        ps`\n`
    )
}

export function ruleTitle(rule: Pick<Rule, 'title' | 'display_name'>): string {
    return rule.title ?? rule.display_name
}

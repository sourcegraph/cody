import * as fspromises from 'fs/promises'
import * as path from 'path'

import Parser, { Query } from 'web-tree-sitter'

import { SupportedLanguage } from '../../../../vscode/src/tree-sitter/grammars'

export type QueryName = 'context'

/**
 * Queries manages compilation of tree-sitter queries from a directory layout.
 *
 * Queries are written in a file structure like this: `LANGUAGE/QUERY_NAME.scm`
 *
 * This class caches compilation of queries so that we only read each query once from disk.
 */
export class Queries {
    private cache: CompiledQuery[] = []
    constructor(private queriesDirectory: string) {}
    public async loadQuery(parser: Parser, language: SupportedLanguage, name: QueryName): Promise<Query | undefined> {
        const fromCache = this.cache.find(compiled => compiled.language === language && compiled.queryName === name)
        if (fromCache) {
            return fromCache.compiledQuery
        }
        return this.compileQuery(parser, language, name)
    }

    private async compileQuery(
        parser: Parser,
        language: SupportedLanguage,
        name: QueryName
    ): Promise<Query | undefined> {
        const languages = [language, ...(grammarInheritance[language] ?? [])]
        const queryStrings: string[] = []
        for (const queryLanguage of languages) {
            const queryPath = path.join(this.queriesDirectory, queryLanguage, `${name}.scm`)
            try {
                const stat = await fspromises.stat(queryPath)
                if (!stat.isFile()) {
                    continue
                }
            } catch {
                continue
            }
            const queryString = await fspromises.readFile(queryPath)
            queryStrings.push(queryString.toString())
        }
        const uncompiled: UncompiledQuery = {
            language,
            queryName: name,
            queryString: queryStrings.join('\n\n'),
        }
        const compiled = compileQuery(uncompiled, parser)
        this.cache.push(compiled)
        return compiled.compiledQuery
    }
}

interface UncompiledQuery {
    language: SupportedLanguage
    queryName: QueryName
    queryString: string
}
interface CompiledQuery extends UncompiledQuery {
    compiledQuery: Query
}

function compileQuery(query: UncompiledQuery, parser: Parser): CompiledQuery {
    return {
        ...query,
        compiledQuery: parser.getLanguage().query(query.queryString),
    }
}

const grammarInheritance: Partial<Record<SupportedLanguage, SupportedLanguage[]>> = {
    [SupportedLanguage.TypeScript]: [SupportedLanguage.JavaScript],
    [SupportedLanguage.JSX]: [SupportedLanguage.JavaScript],
    [SupportedLanguage.TSX]: [SupportedLanguage.TypeScript, SupportedLanguage.JavaScript],
}

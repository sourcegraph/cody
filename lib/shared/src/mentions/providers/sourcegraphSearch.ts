import { URI } from 'vscode-uri'
import { ContextItemSource, type ContextItemWithContent } from '../../codebase-context/messages'
import { isErrorLike } from '../../common'
import type { RangeData } from '../../common/range'
import { graphqlClient } from '../../sourcegraph-api/graphql'
import { isError } from '../../utils'
import type { ContextMentionProvider } from '../api'

export const SOURCEGRAPH_SEARCH_CONTEXT_MENTION_PROVIDER: ContextMentionProvider<'src-search'> = {
    id: 'src-search',
    // TODO the prefix '!' seems to not trigger the @ mention code path. I am
    // assuming there is parsing logic somewhere which only calls the @
    // mentions if they look like a path or start with # (for symbols)
    triggerPrefixes: ['src:'],

    async queryContextItems(query, signal) {
        const searchQuery = query.startsWith('src:') ? query.slice(4) : query
        const uri = URI.parse(graphqlClient.endpoint).with({
            query: 'q=' + encodeURIComponent(searchQuery),
        })
        return [
            {
                type: 'file',
                uri: uri,
                title: searchQuery,
                source: ContextItemSource.Uri,
                provider: 'src-search',
            },
        ]
    },

    async resolveContextItem(item, input, signal): Promise<ContextItemWithContent[]> {
        if (item.content !== undefined) {
            return [item as ContextItemWithContent]
        }

        // Sneaking in the search query via the title
        const rawQuery = item.title
        if (!rawQuery) {
            return []
        }

        // Adjust query to limit results to filematches
        const query = 'type:file count:10 ' + rawQuery

        const chunks = await searchForFileChunks(query, signal)

        if (isErrorLike(chunks)) {
            throw chunks
        }

        return chunks.map(chunk => {
            return {
                ...item,
                ...chunk,
            }
        })
    },
}

type Chunk = Pick<ContextItemWithContent, 'uri' | 'range' | 'content' | 'repoName' | 'revision'>

async function searchForFileChunks(
    query: string,
    signal: AbortSignal | undefined
): Promise<Chunk[] | Error> {
    const results = await graphqlClient
        .fetchSourcegraphAPI<APIResponse<SearchResponse>>(SEARCH_QUERY, {
            query,
        })
        .then(response =>
            extractDataOrError(response, data => {
                return data.search.results.results.flatMap(result => {
                    if (result.__typename !== 'FileMatch') {
                        return []
                    }
                    const fileContext = {
                        uri: URI.parse(result.file.url),
                        repoName: result.repository.name,
                        revision: result.file.commit.oid,
                    }
                    return result.chunkMatches.map(chunkMatch => {
                        return {
                            ...fileContext,
                            content: chunkMatch.content,
                            range: chunkMatchContentToRange(
                                chunkMatch.content,
                                chunkMatch.contentStart.line
                            ),
                        }
                    })
                })
            })
        )
    return results
}

function chunkMatchContentToRange(content: string, startLine: number): RangeData {
    const lines = content.split('\n')
    const endLine = startLine + lines.length - 1
    return {
        start: { line: startLine, character: 0 },
        end: { line: endLine, character: lines[lines.length - 1].length },
    }
}

const SEARCH_QUERY = `
query CodyMentionProviderSearch($query: String!) {
  search(query: $query, version: V3, patternType: literal) {
    results {
      results {
        __typename
        ... on FileMatch {
          repository {
            name
          }
          file {
            url
            commit {
              oid
            }
          }
          chunkMatches {
            content
            contentStart {
              line
            }
          }
        }
      }
    }
  }
}`

interface SearchResponse {
    search: {
        results: {
            results: {
                __typename: string
                repository: {
                    name: string
                }
                file: {
                    url: string
                    commit: {
                        oid: string
                    }
                }
                chunkMatches: {
                    content: string
                    contentStart: {
                        line: number
                    }
                }[]
            }[]
        }
    }
}

export async function searchForRepos(
    query: string,
    signal: AbortSignal | undefined
): Promise<{ repoID: string; name: string }[] | Error> {
    const results = await graphqlClient
        .fetchSourcegraphAPI<APIResponse<SearchReposResponse>>(SEARCH_REPOS_QUERY, {
            query,
        })
        .then(response =>
            extractDataOrError(response, data => {
                return data.search.results.results.flatMap(result => {
                    if (result.__typename !== 'Repository') {
                        return []
                    }
                    return [{ repoID: result.id, name: result.name }]
                })
            })
        )
    return results
}

const SEARCH_REPOS_QUERY = `
query CodyMentionProviderSearchRepos($query: String!) {
  search(query: $query, version: V3, patternType: literal) {
    results {
      results {
        __typename
        ... on Repository {
          id
          name
        }
      }
    }
  }
}`

interface SearchReposResponse {
    search: {
        results: {
            results: {
                __typename: string
                id: string
                name: string
            }[]
        }
    }
}

interface APIResponse<T> {
    data?: T
    errors?: { message: string; path?: string[] }[]
}

function extractDataOrError<T, R>(response: APIResponse<T> | Error, extract: (data: T) => R): R | Error {
    if (isError(response)) {
        return response
    }
    if (response.errors && response.errors.length > 0) {
        return new Error(response.errors.map(({ message }) => message).join(', '))
    }
    if (!response.data) {
        return new Error('response is missing data')
    }
    return extract(response.data)
}

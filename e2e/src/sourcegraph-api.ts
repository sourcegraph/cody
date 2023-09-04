import fetch from 'node-fetch'

const SOURCEGRAPH_GRAPHQL_SEARCH_QUERY = `
query SearchQuery($query: String!) {
  search(version: V3, query: $query) {
    results {
      results {
        ... on FileMatch {
          file {
            path
          }
          symbols {
            name
          }
        }
      }
    }
  }
}
`

interface SearchResults {
    data: {
        search: {
            results: {
                results: {
                    file: {
                        path: string
                    }
                    symbols: {
                        name: string
                    }[]
                }[]
            }
        }
    }
}

export async function search(query: string): Promise<SearchResults['data']['search']['results']['results']> {
    const sourcegraphEndpoint = process.env.SRC_ENDPOINT ?? ''
    const sourcegraphApiUrl = `${sourcegraphEndpoint}/.api/graphql`
    const sourcegraphAccessToken = process.env.SRC_ACCESS_TOKEN ?? ''
    const headers = {
        'Content-Type': 'application/json',
        Authorization: `token ${sourcegraphAccessToken}`,
    }

    const response = await fetch(sourcegraphApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            query: SOURCEGRAPH_GRAPHQL_SEARCH_QUERY,
            variables: { query },
        }),
    })
    if (!response.ok) {
        const text = await response.text()
        console.error(text)
        throw new Error(`Error fetching Sourcegraph API: ${response.status}\n${text}`)
    }
    const responseJSON = (await response.json()) as SearchResults
    return responseJSON.data.search.results.results
}

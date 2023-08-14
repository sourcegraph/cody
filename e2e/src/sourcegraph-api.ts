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

    return fetch(sourcegraphApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            query: SOURCEGRAPH_GRAPHQL_SEARCH_QUERY,
            variables: { query },
        }),
    })
        .then(response => response.json())
        .then(response => response as SearchResults)
        .then(response => response.data.search.results.results)
}

import type { ContextItem } from '@sourcegraph/cody-shared'

const isAgentTesting = process.env.CODY_SHIM_TESTING === 'true'

// These helper functions should be called before we pass context items/files to a prompt builder. This is necessary to get the tests
// passing in CI because we need the prompts to be stable for the HTTP replay mode to succeed.

export function sortContextItems(files: ContextItem[]): void {
    if (!isAgentTesting) {
        return
    }
    // Sort results for deterministic ordering for stable tests. Ideally, we
    // could sort by some numerical score from symf based on how relevant
    // the matches are for the query.
    files.sort((a, b) => {
        const byPath = a.uri.path.localeCompare(b.uri.path)
        if (byPath !== 0) {
            return byPath
        }
        const bySource = (a.source ?? '').localeCompare(b.source ?? '')
        if (bySource !== 0) {
            return bySource
        }
        return (a.content ?? '').localeCompare(b.content ?? '')
    })
}

export function sortContextFiles(files: ContextItem[]): void {
    if (!isAgentTesting) {
        return
    }

    files.sort((a, b) => {
        const byPath = a.uri.path.localeCompare(b.uri.path)
        if (byPath !== 0) {
            return byPath
        }
        const bySource = (a.source ?? '').localeCompare(b.source ?? '')
        if (bySource !== 0) {
            return bySource
        }
        return (a.content ?? '').localeCompare(b.content ?? '')
    })
}

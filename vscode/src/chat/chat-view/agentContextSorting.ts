import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'

const isAgentTesting = process.env.CODY_SHIM_TESTING === 'true'
const sortLocale = new Intl.Locale('en-US')

/**
 * Sorts the provided `ContextItem` array in a deterministic order for stable tests.
 * This function is only used when the `CODY_SHIM_TESTING` environment variable is
 * set to `'true'`, which indicates that the agent is running in a testing environment.
 *
 * NOTE: Agent tests require deterministic ordering of context files for consistent results across different file systems
 * These helper functions should be called before we pass context items/files to a prompt builder.
 * This is necessary to get the tests passing in CI because we need the prompts to be stable for the HTTP replay mode to succeed.
 *
 * @param files - The array of `ContextItem` objects to sort.
 */
export function sortContextItemsIfInTest(files: ContextItem[]): ContextItem[] {
    if (!isAgentTesting) {
        return files
    }
    files = [...files]

    // Sort results for deterministic ordering for stable tests. Ideally, we
    // could sort by some numerical score from symf based on how relevant
    // the matches are for the query.
    files.sort((a, b) => {
        const byPath = a.uri.path.localeCompare(b.uri.path, sortLocale)
        if (byPath !== 0) {
            return byPath
        }
        const bySource = (a.source ?? '').localeCompare(b.source ?? '', sortLocale)
        if (bySource !== 0) {
            return bySource
        }
        return (a.content ?? '').localeCompare(b.content ?? '', sortLocale)
    })

    // Move the selection context to the first position so that it'd be the last context item to be read by the LLM
    // to avoid confusions where other files also include the selection text in test files.
    const selectionIndex = files.findIndex(i => i.source === ContextItemSource.Selection)
    if (selectionIndex !== -1) {
        const selection = files.splice(selectionIndex, 1)[0]
        files.unshift(selection)
    }
    return files
}

import dedent from 'dedent'

import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

/**
 * A tag function for creating a {@link CompletionResponse}, for use in tests only.
 *
 * - `├` start of the inline completion to insert
 * - `┤` end of the inline completion to insert
 * - `┴` use for indent placeholder, should be placed at last line after `┤`
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function completion(string: TemplateStringsArray, ...values: any): CompletionResponse {
    const raw = dedent(string, ...values)
    let completion = raw

    const start = raw.indexOf('├')
    const end = raw.lastIndexOf('┤')

    // eslint-disable-next-line yoda
    if (0 <= start && start <= end) {
        completion = raw.slice(start + 1, end)
    }

    return {
        completion,
        stopReason: 'unknown',
    }
}

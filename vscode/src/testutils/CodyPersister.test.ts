import { describe, expect, it } from 'vitest'
import { postProcessCompletionsStreamText } from './CodyPersister'

// NOTE(olafurpg) This code path runs with all the tests so it's a bit overkill
// to write tests for test code, but this post-processing logic can be tricky to
// reason about and I was able to fix bugs in this logic much faster by
// iterating on the tests instead of running complete record/replay tests.

describe('CodyPersister', () => {
    const expectedFormat = (propertyName: string) => `event: completion
data: {"${propertyName}":"Hello, world!"}

event: done
data: {}

`
    it('postProcessCompletionsStreamText with completion', () => {
        expect(
            postProcessCompletionsStreamText(
                'https://sourcegraph.com/.api/completions/stream?api-version=1',
                `event: completion
data: {"completion":"Hello"}

event: completion
data: {"completion":"Hello, world!"}

event: done
data: {}

`
            )
        ).toStrictEqual(expectedFormat('completion'))
    })

    // When using deltaText, we still store the response using the `"completion"` format
    // to keep the number of lines small in the HTTP record/replay files.
    it('postProcessCompletionsStreamText with deltaText', () => {
        expect(
            postProcessCompletionsStreamText(
                'https://sourcegraph.com/.api/completions/stream?api-version=2',
                `event: completion
data: {"deltaText":"Hello"}

event: completion
data: {"deltaText":", world!"}

event: done
data: {}

`
            )
        ).toStrictEqual(expectedFormat('deltaText'))
    })
})

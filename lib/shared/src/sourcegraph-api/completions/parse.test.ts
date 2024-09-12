import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { CompletionsResponseBuilder } from './CompletionsResponseBuilder'
import { parseEvents } from './parse'

describe('parseEvents', () => {
    const helloWorldEvents = {
        events: [
            {
                completion: 'Hello',
                stopReason: undefined,
                type: 'completion',
            },
            {
                completion: 'Hello, world!',
                stopReason: undefined,
                type: 'completion',
            },
        ],
        remainingBuffer: dedent`event: done
                                data: {}`,
    }

    it('parseEvents with deltaText', () => {
        const builder = CompletionsResponseBuilder.fromUrl(
            'https://sourcegraph.com/.api/completions/stream?api-version=2'
        )
        expect(
            parseEvents(
                builder,
                dedent`event: completion
                       data: {"deltaText":"Hello"}

                       event: completion
                       data: {"deltaText":", world!"}

                       event: done
                       data: {}
                       `
            )
        ).toStrictEqual(helloWorldEvents)
    })

    it('parseEvents with completion', () => {
        const builder = CompletionsResponseBuilder.fromUrl(
            'https://sourcegraph.com/.api/completions/stream?api-version=1'
        )
        expect(
            parseEvents(
                builder,
                dedent`event: completion
                       data: {"completion":"Hello"}

                       event: completion
                       data: {"completion":"Hello, world!"}

                       event: done
                       data: {}
                       `
            )
        ).toStrictEqual(helloWorldEvents)
    })
})

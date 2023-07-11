import { describe, expect, test } from 'vitest'

import { Message } from '../sourcegraph-api'

import { createHooksExecutor } from './executor'

describe('HooksExecutor', () => {
    test('preChat', async () => {
        const executor = createHooksExecutor({
            preChat: [
                { run: messages => messages.map(m => ({ ...m, text: `${m.text || ''}b` })) },
                { run: messages => Promise.resolve(messages.map(m => ({ ...m, text: `${m.text || ''}c` }))) },
            ],
        })
        expect(await executor.preChat([{ speaker: 'human', text: 'a' }])).toEqual<Message[]>([
            { speaker: 'human', text: 'abc' },
        ])
    })
})

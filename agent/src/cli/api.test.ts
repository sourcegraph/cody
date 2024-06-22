import { describe } from 'node:test'
import { it } from 'vitest'
import { chatAction } from './api'

describe('api', () => {
    it('chat', async () => {
        await chatAction({
            endpoint: 'https://sourcegraph.com',
            accessToken: 'blah',
            debug: false,
            dir: process.cwd(),
            message: 'what color is the sky?',
            showContext: false,
        })
    }, 10_000)
})

import { describe } from 'node:test'
import { it } from 'vitest'
import { apiAction } from './api'

describe('api', () => {
    it('chat', async () => {
        await apiAction({
            endpoint: 'https://sourcegraph.com',
            accessToken: 'blah',
            debug: false,
            dir: process.cwd(),
            message: 'what color is the sky?',
            showContext: false,
        })
    }, 10_000)
})

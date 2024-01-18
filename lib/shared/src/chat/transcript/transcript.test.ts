import assert from 'assert'

import { describe, it } from 'vitest'

import { Transcript } from '.'

describe('Transcript', () => {
    it('generates an empty prompt with no interactions', async () => {
        const transcript = new Transcript()
        const { prompt } = await transcript.getPromptForLastInteraction()
        assert.deepStrictEqual(prompt, [])
    })
})

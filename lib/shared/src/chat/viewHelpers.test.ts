import { describe, expect, it } from 'vitest'

import { reformatBotMessageForChat } from './viewHelpers'

describe('reformatBotMessageForChat', () => {
    it('trims Human stop sequence', () => {
        expect(reformatBotMessageForChat('Here is some info Human:')).toBe('Here is some info ')
    })

    it('fixes unclosed markdown code block', () => {
        expect(reformatBotMessageForChat('Here is some code ```console.log("hello")')).toBe(
            'Here is some code ```console.log("hello")\n```'
        )
    })
})

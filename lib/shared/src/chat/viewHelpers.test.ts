import { describe, expect, it } from 'vitest'

import { ps } from '../prompt/prompt-string'
import { reformatBotMessageForChat } from './viewHelpers'

describe('reformatBotMessageForChat', () => {
    it('trims Human stop sequence', () => {
        expect(reformatBotMessageForChat(ps`Here is some info Human:`).toString()).toBe(
            'Here is some info '
        )
    })

    it('fixes unclosed markdown code block', () => {
        expect(
            reformatBotMessageForChat(ps`Here is some code \`\`\`console.log("hello")`).toString()
        ).toBe('Here is some code ```console.log("hello")\n```')
    })
})

import { describe, expect, it } from 'vitest'

import { claude } from './claude'
import { type GetLLMInteractionOptions } from './type'

describe('Edit Prompts', () => {
    const fixupTask: GetLLMInteractionOptions = {
        fileName: 'src/file/index.ts',
        followingText: "const text = 'Hello, world!'\n",
        selectedText: 'return text',
        precedingText: '\n}',
        instruction: 'Console log text',
    }

    describe('Claude', () => {
        it('builds prompt correctly for edits', () => {
            const { prompt } = claude.getEdit(fixupTask)
            expect(prompt).toMatchSnapshot()
        })

        it('builds prompt correctly for doc', () => {
            const { prompt } = claude.getDoc(fixupTask)
            expect(prompt).toMatchSnapshot()
        })

        it('builds prompt correctly for adding', () => {
            const { prompt } = claude.getAdd(fixupTask)
            expect(prompt).toMatchSnapshot()
        })

        it('builds prompt correctly for fixing', () => {
            const { prompt } = claude.getFix(fixupTask)
            expect(prompt).toMatchSnapshot()
        })
    })
})

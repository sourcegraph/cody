import { describe, expect, it } from 'vitest'

import { isWindows, testFileUri } from '@sourcegraph/cody-shared'

import { claude } from './claude'
import { type GetLLMInteractionOptions } from './type'

describe('Edit Prompts', () => {
    const fixupTask: GetLLMInteractionOptions = {
        uri: testFileUri('src/file/index.ts'),
        followingText: "const text = 'Hello, world!'\n",
        selectedText: 'return text',
        precedingText: '\n}',
        instruction: 'Console log text',
    }

    function normalize(text: string): string {
        return isWindows() ? text.replaceAll('src\\file\\index.ts', 'src/file/index.ts') : text
    }

    describe('Claude', () => {
        it('builds prompt correctly for edits', () => {
            const { prompt } = claude.getEdit(fixupTask)
            expect(normalize(prompt)).toMatchSnapshot()
        })

        it('builds prompt correctly for doc', () => {
            const { prompt } = claude.getDoc(fixupTask)
            expect(normalize(prompt)).toMatchSnapshot()
        })

        it('builds prompt correctly for adding', () => {
            const { prompt } = claude.getAdd(fixupTask)
            expect(normalize(prompt)).toMatchSnapshot()
        })

        it('builds prompt correctly for fixing', () => {
            const { prompt } = claude.getFix(fixupTask)
            expect(normalize(prompt)).toMatchSnapshot()
        })
    })
})

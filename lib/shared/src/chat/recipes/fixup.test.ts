import { describe, expect, it } from 'vitest'

import { VsCodeFixupTaskRecipeData } from '../../editor'

import { Fixup } from './fixup'

describe('Fixup', () => {
    const fixupTask: VsCodeFixupTaskRecipeData = {
        fileName: 'src/file/index.ts',
        followingText: "const text = 'Hello, world!'\n",
        selectedText: 'return text',
        precedingText: '\n}',
        instruction: 'Console log text',
        selectionRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 11 } },
    }

    it('builds prompt correctly for edits', () => {
        const fixup = new Fixup()
        expect(fixup.getPrompt(fixupTask, 'edit')).toMatchSnapshot()
    })

    it('builds prompt correctly for adding', () => {
        const fixup = new Fixup()
        expect(fixup.getPrompt(fixupTask, 'add')).toMatchSnapshot()
    })
})

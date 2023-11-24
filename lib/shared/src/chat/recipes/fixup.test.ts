import { describe, expect, it } from 'vitest'

import { VsCodeFixupTaskRecipeData } from '../../editor'

import { Fixup } from './fixup'

describe('Fixup', () => {
    const fixupTask: Omit<VsCodeFixupTaskRecipeData, 'intent'> = {
        fileName: 'src/file/index.ts',
        followingText: "const text = 'Hello, world!'\n",
        selectedText: 'return text',
        precedingText: '\n}',
        instruction: 'Console log text',
        selectionRange: { start: { line: 2, character: 0 }, end: { line: 2, character: 11 } },
    }

    it('builds prompt correctly for edits', () => {
        const fixup = new Fixup()
        expect(fixup.getPrompt({ ...fixupTask, intent: 'edit' })).toMatchSnapshot()
    })

    it('builds prompt correctly for adding', () => {
        const fixup = new Fixup()
        expect(fixup.getPrompt({ ...fixupTask, intent: 'add' })).toMatchSnapshot()
    })

    it('builds prompt correctly for fixing', () => {
        const fixup = new Fixup()
        expect(fixup.getPrompt({ ...fixupTask, intent: 'fix' })).toMatchSnapshot()
    })
})

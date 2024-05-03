import { describe, expect, it } from 'vitest'
import { Position, Selection } from 'vscode'
import { document } from '../../completions/test-helpers'
import { getEditAdjustedUserSelection } from './edit-selection'

describe('getEditAdjustedUserSelection', () => {
    it('should return the original selection if it is empty', () => {
        const doc = document('Hello world!')
        const selection = new Selection(new Position(0, 0), new Position(0, 0))
        const result = getEditAdjustedUserSelection(doc, selection)
        expect(result).toEqual(selection)
    })

    it('should trim whitespace from the start and end of a selection', () => {
        const doc = document('  Hello World  \n\n')
        const selection = new Selection(doc.positionAt(0), doc.positionAt(doc.getText().length))
        const updatedSelectionRange = getEditAdjustedUserSelection(doc, selection)
        expect(doc.getText(updatedSelectionRange)).toBe('Hello World')
    })

    it('should expand selection to include full text of a line', () => {
        const doc = document('  Hello World  \n\n')
        const selection = new Selection(doc.positionAt(4), doc.positionAt(10)) // partial selection on "llo wo"
        const updatedSelectionRange = getEditAdjustedUserSelection(doc, selection)
        expect(doc.getText(updatedSelectionRange)).toBe('Hello World')
    })

    it('should handle selections that span multiple lines', () => {
        const doc = document('  Hello\n  World  \n')
        const selection = new Selection(doc.positionAt(0), doc.positionAt(doc.getText().length))
        const updatedSelectionRange = getEditAdjustedUserSelection(doc, selection)
        expect(doc.getText(updatedSelectionRange)).toBe('Hello\n  World')
    })
})

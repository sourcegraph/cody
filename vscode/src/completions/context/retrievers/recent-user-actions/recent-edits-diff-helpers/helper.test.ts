import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { getPositionAt, parseTextAndGenerateChangeEvents } from './helper'
import { processContinousChangesForText } from './helper'
import { applyTextDocumentChanges } from './utils'

describe('parseTextAndGenerateChangeEvents', () => {
    const testChanges = (params: {
        text: string
        expectedOriginalString: string
        expectedChanges: string[]
    }) => {
        const { text, expectedOriginalString, expectedChanges } = params
        const { originalText, changeEvents } = parseTextAndGenerateChangeEvents(text)
        expect(originalText).to.equal(expectedOriginalString)
        expect(changeEvents.length).to.equal(expectedChanges.length)
        for (let i = 0; i < changeEvents.length; i++) {
            const changes = changeEvents.slice(0, i + 1)
            const newContent = applyTextDocumentChanges(originalText, changes)
            expect(newContent).to.equal(
                expectedChanges[i],
                `Failed at index ${i}. Expected "${expectedChanges[i]}" but got "${newContent}"`
            )
        }
    }

    it('should handle insert markers correctly', () => {
        const text = 'This is a <I>test </I>string.'
        const expectedOriginalString = 'This is a string.'
        const expectedChanges = ['This is a test string.']
        testChanges({ text, expectedOriginalString, expectedChanges })
    })

    it('should handle delete markers correctly', () => {
        const text = 'This is a <D>sample </D>string.'
        const expectedOriginalString = 'This is a sample string.'
        const expectedChanges = ['This is a string.']
        testChanges({ text, expectedOriginalString, expectedChanges })
    })

    it('should handle replace markers correctly', () => {
        const text = 'Please <R>replace<RM>swap</R> this word.'
        const expectedOriginalString = 'Please replace this word.'
        const expectedChanges = ['Please swap this word.']
        testChanges({ text, expectedOriginalString, expectedChanges })
    })

    it('should handle multiple markers correctly', () => {
        const text = 'start<I> and</I> middle<D> unnecessary</D> text<R> swap<RM> change</R> end.'
        const expectedOriginalString = 'start middle unnecessary text swap end.'
        const expectedChanges = [
            'start and middle unnecessary text swap end.',
            'start and middle text swap end.',
            'start and middle text change end.',
        ]
        testChanges({ text, expectedOriginalString, expectedChanges })
    })

    it('should handle text without markers correctly', () => {
        const text = 'This is plain text.'
        const expectedOriginalString = 'This is plain text.'
        const expectedChanges: string[] = []
        testChanges({ text, expectedOriginalString, expectedChanges })
    })

    it('should ignore unmatched markers', () => {
        const inputText = 'Unmatched markers <I>insert text without closing.'
        const { originalText, changeEvents } = parseTextAndGenerateChangeEvents(inputText)

        expect(originalText).to.equal('Unmatched markers <I>insert text without closing.')
        expect(changeEvents).to.have.lengthOf(0)
    })

    it('should handle complex multi-line text with mixed markers', () => {
        const text = dedent`
            First line<I> inserted text</I>
            Second line<D> to be deleted</D>
            <R>Third line old<RM>Third line new</R><I>
            Fourth line addition
            Fifth line addition</I>
            <D>Sixth line to delete
            </D>End of text.
            `
        const expectedOriginalString = dedent`
            First line
            Second line to be deleted
            Third line old
            Sixth line to delete
            End of text.
            `
        const expectedChanges = [
            dedent`
            First line inserted text
            Second line to be deleted
            Third line old
            Sixth line to delete
            End of text.
            `,
            dedent`
            First line inserted text
            Second line
            Third line old
            Sixth line to delete
            End of text.
            `,
            dedent`
            First line inserted text
            Second line
            Third line new
            Sixth line to delete
            End of text.
            `,
            dedent`
            First line inserted text
            Second line
            Third line new
            Fourth line addition
            Fifth line addition
            Sixth line to delete
            End of text.
            `,
            dedent`
            First line inserted text
            Second line
            Third line new
            Fourth line addition
            Fifth line addition
            End of text.
            `,
        ]
        testChanges({ text, expectedOriginalString, expectedChanges })
    })

    it('should handle continuous insert markers correctly', () => {
        const text = 'Hello <IC>World</IC>!'
        const expectedOriginalString = 'Hello !'
        const expectedChanges = ['Hello W!', 'Hello Wo!', 'Hello Wor!', 'Hello Worl!', 'Hello World!']
        testChanges({ text, expectedOriginalString, expectedChanges })
    })

    it('should handle continuous delete markers correctly', () => {
        const text = 'Delete<DC> this</DC> text.'
        const expectedOriginalString = 'Delete this text.'
        const expectedChanges = [
            'Deletethis text.',
            'Deletehis text.',
            'Deleteis text.',
            'Deletes text.',
            'Delete text.',
        ]
        testChanges({ text, expectedOriginalString, expectedChanges })
    })

    it('should handle multiple continuous markers correctly', () => {
        const text = '<IC>Hi</IC>, this is a <DC>sample</DC> text.'
        const expectedOriginalString = ', this is a sample text.'
        const expectedChanges = [
            'H, this is a sample text.',
            'Hi, this is a sample text.',
            'Hi, this is a ample text.',
            'Hi, this is a mple text.',
            'Hi, this is a ple text.',
            'Hi, this is a le text.',
            'Hi, this is a e text.',
            'Hi, this is a  text.',
        ]
        testChanges({ text, expectedOriginalString, expectedChanges })
    })
})

describe('processContinousChangesForText', () => {
    it('should convert <IC> tags into individual <I> tags for each character', () => {
        const input = 'Hello <IC>World</IC>!'
        const expectedOutput = 'Hello <I>W</I><I>o</I><I>r</I><I>l</I><I>d</I>!'
        expect(processContinousChangesForText(input)).toBe(expectedOutput)
    })

    it('should convert <DC> tags into individual <D> tags for each character', () => {
        const input = 'Delete <DC>this</DC> text.'
        const expectedOutput = 'Delete <D>t</D><D>h</D><D>i</D><D>s</D> text.'
        expect(processContinousChangesForText(input)).toBe(expectedOutput)
    })

    it('should handle multiple <IC> and <DC> tags in the input', () => {
        const input = '<IC>Hello</IC> and <DC>Goodbye</DC>!'
        const expectedOutput =
            '<I>H</I><I>e</I><I>l</I><I>l</I><I>o</I> and <D>G</D><D>o</D><D>o</D><D>d</D><D>b</D><D>y</D><D>e</D>!'
        expect(processContinousChangesForText(input)).toBe(expectedOutput)
    })

    it('should return the same text if there are no <IC> or <DC> tags', () => {
        const input = 'No changes here.'
        expect(processContinousChangesForText(input)).toBe(input)
    })

    it('should handle empty <IC> and <DC> tags gracefully', () => {
        const input = 'Empty <IC></IC> and <DC></DC> tags.'
        const expectedOutput = 'Empty  and  tags.'
        expect(processContinousChangesForText(input)).toBe(expectedOutput)
    })

    it('should handle special characters within <IC> and <DC> tags', () => {
        const input = 'Special <IC>chars: !@#</IC> and <DC>123</DC>.'
        const expectedOutput =
            'Special <I>c</I><I>h</I><I>a</I><I>r</I><I>s</I><I>:</I><I> </I><I>!</I><I>@</I><I>#</I> and <D>1</D><D>2</D><D>3</D>.'
        expect(processContinousChangesForText(input)).toBe(expectedOutput)
    })

    it('should handle consecutive <IC> and <DC> tags without text in between', () => {
        const input = '<IC>ABC</IC><DC>123</DC>'
        const expectedOutput = '<I>A</I><I>B</I><I>C</I><D>1</D><D>2</D><D>3</D>'
        expect(processContinousChangesForText(input)).toBe(expectedOutput)
    })
})

describe('getPositionAt', () => {
    it('should return position at offset 0', () => {
        const content = 'Hello, world!'
        const offset = 0
        const position = getPositionAt(content, offset)
        expect(position.line).to.equal(0)
        expect(position.character).to.equal(0)
    })

    it('should return correct position in single-line content', () => {
        const content = 'Hello, world!'
        const offset = 7
        const position = getPositionAt(content, offset)
        expect(position.line).to.equal(0)
        expect(position.character).to.equal(7)
    })

    it('should return correct position at the end of content', () => {
        const content = 'Hello, world!'
        const offset = content.length
        const position = getPositionAt(content, offset)
        expect(position.line).to.equal(0)
        expect(position.character).to.equal(content.length)
    })

    it('should return correct position in multi-line content', () => {
        const content = 'Line 1\nLine 2\nLine 3'
        const offset = content.indexOf('Line 2')
        const position = getPositionAt(content, offset)
        expect(position.line).to.equal(1)
        expect(position.character).to.equal(0)
    })

    it('should handle offsets at line breaks', () => {
        const content = 'Line 1\nLine 2\nLine 3'
        const offset = content.indexOf('\n') + 1 // Position after the first line break
        const position = getPositionAt(content, offset)
        expect(position.line).to.equal(1)
        expect(position.character).to.equal(0)
    })

    it('should return correct position for offsets within lines', () => {
        const content = 'Line 1\nLine 2\nLine 3'
        const offset = content.indexOf('2')
        const position = getPositionAt(content, offset)
        expect(position.line).to.equal(1)
        expect(position.character).to.equal(5)
    })

    it('should handle empty content', () => {
        const content = ''
        const offset = 0
        const position = getPositionAt(content, offset)
        expect(position.line).to.equal(0)
        expect(position.character).to.equal(0)
    })

    it('should handle content with carriage returns correctly', () => {
        const content = 'Line 1\r\nLine 2\r\nLine 3'
        const offset = content.indexOf('Line 3')
        const position = getPositionAt(content, offset)
        expect(position.line).to.equal(2)
        expect(position.character).to.equal(0)
    })
})

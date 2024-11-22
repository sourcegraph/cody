import { PromptString } from '@sourcegraph/cody-shared'
import { describe, expect, it, should } from 'vitest'
import * as vscode from 'vscode'
import {applyTextDocumentChanges, computeDiffWithLineNumbers, doesLinesOverlapForRanges, groupConsecutiveItemsByPredicate, groupChangesForSimilarLinesTogether, TextDocumentChangeGroup} from './utils';
import dedent from 'dedent'
import {documentAndPosition} from '../../../../test-helpers';
import {TextDocumentChange} from './base';
import {getPositionAfterTextInsertion} from '../../../../text-processing/utils';
import {createGitDiff} from '../../../../../../../lib/shared/src/editor/create-git-diff';


/**
 * Generates a sequence of text document change events for inserting text at a specific position.
 * @param document The VS Code text document to insert text into
 * @param position The position in the document where text should be inserted
 * @param textToAdd Array of text strings to insert sequentially
 * @returns Array of TextDocumentChange objects representing the insertion changes
 */
function generateChangeEventsForInsertionAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
    textToAdd: string[],
): TextDocumentChange[] {
    const changeEvents: TextDocumentChange[] = [];
    let currentPosition = position;
    let currentOffset = document.offsetAt(position);
    for (let i = 0; i < textToAdd.length; i++) {
        const text = textToAdd[i];
        const change = {
            range: new vscode.Range(currentPosition, currentPosition),
            rangeLength: 0,
            text: text,
            rangeOffset: currentOffset
        };
        // Update current position to be after the inserted text
        currentPosition = getPositionAfterTextInsertion(currentPosition, text);
        currentOffset += text.length;
        changeEvents.push({
            timestamp: Date.now(),
            change: change,
            insertedRange: new vscode.Range(currentPosition, currentPosition),
        });
    }
    return changeEvents;
};

function getDiffsForContentChanges(oldContent: string, groupedChanges: TextDocumentChangeGroup[]): string[] {
    const diffList: string[] = [];
    let currentContent = oldContent;
    for (const changeGroup of groupedChanges) {
        const newContent = applyTextDocumentChanges(currentContent, changeGroup.changes.map(change => change.change));
        const diff = createGitDiff('test.ts', currentContent, newContent)
        diffList.push(diff)
        currentContent = newContent;
    }
    return diffList;
}


describe('documentChangeEventGroupings', () => {
    it('should group changes for similar lines together on addition', () => {
        const { document, position } = documentAndPosition('console.█\n')
        const textToAdd = 'log("Hello, world!");\nconsole.log("done")'
        const changeEvents = generateChangeEventsForInsertionAtPosition(document, position, textToAdd.split(''));
        const result = groupChangesForSimilarLinesTogether(changeEvents);
        expect(result.length).toBe(1)
        expect(result[0].changes.length).toBe(textToAdd.split('').length)
        const diffs = getDiffsForContentChanges(document.getText(), result);
        expect(diffs.length).toBe(1)
        expect(diffs[0].split('\n').slice(3).join('\n')).toMatchInlineSnapshot(`
            "-console.
            +console.log("Hello, world!");
            +console.log("done")
            "
        `)
    })



})

describe('applyTextDocumentChanges', () => {
    const createChange = (
        offset: number,
        length: number,
        text: string
    ): vscode.TextDocumentContentChangeEvent =>
        ({
            rangeOffset: offset,
            rangeLength: length,
            text,
        }) as vscode.TextDocumentContentChangeEvent

    it('should insert text at the beginning', () => {
        const content = 'world'
        const changes = [createChange(0, 0, 'Hello ')]
        expect(applyTextDocumentChanges(content, changes)).toBe('Hello world')
    })

    it('should insert text in the middle', () => {
        const content = 'Hello world'
        const changes = [createChange(5, 0, ' beautiful')]
        expect(applyTextDocumentChanges(content, changes)).toBe('Hello beautiful world')
    })

    it('should replace text', () => {
        const content = 'Hello world'
        const changes = [createChange(6, 5, 'universe')]
        expect(applyTextDocumentChanges(content, changes)).toBe('Hello universe')
    })

    it('should handle multiple changes in sequence', () => {
        const content = 'Hello world'
        const changes = [createChange(0, 5, 'Hi'), createChange(3, 5, 'everyone')]
        expect(applyTextDocumentChanges(content, changes)).toBe('Hi everyone')
    })

    it('should handle deletion', () => {
        const content = 'Hello beautiful world'
        const changes = [createChange(5, 10, '')]
        expect(applyTextDocumentChanges(content, changes)).toBe('Hello world')
    })

    it('should handle empty changes array', () => {
        const content = 'Hello world'
        const changes: vscode.TextDocumentContentChangeEvent[] = []
        expect(applyTextDocumentChanges(content, changes)).toBe('Hello world')
    })

    it('should handle empty content', () => {
        const content = ''
        const changes = [createChange(0, 0, 'Hello')]
        expect(applyTextDocumentChanges(content, changes)).toBe('Hello')
    })
})

describe('doesLinesOverlapForRanges', () => {
    const createRange = (startLine: number, endLine: number): vscode.Range =>
        ({
            start: { line: startLine, character: 0 },
            end: { line: endLine, character: 0 },
        }) as vscode.Range

    it('should detect overlapping ranges', () => {
        const rangeA = createRange(1, 5)
        const rangeB = createRange(3, 7)
        expect(doesLinesOverlapForRanges(rangeA, rangeB)).toBe(true)
    })

    it('should detect adjacent non-overlapping ranges', () => {
        const rangeA = createRange(1, 3)
        const rangeB = createRange(4, 6)
        expect(doesLinesOverlapForRanges(rangeA, rangeB)).toBe(false)
    })

    it('should detect contained ranges', () => {
        const rangeA = createRange(1, 10)
        const rangeB = createRange(3, 5)
        expect(doesLinesOverlapForRanges(rangeA, rangeB)).toBe(true)
    })

    it('should detect ranges touching at endpoints', () => {
        const rangeA = createRange(1, 3)
        const rangeB = createRange(3, 5)
        expect(doesLinesOverlapForRanges(rangeA, rangeB)).toBe(true)
    })
})

describe('groupConsecutiveItemsByPredicate', () => {
    it('should return empty array when given an empty array', () => {
        const result = groupConsecutiveItemsByPredicate([], (a, b) => a === b)
        expect(result).toEqual([])
    })

    it('should group all items together when predicate is always true', () => {
        const items = [1, 2, 3, 4]
        const result = groupConsecutiveItemsByPredicate(items, () => true)
        expect(result).toEqual([[1, 2, 3, 4]])
    })

    it('should not group any items when predicate is always false', () => {
        const items = [1, 2, 3, 4]
        const result = groupConsecutiveItemsByPredicate(items, () => false)
        expect(result).toEqual([[1], [2], [3], [4]])
    })

    it('should group consecutive identical items', () => {
        const items = [1, 1, 2, 2, 2, 3, 1, 1]
        const result = groupConsecutiveItemsByPredicate(items, (a, b) => a === b)
        expect(result).toEqual([[1, 1], [2, 2, 2], [3], [1, 1]])
    })

    it('should group consecutive items based on a custom predicate (even numbers)', () => {
        const items = [1, 2, 4, 3, 6, 8, 7]
        const result = groupConsecutiveItemsByPredicate(items, (a, b) => a % 2 === 0 && b % 2 === 0)
        expect(result).toEqual([[1], [2, 4], [3], [6, 8], [7]])
    })

    it('should correctly group items with complex objects', () => {
        const items = [
            { type: 'A', value: 1 },
            { type: 'A', value: 2 },
            { type: 'B', value: 3 },
            { type: 'B', value: 4 },
            { type: 'A', value: 5 },
        ]
        const result = groupConsecutiveItemsByPredicate(items, (a, b) => a.type === b.type)
        expect(result).toEqual([
            [
                { type: 'A', value: 1 },
                { type: 'A', value: 2 },
            ],
            [
                { type: 'B', value: 3 },
                { type: 'B', value: 4 },
            ],
            [{ type: 'A', value: 5 }],
        ])
    })

    it('should group based on custom logic (sum of digits is even)', () => {
        const items = [11, 22, 34, 45, 55]
        const sumDigitsIsEven = (n: number) =>
            n
                .toString()
                .split('')
                .map(Number)
                .reduce((a, b) => a + b, 0) %
                2 ===
            0

        const result = groupConsecutiveItemsByPredicate(
            items,
            (a, b) => sumDigitsIsEven(a) === sumDigitsIsEven(b)
        )
        expect(result).toEqual([[11, 22], [34, 45], [55]])
    })
})

describe('computeDiffWithLineNumbers', () => {
    const createTestUri = () => ({
        fsPath: '/path/to/file.ts',
        toString: () => '/path/to/file.ts',
    } as vscode.Uri)

    const assertDiffResult = (result: any, expectedSnapshot: string) => {
        expect(result).toBeInstanceOf(PromptString)
        expect(result).toMatchInlineSnapshot(expectedSnapshot)
    }

    it('should compute diff with line numbers for added content', () => {
        const uri = createTestUri()
        const originalContent = 'line 1\nline 2\nline 3'
        const modifiedContent = 'line 1\nline 2\nnew line\nline 3'
        const numContextLines = 2

        const result = computeDiffWithLineNumbers(uri, originalContent, modifiedContent, numContextLines)

        assertDiffResult(
            result,
            dedent`
            "1 | line 1
            2 | line 2
            3+| new line
            4 | line 3"
            `
        )
    })

    it('should compute diff with line numbers for removed content', () => {
        const uri = createTestUri()
        const originalContent = 'line 1\nline 2\nline to remove\nline 3'
        const modifiedContent = 'line 1\nline 2\nline 3'
        const numContextLines = 2

        const result = computeDiffWithLineNumbers(uri, originalContent, modifiedContent, numContextLines)

        assertDiffResult(
            result,
            dedent`
            "1 | line 1
            2 | line 2
            3-| line to remove
            3 | line 3"
            `
        )
    })

    it('should compute diff with line numbers for modified content', () => {
        const uri = createTestUri()
        const originalContent = 'line 1\nold line\nline 3'
        const modifiedContent = 'line 1\nnew line\nline 3'
        const numContextLines = 1

        const result = computeDiffWithLineNumbers(uri, originalContent, modifiedContent, numContextLines)

        assertDiffResult(
            result,
            dedent`
            "1 | line 1
            2-| old line
            2+| new line
            3 | line 3"
            `
        )
    })

    it('should respect numContextLines parameter', () => {
        const uri = createTestUri()
        const originalContent = 'line 1\nline 2\nline 3\nline 4\nline 5'
        const modifiedContent = 'line 1\nline 2\nmodified line\nline 4\nline 5'
        const numContextLines = 1

        const result = computeDiffWithLineNumbers(uri, originalContent, modifiedContent, numContextLines)

        assertDiffResult(
            result,
            dedent`
            "2 | line 2
            3-| line 3
            3+| modified line
            4 | line 4"
            `
        )
    })

    it('should handle empty content', () => {
        const uri = createTestUri()
        const result = computeDiffWithLineNumbers(uri, '', 'new content', 1)

        assertDiffResult(
            result,
            dedent`
            "1+| new content"
            `
        )
    })
})





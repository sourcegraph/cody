import assert from 'assert'

import { describe, it } from 'vitest'
import * as vscode from 'vscode'

import { AgentTextDocument } from './AgentTextDocument'

describe('AgentTextDocument', () => {
    const basic = new AgentTextDocument({ filePath: 'foo', content: 'a\nb\n' })
    const basicCrlf = new AgentTextDocument({ filePath: 'foo', content: 'a\r\nb\r\n' })
    const emptyLine = new AgentTextDocument({ filePath: 'foo', content: 'a\n\n' })
    const noEndOfFileNewline = new AgentTextDocument({ filePath: 'foo', content: 'a\nb' })
    const emptyFirstLine = new AgentTextDocument({ filePath: 'foo', content: '\nb' })
    const emptyFirstLineCrlf = new AgentTextDocument({ filePath: 'foo', content: '\r\nb' })

    it('getText(Range)', () => {
        assert.equal(basic.getText(new vscode.Range(0, 0, 0, 1)), 'a')
        assert.equal(basic.getText(new vscode.Range(0, 0, 1, 1)), 'a\nb')
        assert.equal(basic.getText(new vscode.Range(2, 0, 2, 10)), '')
        assert.equal(basic.getText(new vscode.Range(0, 0, 2, 3)), 'a\nb\n')
    })

    it('lineCount()', () => {
        assert.equal(basic.lineCount, 2)
        assert.equal(basicCrlf.lineCount, 2)
        assert.equal(emptyFirstLine.lineCount, 2)
        assert.equal(noEndOfFileNewline.lineCount, 2)
        assert.equal(emptyFirstLine.lineCount, 2)
        assert.equal(emptyFirstLineCrlf.lineCount, 2)
    })

    it('positionAt()', () => {
        assert.deepEqual(basic.positionAt(0), new vscode.Position(0, 0))
    })

    it('lineAt()', () => {
        assert.equal(basic.getText(basic.lineAt(1).range), 'b')
        assert.equal(basic.getText(basic.lineAt(1).rangeIncludingLineBreak), 'b\n')
        assert.equal(basic.getText(basic.lineAt(2).range), '')
        assert.equal(basic.getText(basic.lineAt(2).rangeIncludingLineBreak), '')

        assert.equal(basicCrlf.getText(basic.lineAt(1).range), 'b')
        assert.equal(basicCrlf.getText(basicCrlf.lineAt(1).rangeIncludingLineBreak), 'b\r\n')
        assert.equal(basicCrlf.getText(basic.lineAt(2).range), '')
        assert.equal(basicCrlf.getText(basic.lineAt(2).rangeIncludingLineBreak), '')

        assert.equal(emptyLine.getText(emptyLine.lineAt(0).range), 'a')
        assert.equal(emptyLine.getText(emptyLine.lineAt(0).rangeIncludingLineBreak), 'a\n')
        assert.equal(emptyLine.getText(emptyLine.lineAt(1).range), '')
        assert.equal(emptyLine.getText(emptyLine.lineAt(1).rangeIncludingLineBreak), '\n')

        assert.equal(noEndOfFileNewline.getText(noEndOfFileNewline.lineAt(1).range), 'b')
        assert.equal(noEndOfFileNewline.getText(noEndOfFileNewline.lineAt(1).rangeIncludingLineBreak), 'b')

        assert.equal(emptyFirstLine.getText(emptyFirstLine.lineAt(0).range), '')
        assert.equal(emptyFirstLine.getText(emptyFirstLine.lineAt(0).rangeIncludingLineBreak), '\n')
        assert.equal(emptyFirstLine.getText(emptyFirstLine.lineAt(1).range), 'b')
        assert.equal(emptyFirstLine.getText(emptyFirstLine.lineAt(1).rangeIncludingLineBreak), 'b')

        assert.equal(emptyFirstLineCrlf.getText(emptyFirstLineCrlf.lineAt(0).range), '')
        assert.equal(emptyFirstLineCrlf.getText(emptyFirstLineCrlf.lineAt(0).rangeIncludingLineBreak), '\r\n')
        assert.equal(emptyFirstLineCrlf.getText(emptyFirstLineCrlf.lineAt(1).range), 'b')
        assert.equal(emptyFirstLineCrlf.getText(emptyFirstLineCrlf.lineAt(1).rangeIncludingLineBreak), 'b')
    })
})

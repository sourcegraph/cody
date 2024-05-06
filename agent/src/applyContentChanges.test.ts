import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { Uri } from 'vscode'
import { AgentTextDocument } from './AgentTextDocument'
import { applyContentChanges } from './applyContentChanges'

describe('applyContentChanges', () => {
    it('basic', () => {
        const document = AgentTextDocument.from(
            Uri.file('basic.ts'),
            dedent`
        interface Hello {
            greeting: string
        }`
        )
        const applied = applyContentChanges(document, [
            {
                range: { start: { line: 1, character: 1 }, end: { line: 1, character: 9 } },
                text: 'yolo',
            },
            {
                range: { start: { line: 1, character: 11 }, end: { line: 1, character: 13 } },
                text: 'hurrah',
            },
        ])
        expect(applied.newText).toMatchInlineSnapshot(`
          "interface Hello {
           yoloinhurrah string
          }"
        `)
        expect(applied.contentChanges.map(change => change.text)).toMatchInlineSnapshot(`
          [
            "yolo",
            "hurrah",
          ]
        `)
    })
})

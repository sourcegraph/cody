import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { Uri } from 'vscode'
import { AgentTextDocument } from './AgentTextDocument'
import { applyContentChanges } from './applyContentChanges'
import { calculateContentChanges } from './calculateContentChanges'

describe('calculateContentChanges', () => {
    it('basic', () => {
        const document = AgentTextDocument.from(
            Uri.file('basic.ts'),
            dedent`
        interface Hello {
            greeting: string
        }`
        )
        const newText = dedent`
        interface VeryHelloAgain {
            greeeting2: Map<string, number>
        }`
        const contentChanges = [...calculateContentChanges(document, newText)]
        const applied = applyContentChanges(document, contentChanges)
        expect(applied.newText).toStrictEqual(newText)
        expect(applied.contentChanges.map(change => change.text)).toMatchInlineSnapshot(`
          [
            "Very",
            "Again",
            "e",
            "2",
            "Map<",
            ", number>",
          ]
        `)
    })
})

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
    it('hard (expected)', () => {
        const document = AgentTextDocument.from(
            Uri.file('basic.ts'),
            dedent`
        class Hello {
            val x = 0
        }`
        )
        const newText = dedent`
        class Hello {
            val x = 0

            /**
             * Prints a greeting message to the console.
             */
            fun main() {
                println("Hello, world!")
            }

        }`
        const contentChanges = [...calculateContentChanges(document, newText)]
        const applied = applyContentChanges(document, contentChanges)
        expect(applied.newText).toStrictEqual(newText)
        expect(applied.contentChanges).toMatchObject([
            {
                range: {
                    end: {
                        character: 0,
                        line: 2,
                    },
                    start: {
                        character: 0,
                        line: 2,
                    },
                },
                rangeLength: 0,
                rangeOffset: 28,
                text: `
    /**
     * Prints a greeting message to the console.
     */
    fun main() {
        println("Hello, world!")
    }

`,
            },
        ])
    })
    it.skip('hard (actual)', () => {
        const document = AgentTextDocument.from(
            Uri.file('basic.ts'),
            dedent`
        class Hello {
            val x = 0
        }`
        )
        const newText = dedent`
        class Hello {
            val x = 0

            /**
             * Prints a greeting message to the console.
             */
            fun main() {
                println("Hello, world!")
            }

        }`
        const contentChanges = [...calculateContentChanges(document, newText)]
        const applied = applyContentChanges(document, contentChanges)
        expect(applied.newText).toStrictEqual(newText)
        expect(applied.contentChanges).toMatchObject([
            {
                range: {
                    end: {
                        character: 0,
                        line: 2,
                    },
                    start: {
                        character: 0,
                        line: 2,
                    },
                },
                rangeLength: 0,
                rangeOffset: 28,
                text: `
    /**
     * Prints a greeting message to the console.
     */
    fun main() {
        println("Hello, world!")
    `,
            },
            {
                range: {
                    end: {
                        character: 0,
                        line: 3,
                    },
                    start: {
                        character: 0,
                        line: 3,
                    },
                },
                rangeLength: 0,
                rangeOffset: 29,
                text: `

}`,
            },
        ])
    })
})

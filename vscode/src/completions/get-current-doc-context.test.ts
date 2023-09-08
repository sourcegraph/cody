import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { getCurrentDocContext } from './get-current-doc-context'
import { documentAndPosition } from './testHelpers'

describe('get-current-doc-context', () => {
    it('returns the right context for a document', () => {
        const { document, position } = documentAndPosition(
            dedent`
            function bubbleSort(arr) {
                for (let i = 0; i < arr.length; i++) {
                    for (let j = 0; j < arr.length; j++) {
                        if (arr[i] > arr[j]) {

                            let temp = █;

                            arr[i] = arr[j];
                            arr[j] = temp;
                        }
                    }
                }
            }
        `
        )

        const docContext = getCurrentDocContext(document, position, 140, 60)

        expect(docContext.currentLinePrefix).toBe('                let temp = ')
        expect(docContext.currentLineSuffix).toBe(';')
        expect(docContext.nextNonEmptyLine).toBe('                arr[i] = arr[j];')
        expect(docContext.prevNonEmptyLine).toBe('            if (arr[i] > arr[j]) {')
        expect(docContext.prefix).toMatchInlineSnapshot(`
          "        for (let j = 0; j < arr.length; j++) {
                      if (arr[i] > arr[j]) {

                          let temp = "
        `)
        expect(docContext.suffix).toMatchInlineSnapshot(`
          ";

                          arr[i] = arr[j];"
        `)
        expect(docContext.contextRange).toMatchInlineSnapshot(`
          Range {
            "end": Position {
              "character": 32,
              "line": 7,
            },
            "start": Position {
              "character": 0,
              "line": 2,
            },
          }
        `)
    })
})

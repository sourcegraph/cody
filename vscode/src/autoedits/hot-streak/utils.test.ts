import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { trimProcessedTextFromPrediction } from './utils'

describe('trimProcessedTextFromPrediction', () => {
    const MOCK_PREDICTION = dedent`
        export function isEvenOrOdd(numberToChange: number): boolean {
            // Check if target is 0
            if (numberToChange === 0) {
                return true
            }

            // Check if target is 1
            if (numberToChange === 1) {
                return false
            }

            throw new Error('Out of RAM')
        }
    `

    it('handles empty predictions', () => {
        const [prefix, remaining] = trimProcessedTextFromPrediction('', 5)
        expect(prefix).toBe('')
        expect(remaining).toBe('')
    })

    it('handles predictions with no processed lines', () => {
        const [prefix, remaining] = trimProcessedTextFromPrediction(MOCK_PREDICTION, 0)
        expect(prefix).toBe('')
        expect(remaining).toBe(MOCK_PREDICTION)
    })

    it('handles predictions with processed lines', () => {
        const [prefix, remaining] = trimProcessedTextFromPrediction(MOCK_PREDICTION, 2)
        expect(prefix).toMatchInlineSnapshot(`
          "export function isEvenOrOdd(numberToChange: number): boolean {
              // Check if target is 0
          "
        `)
        expect(remaining).toMatchInlineSnapshot(`
          "    if (numberToChange === 0) {
                  return true
              }

              // Check if target is 1
              if (numberToChange === 1) {
                  return false
              }

              throw new Error('Out of RAM')
          }"
        `)
    })
})

import { describe, expect, it } from 'vitest'

import { isWindows } from '@sourcegraph/cody-shared'

import { completionParams, contextSnippets } from './test-data'

import { DeepseekCoder } from '../deepseek'

describe('DeepseekCoder ', () => {
    describe.skipIf(isWindows())('getPrompt', () => {
        it('returns the prompt with the correct intro snippets', () => {
            const model = new DeepseekCoder()
            const { docContext, document, providerConfig } = completionParams

            const result = model.getPrompt({
                document,
                docContext,
                snippets: contextSnippets,
                promptChars: providerConfig.contextSizeHints.totalChars,
            })

            expect(result).toMatchInlineSnapshot(`
              "#codebase/context1.ts
              function contextSnippetOne() {}

              #codebase/context2.ts
              const contextSnippet2 = {}

              Additional documentation for \`ContextParams\`:
              interface ContextParams {}

              #codebase/test.ts
              <｜fim▁begin｜>console.log(prefix line: 1)
              console.log(prefix line: 2)
              console.log(prefix line: 3)
              console.log(prefix line: 4)
              console.log(prefix line: 5)
              console.log(prefix line: 6)
              console.log(prefix line: 7)
              console.log(prefix line: 8)
              console.log(prefix line: 9)
              console.log(prefix line: 10)
              console.log(prefix line: 11)
              console.log(prefix line: 12)
              console.log(prefix line: 13)
              console.log(prefix line: 14)
              console.log(prefix line: 15)
              console.log(prefix line: 16)
              console.log(prefix line: 17)
              console.log(prefix line: 18)
              console.log(prefix line: 19)
              console.log(prefix line: 20)
              console.log(prefix line: 21)
              console.log(prefix line: 22)
              console.log(prefix line: 23)
              console.log(prefix line: 24)
              console.log(prefix line: 25)
              console.log(prefix line: 26)
              console.log(prefix line: 27)
              console.log(prefix line: 28)
              console.log(prefix line: 29)
              console.log(prefix line: 30)
              console.log(prefix line: 31)
              console.log(prefix line: 32)
              console.log(prefix line: 33)
              console.log(prefix line: 34)
              console.log(prefix line: 35)
              console.log(prefix line: 36)
              console.log(prefix line: 37)
              console.log(prefix line: 38)
              console.log(prefix line: 39)
              console.log(prefix line: 40)
              console.log(prefix line: 41)
              console.log(prefix line: 42)
              console.log(prefix line: 43)
              console.log(prefix line: 44)
              console.log(prefix line: 45)
              console.log(prefix line: 46)
              console.log(prefix line: 47)
              console.log(prefix line: 48)
              console.log(prefix line: 49)
              console.log(prefix line: 50)
              console.log(prefix line: 51)
              console.log(prefix line: 52)
              console.log(prefix line: 53)
              console.log(prefix line: 54)
              console.log(prefix line: 55)
              console.log(prefix line: 56)
              console.log(prefix line: 57)
              console.log(prefix line: 58)
              console.log(prefix line: 59)
              console.log(prefix line: 60)
              console.log(prefix line: 61)
              console.log(prefix line: 62)
              console.log(prefix line: 63)
              console.log(prefix line: 64)
              console.log(prefix line: 65)
              console.log(prefix line: 66)
              console.log(prefix line: 67)
              console.log(prefix line: 68)
              console.log(prefix line: 69)
              console.log(prefix line: 70)
              console.log(prefix line: 71)
              console.log(prefix line: 72)
              console.log(prefix line: 73)
              console.log(prefix line: 74)
              console.log(prefix line: 75)
              console.log(prefix line: 76)
              console.log(prefix line: 77)
              console.log(prefix line: 78)
              console.log(prefix line: 79)
              console.log(prefix line: 80)
              console.log(prefix line: 81)
              console.log(prefix line: 82)
              console.log(prefix line: 83)
              console.log(prefix line: 84)
              console.log(prefix line: 85)
              console.log(prefix line: 86)
              console.log(prefix line: 87)
              console.log(prefix line: 88)
              console.log(prefix line: 89)
              console.log(prefix line: 90)
              console.log(prefix line: 91)
              console.log(prefix line: 92)
              console.log(prefix line: 93)
              console.log(prefix line: 94)
              console.log(prefix line: 95)
              console.log(prefix line: 96)
              console.log(prefix line: 97)
              console.log(prefix line: 98)
              console.log(prefix line: 99)
              console.log(prefix line: 100)
              function myFunction() {
                  console.log(1)
                  console.log(2)
                  console.log(3)
                  console.log(4)
                  <｜fim▁hole｜>
              }
              console.log(suffix line: 1)
              console.log(suffix line: 2)
              console.log(suffix line: 3)
              console.log(suffix line: 4)
              console.log(suffix line: 5)
              console.log(suffix line: 6)
              console.log(suffix line: 7)
              console.log(suffix line: 8)
              console.log(suffix line: 9)
              console.log(suffix line: 10)
              console.log(suffix line: 11)
              console.log(suffix line: 12)
              console.log(suffix line: 13)
              console.log(suffix line: 14)
              console.log(suffix line: 15)
              console.log(suffix line: 16)
              console.log(suffix line: 17)
              console.log(suffix line: 18)
              console.log(suffix line: 19)
              console.log(suffix line: 20)
              console.log(suffix line: 21)
              console.log(suffix line: 22)
              console.log(suffix line: 23)
              console.log(suffix line: 24)
              console.log(suffix line: 25)<｜fim▁end｜>"
            `)
        })
    })
})

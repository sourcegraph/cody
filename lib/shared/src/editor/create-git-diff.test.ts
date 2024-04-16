import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { createGitDiff } from './create-git-diff'

describe('createGitDiff', () => {
    it('should return a git diff', () => {
        const oldContent = dedent`
            // some code above

            function getRandomNumber() {
                return "4";
            }

            // some code below
        `
        const newContent = dedent`
            // some code above

            function getRandomNumber() {
                return 4;
            }

            // some code below
        `
        const filename = 'random.js'

        const patch = createGitDiff(filename, oldContent, newContent)

        expect(patch).toMatchInlineSnapshot(`
          "--- a/random.js
          +++ b/random.js
          @@ -1,7 +1,7 @@
           // some code above

           function getRandomNumber() {
          -    return "4";
          +    return 4;
           }

           // some code below
          \\ No newline at end of file
          "
        `)
    })
})

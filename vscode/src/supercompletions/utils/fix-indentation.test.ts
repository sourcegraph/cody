import { describe, expect, it } from 'vitest'
import { fixIndentation } from './fix-indentation'

describe('fixIndentation', () => {
    it('should fix indentation', () => {
        const current = '  function foo() {\n    return 1\n  }'
        const original = 'function foo() {\n  return 1\n}'
        const updated = 'function bar() {\n  return 1\n}'

        expect(fixIndentation(current, original, updated)).toBe('  function bar() {\n    return 1\n  }')
    })
})

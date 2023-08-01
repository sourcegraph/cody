import { describe, expect, it } from 'vitest'

import {
    checkHasSameNumberOfSpacesAsStartLine,
    checkIsNonFunction,
    checkIsStartOfFunctionOrClass,
    isLineEmpty,
    isLineObject,
    isLineSingleCharOnly,
    isLineVariable,
} from './text-doc-helpers'

describe('isLineEmpty', () => {
    it('returns true for empty line', () => {
        const text = ''
        expect(isLineEmpty(text)).toBe(true)
    })

    it('returns false for line with only spaces', () => {
        const text = '   '
        expect(isLineEmpty(text)).toBe(true)
    })

    it('returns false for line with text', () => {
        const text = 'foo'
        expect(isLineEmpty(text)).toBe(false)
    })

    it('returns false for line with leading spaces and text', () => {
        const text = '    foo'
        expect(isLineEmpty(text)).toBe(false)
    })

    it('returns false for line with trailing spaces and text', () => {
        const text = 'foo   '
        expect(isLineEmpty(text)).toBe(false)
    })
})

describe('isLineObject', () => {
    it('returns true for object assignment', () => {
        const text = 'const foo = {}'
        expect(isLineObject(text)).toBe(true)
    })

    it('returns true for object assignment with spaces', () => {
        const text = 'const foo    = {}'
        expect(isLineObject(text)).toBe(true)
    })

    it('returns true for object assignment - first line', () => {
        const text = 'const foo = {'
        expect(isLineObject(text)).toBe(true)
    })

    it('returns true for config object assignment - first line', () => {
        const text = 'foo = {'
        expect(isLineObject(text)).toBe(true)
    })

    it('returns false for non-object assignment', () => {
        const text = 'const foo = "bar"'
        expect(isLineObject(text)).toBe(false)
    })

    it('returns false for empty line', () => {
        const text = ''
        expect(isLineObject(text)).toBe(false)
    })

    it('returns false for line with no assignment', () => {
        const text = 'const foo'
        expect(isLineObject(text)).toBe(false)
    })
})

describe('isLineSingleCharOnly', () => {
    it('returns true for line with single char', () => {
        const text = 'a'
        expect(isLineSingleCharOnly(text)).toBe(true)
    })

    it('returns false for empty line', () => {
        const text = ''
        expect(isLineSingleCharOnly(text)).toBe(false)
    })

    it('returns true for curly bracket', () => {
        const text = '{'
        expect(isLineSingleCharOnly(text)).toBe(true)
    })

    it('returns false for line with multiple chars', () => {
        const text = 'foo'
        expect(isLineSingleCharOnly(text)).toBe(false)
    })

    it('returns false for line with leading space and single char', () => {
        const text = ' a'
        expect(isLineSingleCharOnly(text)).toBe(true)
    })

    it('returns false for line with trailing space and single char', () => {
        const text = 'a '
        expect(isLineSingleCharOnly(text)).toBe(true)
    })
})

describe('checkIsStartOfFunctionOrClass', () => {
    it('returns true for normal functions', () => {
        const text = 'function foo() {'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns true for arrow functions', () => {
        const text = 'const foo = () => {'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns true for classes', () => {
        const text = 'class Foo {'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns false for empty lines', () => {
        const text = ''
        expect(checkIsStartOfFunctionOrClass(text)).toBe(false)
    })

    it('returns false for comments', () => {
        const text = '      // comment'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(false)
    })

    it('returns false for non-function code', () => {
        const text = 'const bar = 1'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(false)
    })

    it('returns false for comments', () => {
        const text = '  /*'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(false)
    })

    it('returns true for Python functions', () => {
        const text = 'def my_func():'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns true for async Python functions', () => {
        const text = 'async def my_func():'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns true for Python classes', () => {
        const text = 'class MyClass:'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns true for Java methods', () => {
        const text = 'public void myMethod() {'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns true for C++ functions', () => {
        const text = 'void myFunction() {'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns true for Go functions', () => {
        const text = 'func myFunc() {'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(true)
    })

    it('returns false for bazel config', () => {
        const text = 'pkg_tar('
        expect(checkIsStartOfFunctionOrClass(text)).toBe(false)
    })

    it('returns false for symbol with word', () => {
        const text = '  :tar_symbols'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(false)
    })

    it('returns false for array', () => {
        const text = '  repo_tags = ["symbols:candidate"]'
        expect(checkIsStartOfFunctionOrClass(text)).toBe(false)
    })
})

describe('checkHasSameNumberOfSpacesAsStartLine', () => {
    it('returns true if end line has same number of leading spaces as start line', () => {
        const start = '      const foo = 1'
        const end = '      const bar = 2'
        expect(checkHasSameNumberOfSpacesAsStartLine(start, end)).toBe(true)
    })

    it('returns false if end line has different number of leading spaces from start line', () => {
        const start = '      const foo = 1'
        const end = '   const bar = 2'
        expect(checkHasSameNumberOfSpacesAsStartLine(start, end)).toBe(false)
    })

    it('returns false if end line is empty', () => {
        const start = '      const foo = 1'
        const end = ''
        expect(checkHasSameNumberOfSpacesAsStartLine(start, end)).toBe(false)
    })

    it('returns false if start line is empty', () => {
        const start = ''
        const end = '      const bar = 2'
        expect(checkHasSameNumberOfSpacesAsStartLine(start, end)).toBe(false)
    })

    it('return true after trims', () => {
        const start = '   const foo = 1'.trim()
        const end = '   const bar = 2'.trim()
        expect(checkHasSameNumberOfSpacesAsStartLine(start, end)).toBe(true)
    })
})

describe('checkIsNonFunction', () => {
    it('returns true for variable declaration', () => {
        const line = 'const foo = 1'
        expect(checkIsNonFunction(line)).toBe(true)
    })

    it('returns true for empty line', () => {
        const line = ''
        expect(checkIsNonFunction(line)).toBe(true)
    })

    it('returns true for single character line', () => {
        const line = '{'
        expect(checkIsNonFunction(line)).toBe(true)
    })

    it('returns true for comment', () => {
        const line = '// comment'
        expect(checkIsNonFunction(line)).toBe(true)
    })

    it('returns false for function declaration', () => {
        const line = 'function foo() {}'
        expect(checkIsNonFunction(line)).toBe(false)
    })
})

describe('isLineVariable', () => {
    it('returns true for variable declaration', () => {
        const text = 'const foo = []'
        expect(isLineVariable(text)).toBe(true)
    })

    it('returns true for variable assignment', () => {
        const text = 'foo = []'
        expect(isLineVariable(text)).toBe(true)
    })

    it('returns true for string assignment', () => {
        const text = 'foo = "bar"'
        expect(isLineVariable(text)).toBe(true)
    })

    it('returns true for array assignment', () => {
        const text = 'foo = ["bar"]'
        expect(isLineVariable(text)).toBe(true)
    })

    it('returns true for object key:value pair', () => {
        const text = '"foo" : "bar"'
        expect(isLineVariable(text)).toBe(true)
    })

    it('returns false for arrow function', () => {
        const text = '"foo" => "bar"'
        expect(isLineVariable(text)).toBe(true)
    })

    it('returns true for object variable declaration', () => {
        const text = 'const foo = { "foo": "baz" }'
        expect(isLineVariable(text)).toBe(true)
    })

    it('returns true for object', () => {
        const text = '{ "foo": "baz" }'
        expect(isLineVariable(text)).toBe(true)
    })

    it('returns true for empty string', () => {
        const text = '""'
        expect(isLineVariable(text)).toBe(true)
    })
})

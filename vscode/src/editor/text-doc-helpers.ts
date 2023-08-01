/**
 * Helpers
 */
// Check if the line starts with a word
export const startsWithWord = (text: string): boolean => /^\w/.test(text)
// Check for empty text / line
export const isLineEmpty = (text: string): boolean => text?.trim() === ''
// Check for object declaration, assignment, config (eg 'const foo = {}', 'foo = {}')
export const isLineObject = (text: string): boolean => /.*=\s{(})?$/.test(text)
// Check for line with only a single char
export const isLineSingleCharOnly = (text: string): boolean => /^.$/.test(text.trim())
// Check for line with only a single word
export const isLineSingleWordOnly = (text: string): boolean => text.trim().split(' ').length === 1
// Check for arrow function
export const isLineArrowFunction = (text: string): boolean => /^.*=>.*$/.test(text.trim())
// Check for arrow function
export const isLineStatement = (text: string): boolean =>
    /^(if|for|while|switch|case|return|try|catch).*$/.test(text.trim())
// Check for variable declaration, array, list, tuple, dict
// (e.g. 'const foo = []', 'foo = []', 'foo = "bar"',, 'foo = ["bar"]',  '":foo"',, 'foo= {', 'foo = {}', '"foo" : "bar", 'foo bar', (foo bar), [foo bar], "foo bar", "foo:  bar," etc)
export const isLineVariable = (text: string): boolean => {
    text = text.trim()
    return (
        (/.*=.*$/.test(text) && !isLineArrowFunction(text)) ||
        /^".+:.+"/m.test(text) ||
        /^:.+:$/m.test(text) ||
        /^load\("@.+"(, ".+")?\)/m.test(text) ||
        /^\W.*\W$/.test(text) ||
        /^\w+(\s)?:.*/m.test(text)
    )
}
/**
 *  Cover first line of class methods for all languages
 * (e.g. 'public void myMethod() {',
 * java 'public void myMethod() {',
 * c# 'public void myMethod() {',
 * c++ 'void myMethod() {',
 * python 'def my_func():', 'async def my_func():',
 * javascript 'export class MyClass {', 'class MyClass('
 */
export const isLineStartOfClass = (text: string): boolean =>
    /^(public|private|protected|internal|static|async|export)?\s*(class|def)?\s*\w*\s*(:|->)?\s*\w*\s*{.*|.:/.test(
        text.trim()
    )
/**
 * Use regex to check if the line is not a function
 */
export const checkIsNonFunction = (text: string): boolean => {
    text = text.trim()
    const isVariable = isLineVariable(text)
    const isEmptyLine = isLineEmpty(text)
    const isSingle = isLineSingleCharOnly(text) || isLineSingleWordOnly(text)
    const isComment = /^\/(\/|\*)/.test(text)
    const isStatement = isLineStatement(text)
    return isStatement || isEmptyLine || isSingle || isComment || isVariable
}
/**
 * Use regex to check if the line is the first line of a function
 */
export const checkIsLineAFunction = (text: string): boolean => {
    text = text.trim()
    const isObject = isLineObject(text)
    // JavaScript / TypeScript
    const isJSArrowFunction = /^.*=.*=>.*$/.test(text) && !isObject
    const isJSFunction = !!text.match(/^\w.*{$/) || isJSArrowFunction
    // Python
    const isPythonFunction = /^(async\s*)?def\s/.test(text)
    // C#
    const isCSharpFunction = !!text.match(
        /^(public|private|protected|internal|static|async)\s+[\w<>]+\s+\w+\s*\(.*\)\s*{.*/
    )
    // Haskell
    const isHaskellFunction = /^(\w+\s*::\s*\w+\s*->\s*\w+\s*)$/.test(text)
    // Clojure
    const isClojureFunction = /^(\(defn\s+\w+\s*\[.*]\s*)$/.test(text)
    // Swift
    const isSwiftFunction = /^(\w+\s*\(.*\)\s*->\s*\w+\s*)$/.test(text)
    // Ruby
    const isRubyFunction = /^def\s+\w+\s*\(.*\)/.test(text)
    // PHP
    const isPHPFunction = /^(public|private|protected|static)\s+function\s+\w+\s*\(.*\)\s*{.*/.test(text)
    // Rust
    const isRustFunction = /^(pub|fn)\s+\w+\s*\(.*\)\s*->\s*\w+\s*{.*/.test(text)
    // Bash
    const isBashFunction = /^(\w+\s*\(\)\s*)$/.test(text)
    return (
        isJSArrowFunction ||
        isJSFunction ||
        isPythonFunction ||
        isCSharpFunction ||
        isRubyFunction ||
        isPHPFunction ||
        isRustFunction ||
        isBashFunction ||
        isHaskellFunction ||
        isClojureFunction ||
        isSwiftFunction
    )
}
/**
 * Check if the end line text starts with the same number of spaces as the start line text
 */
export const checkHasSameNumberOfSpacesAsStartLine = (startLineText: string, endLineText: string): boolean => {
    if (startLineText.length === 0 || endLineText.length === 0) {
        return false
    }
    return new RegExp(`^\\s{${startLineText.length}}.*$`).test(endLineText)
}
/**
 * Use regex to check if the line starts with a function in various languages
 */
export const checkIsStartOfFunctionOrClass = (text: string): boolean => {
    if (!text) {
        return false
    }
    text = text.trim()
    const isNonFunction = checkIsNonFunction(text)
    const isFunctionOrClass = checkIsLineAFunction(text) || isLineStartOfClass(text)
    return !isNonFunction && isFunctionOrClass
}

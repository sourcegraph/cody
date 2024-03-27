import { describe, expect, it } from 'vitest'
import { SupportedLanguage } from './grammars'
import { initTreeSitterParser } from './test-helpers'

describe('tree-sitter grammars', () => {
    const testCases: {
        language: SupportedLanguage
        code: string
        expectedCapture: string
        query?: string
    }[] = [
        {
            language: SupportedLanguage['objective-c'],
            code: '@interface MyClass : NSObject\n@end',
            expectedCapture: 'MyClass',
        },
        {
            language: SupportedLanguage.c,
            code: 'int main() { return 0; }',
            expectedCapture: 'main',
        },
        {
            language: SupportedLanguage.cpp,
            code: 'int main() { std::cout << "Hello, world!" << std::endl; return 0; }',
            expectedCapture: 'main',
        },
        {
            language: SupportedLanguage.csharp,
            code: 'class Program { static void Main(string[] args) { } }',
            expectedCapture: 'Program',
        },
        {
            language: SupportedLanguage.css,
            code: 'body { color: red; }',
            query: '(tag_name) @identifier',
            expectedCapture: 'body',
        },
        {
            language: SupportedLanguage.dart,
            code: 'void main() { print("Hello, world!"); }',
            expectedCapture: 'main',
        },
        {
            language: SupportedLanguage.elixir,
            code: 'defmodule MyModule do\nend',
            expectedCapture: 'defmodule',
        },
        {
            language: SupportedLanguage.elm,
            code: 'main = text "Hello, world!"',
            query: '(lower_case_identifier) @identifier',
            expectedCapture: 'main',
        },
        {
            language: SupportedLanguage.go,
            code: 'func main() { fmt.Println("Hello, world!") }',
            expectedCapture: 'main',
        },
        {
            language: SupportedLanguage.html,
            code: '<html><body><h1>Hello, world!</h1></body></html>',
            query: '(tag_name) @identifier',
            expectedCapture: 'html',
        },
        {
            language: SupportedLanguage.java,
            code: 'public class Main { public static void main(String[] args) { } }',
            expectedCapture: 'Main',
        },
        {
            language: SupportedLanguage.javascript,
            code: 'function helloWorld() { console.log("Hello, world!") }',
            expectedCapture: 'helloWorld',
        },
        {
            language: SupportedLanguage.javascriptreact,
            code: 'function MyComponent() { return <div>Hello, world!</div> }',
            expectedCapture: 'MyComponent',
        },
        {
            language: SupportedLanguage.json,
            code: '{ "message": "Hello, world!" }',
            query: '(string_content) @identifier',
            expectedCapture: 'message',
        },
        {
            language: SupportedLanguage.kotlin,
            code: 'fun main() { println("Hello, world!") }',
            query: '(simple_identifier) @identifier',
            expectedCapture: 'main',
        },
        {
            language: SupportedLanguage.elisp,
            code: '(defun hello-world () (message "Hello, world!"))',
            query: '(symbol) @identifier',
            expectedCapture: 'hello-world',
        },
        {
            language: SupportedLanguage.lua,
            code: 'function helloWorld() print("Hello, world!") end',
            expectedCapture: 'helloWorld',
        },
        {
            language: SupportedLanguage.ocaml,
            code: 'let main () = print_endline "Hello, world!"',
            query: '(value_name) @identifier',
            expectedCapture: 'main',
        },
        {
            language: SupportedLanguage.php,
            code: '<?php function helloWorld() { echo "Hello, world!"; } ?>',
            query: '(name) @identifier',
            expectedCapture: 'helloWorld',
        },
        {
            language: SupportedLanguage.python,
            code: 'def hello_world():\n    print("Hello, world!")',
            expectedCapture: 'hello_world',
        },
        {
            language: SupportedLanguage.rescript,
            code: 'let helloWorld = () => Js.log("Hello, world!")',
            query: '(value_identifier) @identifier',
            expectedCapture: 'helloWorld',
        },
        {
            language: SupportedLanguage.ruby,
            code: 'def hello_world\n  puts "Hello, world!"\nend',
            expectedCapture: 'hello_world',
        },
        {
            language: SupportedLanguage.rust,
            code: 'fn main() { println!("Hello, world!"); }',
            expectedCapture: 'main',
        },
        {
            language: SupportedLanguage.scala,
            code: 'object Main { def main(args: Array[String]): Unit = { println("Hello, world!") } }',
            expectedCapture: 'Main',
        },
        {
            language: SupportedLanguage.shellscript,
            code: '#!/bin/bash\necho "Hello, world!"',
            query: '(command_name) @identifier',
            expectedCapture: 'echo',
        },
        {
            language: SupportedLanguage.swift,
            code: 'func helloWorld() { print("Hello, world!") }',
            query: '(simple_identifier) @identifier',
            expectedCapture: 'helloWorld',
        },
        {
            language: SupportedLanguage.typescript,
            code: 'function helloWorld() { console.log("Hello, world!") }',
            expectedCapture: 'helloWorld',
        },
        {
            language: SupportedLanguage.typescriptreact,
            code: 'function MyComponent() { return <div>Hello, world!</div> }',
            expectedCapture: 'MyComponent',
        },
    ]

    it('covers all supported languages', async () => {
        expect(testCases.map(testCase => testCase.language)).toEqual(Object.values(SupportedLanguage))
    })

    for (const { language, code, expectedCapture, query } of testCases) {
        it(`works with ${language}`, async () => {
            const parser = await initTreeSitterParser(language as SupportedLanguage)
            if (parser === undefined) {
                throw new Error('Tree-sitter parser is not initialized')
            }
            const tree = parser.parse(code)
            const compiledQuery = parser.getLanguage().query(query || '(identifier) @identifier')
            const captures = compiledQuery.captures(tree.rootNode)
            expect(captures[0].node.text).toBe(expectedCapture)
        })
    }
})

import { describe, expect, test } from 'vitest'
import type * as vscode from 'vscode'
import { findCodeBlockRangeUniversal } from './codeblock'

describe('CodeBlock Tests', () => {
    const testCases = [
        {
            languageId: 'typescript',
            name: 'Find block by line number',
            input: `function test() {
    const a = 1;
    const b = 2;
}`,
            target: 0,
            expected: {
                startLine: 0,
                endLine: 3,
            },
        },
        {
            name: 'Find block by search string',
            input: `class Example {
    constructor() {
        this.value = 42;
    }

    method() {
        return this.value;
    }
}`,
            target: 'constructor',
            expected: {
                startLine: 1,
                endLine: 3,
            },
        },
        {
            name: 'Handle empty document',
            languageId: 'typescript',
            input: '',
            target: 0,
            expected: undefined,
        },
        {
            name: 'Handle single line',
            input: 'const x = 1;',
            target: 0,
            expected: {
                startLine: 0,
                endLine: 0,
            },
        },
        {
            name: 'Python: Find block by line number',
            languageId: 'python',
            input: `def hello():
    print("Hello, world!")

def goodbye():
    print("Goodbye!")`,
            target: 0,
            expected: {
                startLine: 0,
                endLine: 1,
            },
        },
        {
            name: 'Python: Find block by search string',
            languageId: 'python',
            input: `class MyClass:
    def __init__(self):
        self.value = 10

    def method(self):
        return self.value`,
            target: '__init__',
            expected: {
                startLine: 1,
                endLine: 2,
            },
        },
        {
            name: 'Go: Find block by search string',
            input: `package main

        type MyStruct struct {
            Value int
        }

        func (s *MyStruct) Method() int {
            return s.Value
        }`,
            target: 'Method',
            expected: {
                startLine: 6,
                endLine: 8,
            },
            languageId: 'go',
        },
        {
            name: 'Go: Find block by line number',
            input: `package main

func main() {
    println("Hello, Go!")
}

func anotherFunc() {
    println("Another function")
}`,
            target: 2,
            expected: {
                startLine: 2,
                endLine: 4,
            },
        },
        {
            name: 'Java: Find block by line number',
            languageId: 'java',
            input: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, Java!");
    }

    public void anotherMethod() {
        // Some code here
    }
}`,
            target: 1,
            expected: {
                startLine: 1,
                endLine: 3,
            },
        },
        {
            name: 'Java: Find block by search string',
            languageId: 'java',
            input: `public class Example {
    private int value;

    public Example(int value) {
        this.value = value;
    }

    public int getValue() {
        return this.value;
    }
}`,
            target: 'Example(int value)',
            expected: {
                startLine: 3,
                endLine: 5,
            },
        },
    ]

    for (const tc of testCases) {
        test(tc.name, () => {
            const doc = {
                languageId: tc.languageId,
                getText: () => tc.input,
                lineAt: (line: number) => ({ text: tc.input.split('\n')[line] }),
            } as vscode.TextDocument

            const result = findCodeBlockRangeUniversal(doc, tc.target)

            if (!tc.expected) {
                expect(result).toBeUndefined()
            } else {
                expect(result).toBeDefined()
                expect(result?.start.line).toBe(tc.expected.startLine)
                expect(result?.end.line).toBe(tc.expected.endLine)
            }
        })
    }
})

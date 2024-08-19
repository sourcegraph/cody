import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { SymbolFormatter, declarationName } from './SymbolFormatter'

import { getTSSymbolAtLocation } from './getTSSymbolAtLocation'

describe('SymbolFormatter', () => {
    function formatSymbols(source: string): string[] {
        const host = ts.createCompilerHost({})
        const oldGetSourceFile = host.getSourceFile
        host.getSourceFile = (fileName: string, a, b, c) => {
            if (fileName === 'test.ts') {
                return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
            }
            return oldGetSourceFile(fileName, a, b, c)
        }
        // TODO: use `ts.LanguageService` instead of creating a program for
        // every test case. Currently, each test case takes ~300ms to run, which
        // quickly adds up, but it's good enough for now.
        const program = ts.createProgram(['test.ts'], {}, host)
        const checker = program.getTypeChecker()
        const formatter = new SymbolFormatter(checker, 10)
        const sourceFile = program.getSourceFile('test.ts')
        if (!sourceFile) {
            return []
        }
        const result: string[] = []
        for (const statement of sourceFile.statements) {
            const name = declarationName(statement)
            if (!name) {
                continue
            }
            const symbol = getTSSymbolAtLocation(checker, name)
            if (!symbol) {
                continue
            }
            result.push(formatter.formatSymbol(statement, symbol, 0))
        }
        return result
    }

    it('interface', () => {
        expect(
            formatSymbols(`
            interface Address {
                street: string
                city: string
            }
            interface User extends Address {
                name: string;
                age: number;
            }
            `)
        ).toMatchInlineSnapshot(`
          [
            "interface Address {
            street: string
            city: string
          }
          ",
            "interface User extends Address {
            name: string
            age: number
          }
          ",
          ]
        `)
    })

    it('class', () => {
        expect(
            formatSymbols(`
            abstract class SuperExample {
                constructor (public baseAge: number) {}
            }
            class Example extends SuperExample {
                age = 42
                constructor(public readonly name: string) {super(43)}
                public uppercaseName(): string { return this.name.toUpperCase() }
            }
            export class ComplexClass {
                constructor(
                    public a: Record<string, number>,
                    public b: string,
                    public c: (c: string, d: string) => string,
                    private d: {
                        a: string
                        b: number
                    }
                ) {
                    // This is a command
                }

                public static create(): ComplexClass {
                    return new ComplexClass(
                        {
                            a: 1,
                            b: 2,
                        },
                        'a',
                        (c, d) => c + d,
                        {
                            a: '',
                            b: 2,
                        }
                    )
                }
            }
            `)
        ).toMatchInlineSnapshot(`
          [
            "class SuperExample {
            constructor(baseAge: number): SuperExample
            baseAge: number
          }
          ",
            "class Example extends SuperExample {
            age: number
            constructor(name: string): Example
            name: string
            uppercaseName(): string
          }
          ",
            "class ComplexClass {
            constructor(a: Record<string, number>, b: string, c: (c: string, d: string) => string, d: { a: string; b: number; }): ComplexClass
            a: Record<string, number>
            b: string
            c: (c: string, d: string) => string
            d: {
              a: string;
              b: number;
          }
          }
          ",
          ]
        `)
    })

    it('type-alias', () => {
        expect(
            formatSymbols(`
            type Animal = Dog | Cat
            type Dog = { kind: 'dog'; /* noisy comment */ bark: string }
            type Cat = { kind: 'cat'; /* pew pie */ meow: string }
            type CustomStr = string & { __custom: never }
            type TypeParams<S> = Map<string, S>
            `)
            // Observe that we've left out the comments
        ).toMatchInlineSnapshot(`
          [
            "type Animal = Dog | Cat",
            "type Dog = { kind: "dog"; bark: string; }",
            "type Cat = { kind: "cat"; meow: string; }",
            "type CustomStr = string & { __custom: never; }",
            "type TypeParams<S> = Map<string, S>",
          ]
        `)
    })

    it('enum', () => {
        expect(
            formatSymbols(`
            enum Weekend { Saturday, Sunday }
            enum Color { Blue = /* inline comment */ 'blue', Red = 'red' }
            enum Animal { Dog = /* trivia */ 1, Cat = 2 }
            enum Hex {
                First        = 1 << 23 // Some comment
                SecondFolder = 1 << 22
            }
            `)
        ).toMatchInlineSnapshot(`
          [
            "enum Weekend {
            Saturday
            Sunday
          }
          ",
            "enum Color {
            Blue = 'blue'
            Red = 'red'
          }
          ",
            "enum Animal {
            Dog = 1
            Cat = 2
          }
          ",
            "enum Hex {
            First = 1 << 23
            SecondFolder = 1 << 22
          }
          ",
          ]
        `)
    })

    it('function', () => {
        expect(
            formatSymbols(`
            export function add(a: number, b: number): number { return a + b }
            export function first<T>(elements: T[]): T { return elements[0] }
            `)
        ).toMatchInlineSnapshot(`
          [
            "function add(a: number, b: number): number",
            "function first<T>(elements: T[]): T",
          ]
        `)
    })

    it('const', () => {
        expect(
            formatSymbols(`
            const values = [1, 2, 3]
            export const constValues = [1, 2, 3] as const
            export const createStrings = () => ['a', 'b', 'c']
            `)
        ).toMatchInlineSnapshot(`
          [
            "const values: number[]",
            "const constValues: readonly [1, 2, 3]",
            "const createStrings: () => string[]",
          ]
        `)
    })
})

import dedent from 'dedent'
import { describe, expect, test } from 'vitest'
import * as vscode from 'vscode'

import { testFileUri } from '@sourcegraph/cody-shared'

import { FixupCodeAction } from './fixup'

describe('fixup code action', () => {
    test('produces correct prompt for code with a single diagnostic', async () => {
        const text = dedent`
        export function getRerankWithLog(
            chatClient: ChatClient
        ): (query: string, results: ContextResult[]) => Promise<ContextResult[]> {
            if (TestSupport.instance) {
                const reranker = TestSupport.instance.getReranker()
                return (query: string, results: ContextResult[]): Promise<ContextResult[]> => reranker.rerank(query, results)
            }

            const reranker = new LLMReranker(chatClient)
            return async (userQuery: string, results: ContextResult[]): Promise<ContextResult[]> => {
                const start = performance.now()
                const rerankedResults = await reranker.rerank(userQuery, results)
                const duration = performance.now() - start
                logDebug('Reranker:rerank', JSON.stringify({ duration }))
                const rerank
            }
        }
        `
        const diagnostic = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                message: "Type 'null' is not assignable to type 'ContextResult[]'.",
                range: new vscode.Range(21, 8, 21, 14),
                source: 'ts',
                code: 2322,
            },
        ]

        const codeAction = new FixupCodeAction()
        const prompt = await codeAction.getCodeActionInstruction(text, diagnostic)
        expect(prompt).toMatchSnapshot()
    })

    test('produces correct prompt for a limited diagnostic', async () => {
        const text = dedent`
        export function getRerankWithLog(
            chatClient: ChatClient
        ): (query: string, results: ContextResult[]) => Promise<ContextResult[]> {
            if (TestSupport.instance) {
                const reranker = TestSupport.instance.getReranker()
                return (query: string, results: ContextResult[]): Promise<ContextResult[]> => reranker.rerank(query, results)
            }

            const reranker = new LLMReranker(chatClient)
            return async (userQuery: string, results: ContextResult[]): Promise<ContextResult[]> => {
                const start = performance.now()
                const rerankedResults = await reranker.rerank(userQuery, results)
                const duration = performance.now() - start
                logDebug('Reranker:rerank', JSON.stringify({ duration }))
                const rerank
            }
        }
        `
        const diagnostic = [
            {
                severity: vscode.DiagnosticSeverity.Warning,
                message: "Type 'null' is not assignable to type 'ContextResult[]'.",
                range: new vscode.Range(new vscode.Position(21, 8), new vscode.Position(21, 14)),
            },
        ]

        const codeAction = new FixupCodeAction()
        const prompt = await codeAction.getCodeActionInstruction(text, diagnostic)
        expect(prompt).toMatchSnapshot()
    })

    test('produces correct prompt for code with multiple diagnostics and overlapping ranges', async () => {
        const text = dedent`
        export function getRerankWithLog(
            chatClient: ChatClient
        ): (query: string, results: ContextResult[]) => Promise<ContextResult[]> {
            if (TestSupport.instance) {
                const reranker = TestSupport.instance.getReranker()
                return (query: string, results: ContextResult[]): Promise<ContextResult[]> => reranker.rerank(query, results)
            }

            const reranker = new LLMReranker(chatClient)
            return async (userQuery: string, results: ContextResult[]): Promise<ContextResult[]> => {
                const start = performance.now()
                const rerankedResults = await reranker.rerank(userQuery, results)
                const duration = performance.now() - start
                logDebug('Reranker:rerank', JSON.stringify({ duration }))
                const rerank
            }
        }
        `
        const diagnostics = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                message: "'const' declarations must be initialized.",
                range: new vscode.Range(21, 14, 21, 20),
                source: 'ts',
                code: 1155,
            },
            {
                severity: vscode.DiagnosticSeverity.Warning,
                message: "'rerank' is declared but its value is never read.",
                range: new vscode.Range(21, 14, 21, 20),
                source: 'ts',
                code: 6133,
            },
            {
                severity: vscode.DiagnosticSeverity.Error,
                message: "Variable 'rerank' implicitly has an 'any' type.",
                range: new vscode.Range(21, 14, 21, 20),
                source: 'ts',
                code: 7005,
            },
        ]

        const codeAction = new FixupCodeAction()
        const prompt = await codeAction.getCodeActionInstruction(text, diagnostics)
        expect(prompt).toMatchSnapshot()
    })

    test('produces correct prompt for diagnostics with related information', async () => {
        const testDocUri = testFileUri('document1.ts')
        const diagnostics = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                message: 'no field `taur` on type `&mut tauri::Config`',
                range: new vscode.Range(96, 9, 96, 13),
                source: 'rustc',
                relatedInformation: [
                    {
                        location: {
                            uri: testDocUri,
                            range: new vscode.Range(90, 1, 92, 13),
                        },
                        message: 'a field with a similar name exists: `tauri`',
                    },
                ],
            },
        ]

        const codeAction = new FixupCodeAction()
        const prompt = await codeAction.getCodeActionInstruction('         .taur', diagnostics)
        expect(prompt).toMatchSnapshot()
    })
})

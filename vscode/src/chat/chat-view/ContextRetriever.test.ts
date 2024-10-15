import { type ContextItem, type Result, ps } from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { SymfRunner } from '../../local-context/symf'
import { ContextRetriever, type Root, toStructuredMentions } from './ContextRetriever'

describe('ContextRetriever', () => {
    let contextRetriever: ContextRetriever
    let mockEditor: VSCodeEditor
    let mockSymf: SymfRunner

    beforeEach(() => {
        mockEditor = {
            getTextEditorContentForFile: vi.fn(),
        } as unknown as VSCodeEditor

        mockSymf = {
            getLiveResults: vi.fn(),
            dispose: vi.fn(),
        } as unknown as SymfRunner

        contextRetriever = new ContextRetriever(mockEditor, mockSymf)
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    describe('retrieveContext', () => {
        it('retrieves context from mentions', async () => {
            const mentions = [
                { type: 'repository', repoName: 'test/repo', repoID: 'repo1' },
            ] as ContextItem[]
            const inputText = ps`Test query`
            const mockSpan = {} as any

            vi.spyOn(contextRetriever as any, '_retrieveContext').mockResolvedValue([
                { type: 'file', content: 'Test content', uri: vscode.Uri.file('/test/file.ts') },
            ])

            const structuredMentions = toStructuredMentions(mentions)
            const result = await contextRetriever.retrieveContext(
                structuredMentions,
                inputText,
                mockSpan
            )

            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                type: 'file',
                content: 'Test content',
                uri: vscode.Uri.file('/test/file.ts'),
            })
        })
    })

    describe('_retrieveContext', () => {
        it('retrieves context from local and remote sources', async () => {
            const roots: Root[] = [
                {
                    local: vscode.Uri.file('/local/repo'),
                    remoteRepos: [{ name: 'test/repo', id: 'repo1' }],
                },
            ]
            const query = ps`Test query`
            const mockSpan = {} as any

            vi.spyOn(contextRetriever as any, 'retrieveLiveContext').mockResolvedValue([
                { type: 'file', content: 'Live content', uri: vscode.Uri.file('/local/repo/file.ts') },
            ])
            vi.spyOn(contextRetriever as any, 'retrieveIndexedContext').mockResolvedValue([
                {
                    type: 'file',
                    content: 'Indexed content',
                    uri: vscode.Uri.parse('https://example.com/file.ts'),
                },
            ])

            const result = await (contextRetriever as any)._retrieveContext(roots, query, mockSpan)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                type: 'file',
                content: 'Live content',
                uri: vscode.Uri.file('/local/repo/file.ts'),
            })
            expect(result[1]).toEqual({
                type: 'file',
                content: 'Indexed content',
                uri: vscode.Uri.parse('https://example.com/file.ts'),
            })
        })
    })

    describe('retrieveLiveContext', () => {
        it('calls getLiveResults with the original query', async () => {
            const query = ps`Test query`
            const files = ['/local/repo/file.ts']

            vi.spyOn(mockSymf, 'getLiveResults').mockResolvedValue([])

            await (contextRetriever as any).retrieveLiveContext(query, files)

            expect(mockSymf.getLiveResults).toHaveBeenCalledWith(query, files, undefined)
        })

        it('retrieves live context using symf', async () => {
            const query = ps`Test query`
            const files = ['/local/repo/file.ts']

            vi.spyOn(mockSymf, 'getLiveResults').mockResolvedValue([
                {
                    file: vscode.Uri.file('/local/repo/file.ts'),
                    range: {
                        startByte: 0,
                        endByte: 0,
                        startPoint: { row: 0, col: 0 },
                        endPoint: { row: 5, col: 10 },
                    },
                },
            ] as Result[])

            vi.spyOn(mockEditor, 'getTextEditorContentForFile').mockResolvedValue('Test content')

            const result = await (contextRetriever as any).retrieveLiveContext(query, files)

            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                type: 'file',
                uri: vscode.Uri.file('/local/repo/file.ts'),
                range: new vscode.Range(0, 0, 5, 10),
                source: 'search',
                content: 'Test content',
                metadata: ['source:symf-live'],
            })
        })
    })

    describe('retrieveIndexedContext', () => {
        it('calls retrieveIndexedContextFromRemote with the original query', async () => {
            const roots: Root[] = [
                {
                    remoteRepos: [{ name: 'test/repo', id: 'repo1' }],
                },
            ]
            const query = ps`Test query`
            const mockSpan = {} as any

            const spy = vi
                .spyOn(contextRetriever as any, 'retrieveIndexedContextFromRemote')
                .mockResolvedValue([])
            vi.spyOn(contextRetriever as any, 'retrieveIndexedContextLocally').mockResolvedValue([])

            await (contextRetriever as any).retrieveIndexedContext(roots, query, mockSpan)

            expect(spy).toHaveBeenCalledWith(['repo1'], query.toString(), undefined)
        })

        it('calls retrieveIndexedContextLocally with the original query', async () => {
            const roots: Root[] = [
                {
                    local: vscode.Uri.file('/local/repo'),
                    remoteRepos: [],
                },
            ]
            const query = ps`Test query`
            const mockSpan = {} as any

            vi.spyOn(contextRetriever as any, 'retrieveIndexedContextFromRemote').mockResolvedValue([])
            const spy = vi
                .spyOn(contextRetriever as any, 'retrieveIndexedContextLocally')
                .mockResolvedValue([])

            await (contextRetriever as any).retrieveIndexedContext(roots, query, mockSpan)

            expect(spy).toBeCalled()
        })

        it('retrieves indexed context from remote and local sources', async () => {
            const roots: Root[] = [
                {
                    local: vscode.Uri.file('/local/repo'),
                    remoteRepos: [{ name: 'test/repo', id: 'repo1' }],
                },
            ]
            const query = ps`Test query`
            const mockSpan = {} as any

            vi.spyOn(contextRetriever as any, 'retrieveIndexedContextFromRemote').mockResolvedValue([
                {
                    type: 'file',
                    content: 'Remote content',
                    uri: vscode.Uri.parse('https://example.com/file.ts'),
                },
            ])
            vi.spyOn(contextRetriever as any, 'retrieveIndexedContextLocally').mockResolvedValue([
                { type: 'file', content: 'Local content', uri: vscode.Uri.file('/local/repo/file.ts') },
            ])

            const result = await (contextRetriever as any).retrieveIndexedContext(roots, query, mockSpan)

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                type: 'file',
                content: 'Remote content',
                uri: vscode.Uri.parse('https://example.com/file.ts'),
            })
            expect(result[1]).toEqual({
                type: 'file',
                content: 'Local content',
                uri: vscode.Uri.file('/local/repo/file.ts'),
            })
        })
    })
})

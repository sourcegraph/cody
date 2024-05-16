import { describe, expect, it, vi } from 'vitest'
import * as vscode from '../../testutils/mocks'
import * as lspCommands from './lsp-commands'
import { getSymbolContextSnippets } from './symbol-context-snippets'

vi.mock('./lsp-commands')

describe('getSymbolContextSnippets', () => {
    it('should return the expected symbol context snippets', async () => {
        const getDefinitionLocations = vi
            .spyOn(lspCommands, 'getDefinitionLocations')
            .mockResolvedValue([
                new vscode.Location(vscode.Uri.file('/path/to/file1.ts'), new vscode.Range(1, 0, 1, 10)),
            ])

        const getHover = vi
            .spyOn(lspCommands, 'getHover')
            .mockResolvedValue([{ contents: ['Symbol definition'] }])

        vi.spyOn(lspCommands, 'getImplementationLocations').mockResolvedValue([])

        const getTextFromLocation = vi
            .spyOn(lspCommands, 'getTextFromLocation')
            .mockResolvedValue('const symbol = 42;')

        vi.spyOn(lspCommands, 'getTypeDefinitionLocations').mockResolvedValue([])

        // Prepare the symbol snippet requests
        const request = {
            symbolName: 'symbol',
            uri: vscode.Uri.file('/path/to/file1.ts'),
            position: new vscode.Position(0, 0),
            nodeType: 'variable',
            languageId: 'typescript',
        }
        const symbolSnippetRequests = [request]

        // Call the function with the prepared requests and a mock AbortSignal
        const abortSignal = new AbortController().signal
        const snippets = await getSymbolContextSnippets({
            symbolsSnippetRequests: symbolSnippetRequests,
            abortSignal,
            recursionLimit: 3,
        })

        // Assert the returned symbol context snippets
        expect(snippets[0]).toMatchObject({
            key: expect.any(String),
            symbol: 'symbol',
            uri: request.uri,
            startLine: 1,
            endLine: 1,
            content: 'const symbol = 42;',
            location: expect.anything(),
        })

        // Assert that the mocked functions were called with the expected arguments
        expect(getDefinitionLocations).toHaveBeenCalledWith(request.uri, new vscode.Position(0, 0))
        expect(getHover).toHaveBeenCalledWith(request.uri, new vscode.Position(1, 0))
        expect(getTextFromLocation).toHaveBeenCalledWith(
            new vscode.Location(request.uri, new vscode.Range(1, 0, 1, 10))
        )
    })

    it('should return the expected symbol context snippets', async () => {
        const getDefinitionLocations = vi
            .spyOn(lspCommands, 'getDefinitionLocations')
            .mockResolvedValue([
                new vscode.Location(vscode.Uri.file('/path/to/file1.ts'), new vscode.Range(1, 0, 1, 10)),
            ])

        const getHover = vi
            .spyOn(lspCommands, 'getHover')
            .mockResolvedValue([{ contents: ['Symbol definition'] }])

        vi.spyOn(lspCommands, 'getImplementationLocations').mockResolvedValue([])

        const getTextFromLocation = vi
            .spyOn(lspCommands, 'getTextFromLocation')
            .mockResolvedValue('const symbl = 42;')

        vi.spyOn(lspCommands, 'getTypeDefinitionLocations').mockResolvedValue([])

        // Prepare the symbol snippet requests
        const request = {
            symbolName: 'symbol',
            uri: vscode.Uri.file('/path/to/file1.ts'),
            position: new vscode.Position(0, 0),
            nodeType: 'variable',
            languageId: 'typescript',
        }
        const symbolSnippetRequests = [request]

        // Call the function with the prepared requests and a mock AbortSignal
        const abortSignal = new AbortController().signal
        const snippets = await getSymbolContextSnippets({
            symbolsSnippetRequests: symbolSnippetRequests,
            abortSignal,
            recursionLimit: 3,
        })

        // Assert the returned symbol context snippets
        expect(snippets[0]).toMatchObject({
            key: expect.any(String),
            symbol: 'symbol',
            uri: request.uri,
            startLine: 1,
            endLine: 1,
            content: 'const symbol = 42;',
            location: expect.anything(),
        })

        // Assert that the mocked functions were called with the expected arguments
        expect(getDefinitionLocations).toHaveBeenCalledWith(request.uri, new vscode.Position(0, 0))
        expect(getHover).toHaveBeenCalledWith(request.uri, new vscode.Position(1, 0))
        expect(getTextFromLocation).toHaveBeenCalledWith(
            new vscode.Location(request.uri, new vscode.Range(1, 0, 1, 10))
        )
    })
})

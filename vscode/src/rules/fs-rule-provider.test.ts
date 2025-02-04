import { type CandidateRule, firstValueFrom, uriBasename } from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'
import { createFileSystemRuleProvider } from './fs-rule-provider'

describe('createFileSystemRuleProvider', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.spyOn(vscode.workspace, 'onDidCreateFiles').mockReturnValue({ dispose() {} })
        vi.spyOn(vscode.workspace, 'onDidDeleteFiles').mockReturnValue({ dispose() {} })
        vi.spyOn(vscode.workspace, 'onDidChangeTextDocument').mockReturnValue({ dispose() {} })
        vi.spyOn(vscode.workspace, 'onDidChangeWorkspaceFolders').mockReturnValue({ dispose() {} })
    })

    it('should read and parse rule files from workspace directories', async () => {
        const mockWorkspaceFolder: vscode.WorkspaceFolder = {
            uri: URI.parse('file:///workspace'),
            name: 'workspace',
            index: 0,
        }
        const testFile = URI.parse('file:///workspace/src/test.ts')
        const ruleContent = Buffer.from('foo instruction')
        vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockReturnValue(mockWorkspaceFolder)
        vi.spyOn(vscode.workspace.fs, 'readDirectory').mockResolvedValue([
            ['foo.rule.md', vscode.FileType.File],
        ])
        vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(uri => {
            if (uri.toString() === 'file:///workspace/.sourcegraph/foo.rule.md') {
                return Promise.resolve(ruleContent)
            }
            throw new vscode.FileSystemError(uri)
        })

        const rules = await firstValueFrom(
            createFileSystemRuleProvider().candidateRulesForPaths([testFile])
        )
        expect(rules).toHaveLength(1)
        expect(rules[0]).toMatchObject<CandidateRule>({
            rule: {
                uri: 'file:///workspace/.sourcegraph/foo.rule.md',
                display_name: 'foo',
                instruction: 'foo instruction',
            },
            appliesToFiles: [testFile],
        })
        expect(vscode.workspace.fs.readDirectory).toHaveBeenCalled()
        expect(vscode.workspace.fs.readFile).toHaveBeenCalled()
    })

    it('handles multiple files', async () => {
        const mockWorkspaceFolders: vscode.WorkspaceFolder[] = [
            { uri: URI.parse('file:///w1'), name: 'w1', index: 0 },
            { uri: URI.parse('file:///w2'), name: 'w2', index: 1 },
        ]
        const testFiles = [
            URI.parse('file:///w1/src/testA.ts'),
            URI.parse('file:///w1/src/foo/bar/testB.ts'),
            URI.parse('file:///w2/src/testC.ts'),
        ]
        vi.spyOn(vscode.workspace, 'getWorkspaceFolder').mockImplementation(uri =>
            mockWorkspaceFolders.find(folder => uri.toString().startsWith(folder.uri.toString()))
        )
        vi.spyOn(vscode.workspace.fs, 'readDirectory').mockImplementation(uri => {
            const rulesByDir: Record<string, [string, vscode.FileType][]> = {
                'file:///w1/.sourcegraph': [['r0.rule.md', vscode.FileType.File]],
                'file:///w1/src/.sourcegraph': [['r1.rule.md', vscode.FileType.File]],
                'file:///w1/src/foo/.sourcegraph': [['r2.rule.md', vscode.FileType.File]],
                'file:///w2/.sourcegraph': [['r3.rule.md', vscode.FileType.File]],
            }
            return Promise.resolve(rulesByDir[uri.toString()] || [])
        })
        vi.spyOn(vscode.workspace.fs, 'readFile').mockImplementation(uri => {
            return Promise.resolve(Buffer.from('instruction ' + uriBasename(uri)))
        })

        const rules = await firstValueFrom(
            createFileSystemRuleProvider().candidateRulesForPaths(testFiles)
        )
        expect(rules).toHaveLength(4)
        expect(rules[0]).toMatchObject<CandidateRule>({
            rule: {
                uri: 'file:///w1/src/.sourcegraph/r1.rule.md',
                display_name: 'src/r1',
                instruction: 'instruction r1.rule.md',
            },
            appliesToFiles: [testFiles[1], testFiles[0]],
        })
        expect(rules[1]).toMatchObject<CandidateRule>({
            rule: {
                uri: 'file:///w1/.sourcegraph/r0.rule.md',
                display_name: 'r0',
                instruction: 'instruction r0.rule.md',
            },
            appliesToFiles: [testFiles[1], testFiles[0]],
        })
        expect(rules[2]).toMatchObject<CandidateRule>({
            rule: {
                uri: 'file:///w1/src/foo/.sourcegraph/r2.rule.md',
                display_name: 'src/foo/r2',
                instruction: 'instruction r2.rule.md',
            },
            appliesToFiles: [testFiles[1]],
        })
        expect(rules[3]).toMatchObject<CandidateRule>({
            rule: {
                uri: 'file:///w2/.sourcegraph/r3.rule.md',
                display_name: 'r3',
                instruction: 'instruction r3.rule.md',
            },
            appliesToFiles: [testFiles[2]],
        })
        expect(vscode.workspace.fs.readDirectory).toHaveBeenCalled()
        expect(vscode.workspace.fs.readFile).toHaveBeenCalled()
    })

    it('should not search for rules outside workspace', async () => {
        const testFile = URI.parse('file:///outside/workspace/test.ts')
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined)

        expect(
            await firstValueFrom(createFileSystemRuleProvider().candidateRulesForPaths([testFile]))
        ).toHaveLength(0)
        expect(vscode.workspace.fs.readDirectory).not.toHaveBeenCalled()
    })

    it('should handle filesystem errors gracefully', async () => {
        const mockWorkspaceFolder: vscode.WorkspaceFolder = {
            uri: URI.parse('file:///workspace'),
            name: 'workspace',
            index: 0,
        }
        const testFile = URI.parse('file:///workspace/src/test.ts')
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(mockWorkspaceFolder)
        vi.mocked(vscode.workspace.fs.readDirectory).mockImplementation(uri => {
            throw new vscode.FileSystemError(uri)
        })

        expect(
            await firstValueFrom(createFileSystemRuleProvider().candidateRulesForPaths([testFile]))
        ).toHaveLength(0)
    })
})

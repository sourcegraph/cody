import * as assert from 'node:assert'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { findWorkspaceFiles } from '../../../src/editor/utils/findWorkspaceFiles'

suite('findWorkspaceFiles Integration Tests', () => {
    test('finds files across all workspace folders', async () => {
        const files = await findWorkspaceFiles()

        // Should return an array of URIs
        assert.ok(Array.isArray(files))
        assert.ok(files.length > 0)

        // All results should be URIs
        for (const file of files) {
            assert.ok(file instanceof vscode.Uri)
        }
    })

    test('finds files from both workspace folders', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        const workspaceFolders = vscode.workspace.workspaceFolders!
        assert.ok(workspaceFolders.length >= 2, 'Should have at least 2 workspace folders')

        const workspace1Path = workspaceFolders[0].uri.fsPath
        const workspace2Path = workspaceFolders[1].uri.fsPath

        // Should have files from both workspace folders
        const filesFromWorkspace1 = filePaths.filter(p => p.startsWith(workspace1Path))
        const filesFromWorkspace2 = filePaths.filter(p => p.startsWith(workspace2Path))

        assert.ok(filesFromWorkspace1.length > 0, 'Should have files from workspace1')
        assert.ok(filesFromWorkspace2.length > 0, 'Should have files from workspace2')
    })

    test('finds Main.java files from both workspaces', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        // Should find Main.java from both workspace folders
        const mainJavaFiles = filePaths.filter(p => p.endsWith('Main.java'))
        assert.strictEqual(mainJavaFiles.length, 2, 'Should find exactly 2 Main.java files')

        // Verify they are from different workspaces
        const workspaceFolders = vscode.workspace.workspaceFolders!
        const workspace1Path = workspaceFolders[0].uri.fsPath
        const workspace2Path = workspaceFolders[1].uri.fsPath

        const mainFromWorkspace1 = mainJavaFiles.some(p => p.startsWith(workspace1Path))
        const mainFromWorkspace2 = mainJavaFiles.some(p => p.startsWith(workspace2Path))

        assert.ok(mainFromWorkspace1, 'Should find Main.java from workspace1')
        assert.ok(mainFromWorkspace2, 'Should find Main.java from workspace2')
    })

    test('finds README.md from workspace2', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        const readmeFiles = filePaths.filter(p => p.endsWith('README.md'))
        assert.equal(readmeFiles.length, 1, 'Should find at least one README.md')

        const workspace2Path = vscode.workspace.workspaceFolders![1].uri.fsPath

        assert.ok(
            readmeFiles.some(p => p.startsWith(workspace2Path)),
            'Should find README.md from  workspace2'
        )
    })

    test('does not return duplicate files', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.toString())
        const uniquePaths = new Set(filePaths)

        assert.strictEqual(filePaths.length, uniquePaths.size, 'Should not have duplicate files')
    })

    test('respects gitignore patterns from workspace folders', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        // Based on workspace/.gitignore which excludes .vscode and *.cody.html
        const hasVscodeFolder = filePaths.some(p => p.includes('.vscode'))
        const hasCodyHtmlFiles = filePaths.some(p => p.endsWith('.cody.html'))

        // These should be excluded by gitignore
        assert.strictEqual(hasVscodeFolder, false, '.vscode folders should be excluded by gitignore')
        assert.strictEqual(hasCodyHtmlFiles, false, '*.cody.html files should be excluded by gitignore')
    })

    test('excludes files based on workspace configuration', async () => {
        // Get current exclude configuration
        const config = vscode.workspace.getConfiguration('')
        const filesExclude = config.get<Record<string, boolean>>('files.exclude', {})

        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        // Check that excluded patterns are not present
        for (const [pattern, excluded] of Object.entries(filesExclude)) {
            if (excluded && pattern.includes('node_modules')) {
                const hasNodeModulesFiles = filePaths.some(p => p.includes('node_modules'))
                assert.strictEqual(hasNodeModulesFiles, false, 'node_modules should be excluded')
                break
            }
        }
    })

    test('finds common file types', async () => {
        const files = await findWorkspaceFiles()
        const extensions = files.map(uri => {
            const path = uri.fsPath
            const lastDot = path.lastIndexOf('.')
            return lastDot > 0 ? path.substring(lastDot).toLowerCase() : ''
        })

        // Should find various file types commonly present in workspaces
        const commonExtensions = ['.java', '.ts', '.md']
        const foundExtensions = commonExtensions.filter(ext => extensions.includes(ext))

        assert.ok(foundExtensions.length > 0, 'Should find common file types')
        assert.ok(foundExtensions.includes('.java'), 'Should find .java files')
        assert.ok(foundExtensions.includes('.md'), 'Should find .md files')
    })

    test('handles files with same names in different workspaces', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        // Both workspace and workspace2 have duplicate-test.txt files
        const duplicateTestFiles = filePaths.filter(p => p.endsWith('duplicate-test.txt'))

        // Should find both files (they're in different directories, so not actual duplicates)
        assert.ok(
            duplicateTestFiles.length >= 2,
            'Should find duplicate-test.txt from multiple workspaces'
        )

        // Verify they're from different directories
        const uniqueDirs = new Set(duplicateTestFiles.map(p => path.dirname(p)))
        assert.ok(uniqueDirs.size >= 2, 'duplicate-test.txt files should be in different directories')
    })
})

import * as assert from 'node:assert'
import * as vscode from 'vscode'
import { findWorkspaceFiles } from '../../../src/editor/utils/findWorkspaceFiles'

suite('findWorkspaceFiles with Nested Workspaces', () => {
    test('handles nested workspace folders without duplicates', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        // Verify no duplicate files exist
        const uniquePaths = new Set(filePaths)
        assert.strictEqual(filePaths.length, uniquePaths.size, 'Should not have duplicate files')

        // Log for debugging
        console.log(`Found ${files.length} files total`)
        console.log(`Unique files: ${uniquePaths.size}`)
    })

    test('finds files from all three workspace folders', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        const workspaceFolders = vscode.workspace.workspaceFolders!
        assert.strictEqual(workspaceFolders.length, 3, 'Should have exactly 3 workspace folders')

        const workspace1Path = workspaceFolders[0].uri.fsPath // workspace
        const workspace2Path = workspaceFolders[1].uri.fsPath // workspace2
        const subprojectPath = workspaceFolders[2].uri.fsPath // workspace2/subproject

        // Count files from each workspace
        const filesFromWorkspace1 = filePaths.filter(
            p => p.startsWith(workspace1Path) && !p.startsWith(workspace2Path)
        )
        const filesFromWorkspace2 = filePaths.filter(
            p => p.startsWith(workspace2Path) && !p.startsWith(subprojectPath)
        )
        const filesFromSubproject = filePaths.filter(p => p.startsWith(subprojectPath))

        assert.ok(filesFromWorkspace1.length > 0, 'Should have files from workspace1')
        assert.ok(
            filesFromWorkspace2.length > 0,
            'Should have files from workspace2 (excluding subproject)'
        )
        assert.ok(filesFromSubproject.length > 0, 'Should have files from subproject')

        console.log(`Files from workspace1: ${filesFromWorkspace1.length}`)
        console.log(`Files from workspace2 (excluding subproject): ${filesFromWorkspace2.length}`)
        console.log(`Files from subproject: ${filesFromSubproject.length}`)
    })

    test('finds specific files without duplication', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        // Should find Main.java files from workspace1 and workspace2, but not duplicated
        const mainJavaFiles = filePaths.filter(p => p.endsWith('Main.java'))
        assert.strictEqual(mainJavaFiles.length, 2, 'Should find exactly 2 Main.java files')

        // Should find Sub.java from subproject only once
        const subJavaFiles = filePaths.filter(p => p.endsWith('Sub.java'))
        assert.strictEqual(subJavaFiles.length, 1, 'Should find exactly 1 Sub.java file')

        // Should find README.md from workspace2 only once (not duplicated from parent workspace)
        const readmeFiles = filePaths.filter(p => p.endsWith('README.md'))
        const workspace2ReadmeFiles = readmeFiles.filter(
            p => p.includes('workspace2') && !p.includes('subproject')
        )
        assert.strictEqual(
            workspace2ReadmeFiles.length,
            1,
            'Should find exactly 1 README.md from workspace2'
        )

        // Should find subproject.md from subproject only once
        const subprojectMdFiles = filePaths.filter(p => p.endsWith('subproject.md'))
        assert.strictEqual(subprojectMdFiles.length, 1, 'Should find exactly 1 subproject.md file')
    })

    test('respects gitignore from both parent and nested workspaces', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        // Should respect .gitignore from workspace2/subproject (excludes *.temp and build/)
        const tempFiles = filePaths.filter(p => p.endsWith('.temp'))
        const buildDirs = filePaths.filter(p => p.includes('/build/'))

        assert.strictEqual(
            tempFiles.length,
            0,
            '*.temp files should be excluded by subproject gitignore'
        )
        assert.strictEqual(
            buildDirs.length,
            0,
            'build/ directories should be excluded by subproject gitignore'
        )

        // Should also respect parent workspace gitignore (excludes .vscode and *.cody.html)
        const vscodeFiles = filePaths.filter(p => p.includes('.vscode'))
        const codyHtmlFiles = filePaths.filter(p => p.endsWith('.cody.html'))

        assert.strictEqual(vscodeFiles.length, 0, '.vscode should be excluded by parent gitignore')
        assert.strictEqual(codyHtmlFiles.length, 0, '*.cody.html should be excluded by parent gitignore')
    })

    test('workspace folder precedence - subproject takes priority over parent', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        const workspaceFolders = vscode.workspace.workspaceFolders!
        const subprojectPath = workspaceFolders[2].uri.fsPath // workspace2/subproject

        // Files in the subproject directory should be attributed to the subproject workspace folder
        // This tests that VS Code properly handles the precedence when folders overlap
        const subprojectFiles = filePaths.filter(p => p.startsWith(subprojectPath))

        // Verify subproject files exist
        assert.ok(subprojectFiles.length > 0, 'Should find files in subproject')

        // All subproject files should have the subproject path as their workspace root
        const hasSubJava = subprojectFiles.some(p => p.endsWith('Sub.java'))
        const hasSubprojectMd = subprojectFiles.some(p => p.endsWith('subproject.md'))

        assert.ok(hasSubJava, 'Should find Sub.java in subproject files')
        assert.ok(hasSubprojectMd, 'Should find subproject.md in subproject files')
    })

    test('verifies no duplicated files appear in multiple workspace contexts', async () => {
        const files = await findWorkspaceFiles()
        const filePathsSet = new Set<string>()
        const duplicates: string[] = []

        // Check for any duplicate file paths
        for (const file of files) {
            const filePath = file.fsPath
            if (filePathsSet.has(filePath)) {
                duplicates.push(filePath)
            } else {
                filePathsSet.add(filePath)
            }
        }

        assert.strictEqual(duplicates.length, 0, `Found duplicate files: ${duplicates.join(', ')}`)
    })

    test('correct file counts for nested workspace scenario', async () => {
        const files = await findWorkspaceFiles()
        const filePaths = files.map(uri => uri.fsPath)

        // Count specific file types to ensure we're getting the expected results
        const javaFiles = filePaths.filter(p => p.endsWith('.java'))
        const mdFiles = filePaths.filter(p => p.endsWith('.md'))

        // We should have:
        // - 3 Java files: Main.java (workspace), Main.java (workspace2), Sub.java (subproject)
        // - At least 2 MD files: README.md (workspace2), subproject.md (subproject)
        // - Gitignore files should be excluded from results (they're not typically included in file searches)

        assert.ok(javaFiles.length >= 3, `Should find at least 3 Java files, found ${javaFiles.length}`)
        assert.ok(mdFiles.length >= 2, `Should find at least 2 MD files, found ${mdFiles.length}`)

        console.log(`Java files found: ${javaFiles.length}`)
        console.log(`MD files found: ${mdFiles.length}`)
        console.log(`Total files found: ${files.length}`)
    })
})

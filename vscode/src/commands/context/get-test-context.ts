import { type ContextFile, MAX_CURRENT_FILE_TOKENS, truncateText } from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import { decodeVSCodeTextDoc, findVSCodeFiles } from '../../editor-context/helpers'
import path from 'path'
import { type URI, Utils } from 'vscode-uri'
import { isValidTestFile } from '../prompt/utils'

export async function getContextFilesForTests(currentFile: vscode.Uri): Promise<ContextFile[]> {
    const contextFiles: ContextFile[] = []

    // Get context from test files in current directory
    contextFiles.push(...(await getTestFilesInCurrentDirContext(currentFile)))

    if (!contextFiles.length) {
        const codebaseFiles = await getCodebaseTestFilesContext(currentFile)
        contextFiles.push(...codebaseFiles)
    }

    return contextFiles
}

async function getTestFilesInCurrentDirContext(currentFile: vscode.Uri): Promise<ContextFile[]> {
    const contextFiles: ContextFile[] = []

    const currentDir = Utils.joinPath(currentFile, '..')
    const fileNameWithoutExt = path.posix.parse(currentFile.toString()).name
    const filesInDir = await vscode.workspace.fs.readDirectory(currentDir)
    // Filter out directories, non-test files, and dot files
    const filteredFiles = filesInDir.filter(([fileName, fileType]) => {
        const isDirectory = fileType === vscode.FileType.Directory
        const isHiddenFile = fileName.startsWith('.')

        const isTestFile = isValidTestFile(Utils.joinPath(currentDir, fileName))
        return !isDirectory && !isHiddenFile && isTestFile
    })

    for (const file of filteredFiles) {
        // Get the context from each file
        const fileUri = vscode.Uri.joinPath(currentFile, '..', file[0])

        // check file size before opening the file
        // skip file if it's larger than 1MB
        const fileSize = await vscode.workspace.fs.stat(fileUri)
        if (fileSize.size > 1000000 || !fileSize.size) {
            continue
        }

        // skip current file to avoid duplicate from current file context
        if (file[0] === currentFile.path) {
            continue
        }

        try {
            const contextFile = await createContextFile(fileUri)
            if (contextFile) {
                contextFiles.push(contextFile)
            }

            // return context directly if the file name matches the current file name
            if (file[0].startsWith(fileNameWithoutExt) || file[0].endsWith(fileNameWithoutExt)) {
                return contextFiles
            }

            // each file contains 2 message-pair, e.g. 5 files = 10 messages
            const maxFiles = 3
            if (contextFiles.length >= maxFiles) {
                return contextFiles
            }
        } catch (error) {
            console.error(error)
        }
    }

    return contextFiles
}

async function getCodebaseTestFilesContext(file: vscode.Uri): Promise<ContextFile[]> {
    // exclude any files in the path with e2e or integration in the directory name
    const excludePattern = '**/*{e2e,integration,node_modules}*/**'

    const testFilesPattern = createVSCodeTestSearchPattern(file, true)
    const testFilesMatches = await findVSCodeFiles(testFilesPattern, excludePattern, 5)

    const contextFiles: ContextFile[] = []
    const filteredTestFiles = testFilesMatches.filter(uri => isValidTestFile(uri))

    for (const testFile of filteredTestFiles) {
        const contextFile = await createContextFile(testFile)
        if (contextFile) {
            contextFiles.push(contextFile)
        }
    }

    return contextFiles
}

function createVSCodeTestSearchPattern(file: vscode.Uri, allTestFiles?: boolean): string {
    const fileExtension = path.posix.parse(file.toString()).ext
    const basenameWithoutExt = path.posix.parse(file.toString()).name

    const root = '**'
    const defaultTestFilePattern = `/*test*${fileExtension}`
    const currentTestFilePattern = `/*{test_${basenameWithoutExt},${basenameWithoutExt}_test,test.${basenameWithoutExt},${basenameWithoutExt}.test,${basenameWithoutExt}Test,spec_${basenameWithoutExt},${basenameWithoutExt}_spec,spec.${basenameWithoutExt},${basenameWithoutExt}.spec,${basenameWithoutExt}Spec}${fileExtension}`

    if (allTestFiles) {
        return `${root}${defaultTestFilePattern}`
    }

    // pattern to search for test files with the same name as current file
    return `${root}${currentTestFilePattern}`
}

async function createContextFile(file: URI): Promise<ContextFile | undefined> {
    try {
        const decoded = await decodeVSCodeTextDoc(file)
        const truncatedContent = truncateText(decoded, MAX_CURRENT_FILE_TOKENS)
        // From line 0 to the end of truncatedContent
        const range = new vscode.Range(0, 0, truncatedContent.split('\n').length, 0)

        return {
            type: 'file',
            uri: file,
            content: truncatedContent,
            source: 'editor',
            range,
        } as ContextFile
    } catch (error) {
        console.error(error)
    }
    return undefined
}

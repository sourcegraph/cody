import { execSync } from 'node:child_process'
import * as fspromises from 'node:fs/promises'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { isSupportedLanguage } from '../../../../vscode/src/tree-sitter/grammars'
import { getLanguageForFileName } from '../../language'
import type { EvaluationDocument } from './EvaluationDocument'
import { Queries } from './Queries'
import { SnapshotWriter } from './SnapshotWriter'
import type { EvaluateAutocompleteOptions } from './cody-bench'
import { matchesGlobPatterns } from './matchesGlobPatterns'
import { testCleanup, testInstall } from './testTypecheck'

export interface EvaluateFileParams {
    file: string
    content: string
    uri: vscode.Uri
    languageid: string
    revision: string
    queries: Queries
    grammarDirectory: string
}

export async function evaluateEachFile(
    options: EvaluateAutocompleteOptions,
    handler: (params: EvaluateFileParams) => Promise<EvaluationDocument | undefined>
): Promise<void> {
    const { workspace } = options
    const queries = new Queries(options.queriesDirectory)
    const grammarDirectory = path.normalize(options.treeSitterGrammars)
    const files = execSync('git ls-files', { cwd: workspace }).toString().split('\n')
    files.sort()
    const snapshots = new SnapshotWriter(options)
    await testInstall(options)
    try {
        await snapshots.writeHeader()

        const revision = execSync('git rev-parse HEAD', { cwd: workspace }).toString().trim()

        for (const file of files) {
            if (
                !matchesGlobPatterns(options.includeFilepath ?? [], options.excludeFilepath ?? [], file)
            ) {
                continue
            }
            const filePath = path.join(workspace, file)
            const uri = vscode.Uri.file(filePath)
            const stat = await fspromises.stat(filePath)
            if (!stat.isFile()) {
                continue
            }
            const content = (await fspromises.readFile(filePath)).toString()
            const languageid = getLanguageForFileName(file)
            if (!isSupportedLanguage(languageid)) {
                continue
            }
            if (
                !matchesGlobPatterns(
                    options.includeLanguage ?? [],
                    options.excludeLanguage ?? [],
                    languageid
                )
            ) {
                continue
            }
            const document = await handler({
                file,
                content,
                uri,
                languageid,
                revision,
                queries,
                grammarDirectory,
            })
            if (document) {
                snapshots.writeDocument(document)
            }
        }
    } finally {
        await testCleanup(options)
    }
}

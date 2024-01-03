import { execSync } from 'child_process'
import * as fspromises from 'fs/promises'
import * as path from 'path'

import * as vscode from 'vscode'

import { getParseLanguage } from '../../../../vscode/src/tree-sitter/grammars'
import { createParser } from '../../../../vscode/src/tree-sitter/parser'
import { MessageHandler } from '../../jsonrpc-alias'
import { getLanguageForFileName } from '../../language'

import { EvaluateAutocompleteOptions } from './evaluate-autocomplete'
import { EvaluationDocument } from './EvaluationDocument'
import { matchesGlobPatterns } from './matchesGlobPatterns'
import { Queries } from './Queries'
import { SnapshotWriter } from './SnapshotWriter'
import { testCleanup, testInstall } from './testTypecheck'
import { triggerAutocomplete } from './triggerAutocomplete'

/**
 * Runs autocomplete evaluation. The current logic is specifically optimized
 * to evaluate BFG.  The best way to customize the logic is by changing the
 * code. Eventually, we could make the logic configurable via command-line
 * flags so that we can reuse this command for different kinds of evaluations.
 */
export async function evaluateBfgStrategy(client: MessageHandler, options: EvaluateAutocompleteOptions): Promise<void> {
    const { workspace } = options
    const queries = new Queries(options.queriesDirectory)
    const grammarDirectory = path.normalize(options.treeSitterGrammars)
    const files = execSync('git ls-files', { cwd: workspace }).toString().split('\n')
    files.sort()
    let remainingTests = options.testCount
    const snapshots = new SnapshotWriter(options)
    await testInstall(options)
    try {
        await snapshots.writeHeader()

        const revision = execSync('git rev-parse HEAD', { cwd: workspace }).toString().trim()

        for (const file of files) {
            if (!matchesGlobPatterns(options.includeFilepath ?? [], options.excludeFilepath ?? [], file)) {
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
            const language = getParseLanguage(languageid)
            if (!language) {
                continue
            }
            if (!matchesGlobPatterns(options.includeLanguage ?? [], options.excludeLanguage ?? [], languageid)) {
                continue
            }
            client.notify('textDocument/didOpen', { uri: uri.toString(), content })
            const parser = await createParser({ language, grammarDirectory })
            const originalTree = parser.parse(content)
            const originalTreeIsErrorFree = !originalTree.rootNode.hasError()
            const query = await queries.loadQuery(parser, language, 'context')
            if (!query) {
                continue
            }
            const documentTestCountStart = remainingTests

            const document = new EvaluationDocument(
                {
                    languageid,
                    filepath: file,
                    strategy: options.fixture.strategy,
                    fixture: options.fixture.name,
                    workspace: path.basename(options.workspace),
                    revision,
                },
                content,
                uri
            )
            for (const match of query.matches(originalTree.rootNode)) {
                if (documentTestCountStart - remainingTests > options.maxFileTestCount) {
                    console.log(`--max-file-test-count=${options.maxFileTestCount} limit hit for file '${file}'`)
                    break
                }
                if (remainingTests <= 0) {
                    break
                }
                for (const capture of match.captures) {
                    if (remainingTests <= 0) {
                        break
                    }
                    if (capture.name !== 'range') {
                        continue
                    }
                    // Modify the content by replacing the argument list to the call expression
                    // with an empty argument list. This evaluation is interesting because it
                    // allows us to test how good Cody is at inferring the original argument
                    // list.

                    const isArgumentList =
                        content.slice(capture.node.startIndex, capture.node.startIndex + 1) === '(' &&
                        content.slice(capture.node.endIndex - 1, capture.node.endIndex) === ')'
                    const range = isArgumentList
                        ? new vscode.Range(
                              new vscode.Position(
                                  capture.node.startPosition.row,
                                  capture.node.startPosition.column + 1
                              ),
                              new vscode.Position(capture.node.endPosition.row, capture.node.endPosition.column - 1)
                          )
                        : new vscode.Range(
                              new vscode.Position(capture.node.startPosition.row, capture.node.startPosition.column),
                              new vscode.Position(capture.node.endPosition.row, capture.node.endPosition.column)
                          )

                    const modifiedContent = [
                        document.textDocument.getText(new vscode.Range(new vscode.Position(0, 0), range.start)),
                        document.textDocument.getText(
                            new vscode.Range(range.end, new vscode.Position(document.textDocument.lineCount, 0))
                        ),
                    ].join('')
                    const removedContent = document.textDocument.getText(range)
                    const position = new vscode.Position(
                        capture.node.startPosition.row,
                        capture.node.startPosition.column + 1
                    )
                    await triggerAutocomplete({
                        parser,
                        originalTree,
                        originalTreeIsErrorFree,
                        range,
                        client,
                        document,
                        options,
                        emptyMatchContent: isArgumentList ? '()' : '',
                        modifiedContent,
                        removedContent,
                        position,
                    })
                    remainingTests--
                }
            }

            await snapshots.writeDocument(document)
        }
    } finally {
        await testCleanup(options)
    }
}

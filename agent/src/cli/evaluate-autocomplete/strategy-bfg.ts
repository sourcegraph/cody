import { execSync } from 'child_process'
import * as fspromises from 'fs/promises'
import * as path from 'path'

import { createObjectCsvWriter } from 'csv-writer'
import { CsvWriter } from 'csv-writer/src/lib/csv-writer'
import { rimraf } from 'rimraf'
import * as vscode from 'vscode'

import { getParseLanguage } from '../../../../vscode/src/tree-sitter/grammars'
import { createParser } from '../../../../vscode/src/tree-sitter/parser'
import { MessageHandler } from '../../jsonrpc-alias'
import { getLanguageForFileName } from '../../language'

import { AutocompleteDocument, autocompleteItemHeaders } from './AutocompleteDocument'
import { EvaluateAutocompleteOptions, matchesGlobPatterns } from './evaluate-autocomplete'
import { Queries } from './Queries'
import { triggerAutocomplete } from './triggerAutocomplete'

/**
 * Runs autocomplete evaluation. The current logic is specifically optimized
 * to evaluate BFG.  The best way to customize the logic is by changing the
 * code. Eventually, we could make the logic configurable via command-line
 * flags so that we can reuse this command for different kinds of evaluations.
 */
export async function evaluateBfgStrategy(
    client: MessageHandler,
    options: EvaluateAutocompleteOptions,
    workspace: string
): Promise<void> {
    const queries = new Queries(options.queriesDirectory)
    const grammarDirectory = path.normalize(options.treeSitterGrammars)
    const files = execSync('git ls-files', { cwd: workspace }).toString().split('\n')
    files.sort()
    let remainingTests = options.testCount
    let csvWriter: CsvWriter<any> | undefined
    if (options.snapshotDirectory) {
        await rimraf(options.snapshotDirectory)
        await fspromises.mkdir(options.snapshotDirectory, { recursive: true })
        if (options.csvPath) {
            csvWriter = createObjectCsvWriter({
                header: autocompleteItemHeaders,
                path: options.csvPath,
            })
        }
    }
    for (const file of files) {
        if (!matchesGlobPatterns(options.includeFilepath ?? [], options.excludeFilepath ?? [], file)) {
            continue
        }
        const filePath = path.join(workspace, file)
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
        client.notify('textDocument/didOpen', { filePath, content })
        const parser = await createParser({ language, grammarDirectory })
        const tree = parser.parse(content)
        const query = await queries.loadQuery(parser, language, 'context')
        if (!query) {
            continue
        }

        const document = new AutocompleteDocument(
            {
                languageid,
                filepath: file,
                strategy: options.fixture.strategy,
                fixture: options.fixture.name,
                workspace: path.basename(options.workspace),
            },
            content
        )
        for (const match of query.matches(tree.rootNode)) {
            if (remainingTests <= 0) {
                break
            }
            for (const capture of match.captures) {
                if (remainingTests <= 0) {
                    break
                }
                if (capture.name === 'range') {
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
                        range,
                        client,
                        document,
                        emptyMatchContent: isArgumentList ? '()' : '',
                        modifiedContent,
                        removedContent,
                        position,
                    })
                    remainingTests--
                }
            }
        }

        if (options.snapshotDirectory && document.items.length > 0) {
            document.writeSnapshot(options.snapshotDirectory)
            if (csvWriter) {
                csvWriter.writeRecords(document.items)
            }
        }
    }
}

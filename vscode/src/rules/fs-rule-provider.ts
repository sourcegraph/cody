import {
    type CandidateRule,
    type RuleProvider,
    abortableOperation,
    debounceTime,
    defer,
    fromVSCodeEvent,
    isRuleFilename,
    logDebug,
    merge,
    parseRuleFile,
    pathFunctionsForURI,
    ruleSearchPaths,
    startWith,
} from '@sourcegraph/cody-shared'
import { type Observable, filter } from 'observable-fns'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

function isRuleFile(uri: URI): boolean {
    return uri.path.endsWith('.rule.md')
}

/**
 * An Observable that fires when the user interactively creates, edits, or deletes a
 * `.sourcegraph/*.rule.md` file.
 */
const ruleFileInteractiveChanges: Observable<void> = defer(() =>
    merge(
        merge(
            fromVSCodeEvent(vscode.workspace.onDidCreateFiles),
            fromVSCodeEvent(vscode.workspace.onDidDeleteFiles)
        ).pipe(filter(e => e.files.some(isRuleFile))),
        fromVSCodeEvent(vscode.workspace.onDidChangeTextDocument).pipe(
            filter(e => isRuleFile(e.document.uri))
        )
    ).pipe(debounceTime(1000))
)

const workspaceFoldersChanges: Observable<unknown> = defer(() =>
    fromVSCodeEvent(vscode.workspace.onDidChangeWorkspaceFolders)
)

/**
 * A {@link RuleProvider} that searches the file system (using the VS Code file system API).
 */
export function createFileSystemRuleProvider(): RuleProvider {
    return {
        candidateRulesForPaths(files: URI[]): Observable<CandidateRule[]> {
            const searchPathsForFiles = new Map<
                string /* searchPath */,
                URI[] /* applies to resources */
            >()
            return merge(ruleFileInteractiveChanges, workspaceFoldersChanges).pipe(
                startWith(undefined),
                abortableOperation(async (_, signal) => {
                    for (const uri of files) {
                        // Do not search for rules outside of a workspace folder.
                        const root = vscode.workspace.getWorkspaceFolder(uri)
                        if (!root) {
                            continue
                        }
                        const searchPaths = ruleSearchPaths(uri, root.uri)
                        for (const searchPath of searchPaths) {
                            const appliesToResources =
                                searchPathsForFiles.get(searchPath.toString()) ?? []
                            appliesToResources.push(uri)
                            searchPathsForFiles.set(searchPath.toString(), appliesToResources)
                        }
                    }

                    const results = await Promise.all(
                        Array.from(searchPathsForFiles.entries()).map(
                            async ([searchPathStr, appliesToFiles]): Promise<CandidateRule[]> => {
                                appliesToFiles.sort()
                                const searchPath = URI.parse(searchPathStr)
                                const pathFuncs = pathFunctionsForURI(searchPath)
                                try {
                                    const entries = await vscode.workspace.fs.readDirectory(searchPath)
                                    signal?.throwIfAborted()

                                    const rootFolder = vscode.workspace.getWorkspaceFolder(searchPath)
                                    // There should always be a root since we checked it above, but
                                    // be defensive.
                                    if (!rootFolder) {
                                        return []
                                    }
                                    const root = rootFolder.uri

                                    const ruleFiles = entries.filter(([name]) => isRuleFilename(name))
                                    const rules = await Promise.all(
                                        ruleFiles.map(async ([name]) => {
                                            const ruleURI = searchPath.with({
                                                path: pathFuncs.resolve(searchPath.path, name),
                                            })
                                            const content = await vscode.workspace.fs.readFile(ruleURI)
                                            signal?.throwIfAborted()
                                            const rule = parseRuleFile(
                                                ruleURI,
                                                root,
                                                new TextDecoder().decode(content)
                                            )
                                            return {
                                                rule,
                                                appliesToFiles,
                                            } satisfies CandidateRule
                                        })
                                    )
                                    return rules
                                } catch (error) {
                                    if (
                                        !(
                                            error &&
                                            typeof error === 'object' &&
                                            'code' in error &&
                                            error.code === 'FileNotFound'
                                        )
                                    ) {
                                        logDebug(
                                            'rules',
                                            `Error reading rules for ${searchPath}: ${error}`
                                        )
                                    }
                                    return []
                                }
                            }
                        )
                    )
                    signal?.throwIfAborted()
                    return results.flat()
                })
            )
        },
    }
}

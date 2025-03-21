import {
    type CandidateRule,
    type RuleProvider,
    abortableOperation,
    debounceTime,
    defer,
    fromVSCodeEvent,
    isRuleFilename,
    merge,
    parseRuleFile,
    pathFunctionsForURI,
    ruleSearchPaths,
    shareReplay,
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
        ).pipe(
            filter(e => {
                try {
                    return e?.files?.some?.(isRuleFile) || false
                } catch {
                    return false
                }
            })
        ),
        fromVSCodeEvent(vscode.workspace.onDidChangeTextDocument).pipe(
            filter(e => {
                try {
                    return e?.document && isRuleFile(e.document.uri)
                } catch {
                    return false
                }
            })
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

            // Use shareReplay to ensure we don't create multiple subscriptions to the same source
            return merge(ruleFileInteractiveChanges, workspaceFoldersChanges).pipe(
                startWith(undefined),
                // Add debounce to reduce frequency of filesystem operations
                debounceTime(1000),
                abortableOperation(async (_, parentSignal) => {
                    try {
                        // Create a child controller that will be aborted when parent is aborted
                        const controller = new AbortController()
                        const signal = controller.signal

                        // Set up abort propagation with error handling
                        if (parentSignal) {
                            try {
                                // If parent is already aborted, abort child immediately
                                if (parentSignal.aborted) {
                                    controller.abort()
                                } else {
                                    // Otherwise, set up a listener to propagate abort
                                    const abortHandler = (): void => {
                                        try {
                                            parentSignal.removeEventListener('abort', abortHandler)
                                            controller.abort()
                                        } catch (error) {
                                            // Silently ignore abort errors
                                        }
                                    }
                                    parentSignal.addEventListener('abort', abortHandler)
                                }
                            } catch (error) {
                                // Silently ignore errors in abort handling
                            }
                        }

                        for (const uri of files) {
                            try {
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
                            } catch (error) {
                                // Continue with next URI if one fails
                            }
                        }

                        const results = await Promise.all(
                            Array.from(searchPathsForFiles.entries()).map(
                                async ([searchPathStr, appliesToFiles]): Promise<CandidateRule[]> => {
                                    try {
                                        appliesToFiles.sort()
                                        const searchPath = URI.parse(searchPathStr)
                                        const pathFuncs = pathFunctionsForURI(searchPath)

                                        // Check for cancellation before starting file operations
                                        if (signal?.aborted) {
                                            return []
                                        }

                                        // Wrap directory reading in its own try/catch
                                        let entries: [string, vscode.FileType][] = []
                                        try {
                                            entries = await vscode.workspace.fs.readDirectory(searchPath)
                                        } catch (dirError) {
                                            // Handle directory read errors gracefully
                                            return []
                                        }

                                        // Check for cancellation after expensive operation
                                        if (signal?.aborted) {
                                            return []
                                        }

                                        const rootFolder =
                                            vscode.workspace.getWorkspaceFolder(searchPath)
                                        // There should always be a root since we checked it above, but
                                        // be defensive.
                                        if (!rootFolder) {
                                            return []
                                        }
                                        const root = rootFolder.uri

                                        const ruleFiles =
                                            entries?.filter(([name]) => {
                                                try {
                                                    return isRuleFilename(name)
                                                } catch {
                                                    return false
                                                }
                                            }) || []

                                        // Process files one by one with individual error handling
                                        const rules: CandidateRule[] = []
                                        for (const entry of ruleFiles) {
                                            try {
                                                // Check for cancellation before each file operation
                                                if (signal?.aborted) {
                                                    break
                                                }

                                                if (!entry || !entry[0]) {
                                                    continue
                                                }
                                                const name = entry[0]

                                                const ruleURI = searchPath.with({
                                                    path: pathFuncs.resolve(searchPath.path, name),
                                                })

                                                let content: Uint8Array
                                                try {
                                                    content = await vscode.workspace.fs.readFile(ruleURI)
                                                } catch (fileError) {
                                                    // Skip this file and continue with others
                                                    continue
                                                }

                                                // Check for cancellation after file read
                                                if (signal?.aborted) {
                                                    break
                                                }

                                                try {
                                                    const rule = parseRuleFile(
                                                        ruleURI,
                                                        root,
                                                        new TextDecoder().decode(content)
                                                    )
                                                    rules.push({
                                                        rule,
                                                        appliesToFiles,
                                                    })
                                                } catch (parseError) {
                                                    // Continue if parsing fails
                                                }
                                            } catch (entryError) {
                                                // Continue with next file if processing one fails
                                                continue
                                            }
                                        }
                                        return rules
                                    } catch (mapError) {
                                        // Return empty array if processing this path fails
                                        return []
                                    }
                                }
                            )
                        ).catch(() => {
                            // If Promise.all fails, return empty array
                            return []
                        })

                        // Check for final cancellation before returning results
                        if (signal?.aborted) {
                            return []
                        }
                        return results.flat()
                    } catch (outerError) {
                        // Catch any remaining errors in the outer scope
                        return []
                    }
                }),
                // Share the same observable among multiple subscribers
                shareReplay()
            )
        },
    }
}

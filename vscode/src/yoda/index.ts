import {
    type ChatClient,
    abortableOperation,
    combineLatest,
    fromVSCodeEvent,
    logError,
    modelsService,
    startWith,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import { isArray } from 'lodash'
import * as o from 'observable-fns'
import * as vscode from 'vscode'
import { detectors } from './detectors'
import { Score, type SuggestedPrompt } from './detectors/Detector'
//TODO: This is a terrible way to create a singleton. @sqs guide me :-)
export let yoda: YodaController | undefined = undefined

// TODO: take most recent files

// const excludePattern = '**/*{e2e,integration,node_modules,dist}*/**'

export class YodaController implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    public lessons
    constructor(private chatClient: ChatClient) {
        this.lessons = o.multicast(this._lessons)
        this.disposables.push(subscriptionDisposable(this.lessons.subscribe({})))

        yoda = this
    }

    private model = modelsService.changes.pipe(
        startWith(modelsService.getDefaultChatModel()),
        o.map(() => {
            const model = modelsService.getDefaultChatModel()
            return modelsService.getModelByID(model ?? '')
        })
    )

    private sampledFiles = fromVSCodeEvent(
        vscode.workspace.onDidChangeWorkspaceFolders,
        () => ({})
    ).pipe(
        o.map(() => (vscode.workspace.workspaceFolders ?? []).at(0)),
        abortableOperation(async (workspace, abort) => {
            if (!workspace) {
                return []
            }
            const include = new vscode.RelativePattern(workspace, '**/[^.]*.ts')
            const exclude = new vscode.RelativePattern(
                workspace,
                '**/*{e2e,integration,node_modules,dist}*/**'
            )
            const cancel = cancellationToken(abort)
            const forcedFiles = await vscode.workspace.findFiles('**/workspace.ts')
            const files = await vscode.workspace.findFiles(include, exclude, 100, cancel)
            return [...forcedFiles, ...files]
        })
    )

    private _lessons = combineLatest([this.sampledFiles.pipe(o.flatMap(uri => uri)), this.model]).pipe(
        o.scan(async (acc, [uri, model]) => {
            if (!model) {
                return acc
            }
            if (acc.length > 5) {
                return acc
            }
            const ctx = {
                chatClient: this.chatClient,
                model: model,
            }
            try {
                const bytes = await await vscode.workspace.fs.readFile(uri)
                const decoded = new TextDecoder('utf-8').decode(bytes)
                const lessonPromises = detectors.map(async detector => {
                    const __temporary_candidates__ = await detector.candidates(
                        [{ content: decoded, score: Score.BASIC, uri: uri }],
                        ctx
                    )
                    const resultPromises = __temporary_candidates__
                        .map(v => ({ ...v, content: decoded }))
                        .map(async v => {
                            try {
                                const result = await detector.detect(v, ctx)
                                if (result === null || result === undefined) {
                                    return []
                                }
                                if (isArray(result)) {
                                    return result
                                }
                                return [result]
                            } catch (e) {
                                logError('Yoda', 'failed detection', e)
                                return []
                            }
                        })
                    const results = (await Promise.all(resultPromises)).flat()
                    return results
                })
                //     detector.detect(
                //         { uri, content: decoded },

                //     )
                // )
                const lessons = (await Promise.allSettled(lessonPromises)).flatMap(v => {
                    if (v.status !== 'fulfilled') {
                        logError('Yoda', `Failed to apply detector ${v.reason}`)
                        return []
                    }
                    if (!v.value) {
                        return []
                    }
                    if (isArray(v.value)) {
                        return v.value
                    }
                    return [v.value]
                })
                if (!lessons) {
                    return acc
                }
                acc.push(...lessons)
            } catch {}
            return acc
        }, [] as SuggestedPrompt[]),
        o.map(v => {
            return v.toSorted((a, b) => b.score - a.score)
        })
    )
    // private readonly bufferedLesson = bufferedMap(
    //     this.sampledFiles,
    //     async v => {
    //         await new Promise(resolve => setTimeout(resolve, 1000))
    //         return {
    //             cta: 'Learn more about Cody',
    //             prompt: ps`What should I ask you?`,
    //             score: 10,
    //         } satisfies YodaLesson
    //     },
    //     3
    // )

    dispose() {
        for (const d of this.disposables) {
            d.dispose()
        }
        this.disposables = []
        yoda = undefined
    }
}

function cancellationToken(signal: AbortSignal): vscode.CancellationToken {
    const tokenSource = new vscode.CancellationTokenSource()

    if (signal.aborted) {
        tokenSource.cancel()
    } else {
        signal.addEventListener('abort', () => tokenSource.cancel(), { once: true })
    }

    return tokenSource.token
}

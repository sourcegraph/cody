import { useCallback, useEffect, useState } from 'react'
import type { Action, ActionStatus } from '../../src/minion/action'
import type { GenericVSCodeWrapper } from '../utils/VSCodeApi'

import './MinionApp.css'
import {
    type RangeData,
    markdownCodeBlockLanguageIDForFilename,
    renderCodyMarkdown,
} from '@sourcegraph/cody-shared'
import type { URI } from 'vscode-uri'
import type { MinionExtensionMessage, MinionWebviewMessage } from './webview_protocol'

class AgentRunnerClient {
    private disposables: (() => void)[] = []
    private updateActionsHandlers: ((actions: Action[]) => void)[] = []
    private updateNextActionHandlers: ((
        nextAction: {
            action: Action
            status: Exclude<ActionStatus, 'completed'>
            message?: string
            proposalID?: string
        } | null
    ) => void)[] = []

    constructor(private vscodeAPI: GenericVSCodeWrapper<MinionWebviewMessage, MinionExtensionMessage>) {
        this.disposables.push(
            this.vscodeAPI.onMessage(message => {
                switch (message.type) {
                    case 'update-actions':
                        for (const handle of this.updateActionsHandlers) {
                            handle(message.actions)
                        }
                        break
                    case 'propose-next-action':
                        for (const handle of this.updateNextActionHandlers) {
                            handle({ action: message.action, status: 'pending', proposalID: message.id })
                        }
                        break
                    case 'update-next-action':
                        for (const handle of this.updateNextActionHandlers) {
                            handle(message.nextAction)
                        }
                        break
                }
            })
        )
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d()
        }
        this.disposables = []
        this.updateActionsHandlers = []
        this.updateNextActionHandlers = []
    }

    public start(description: string): void {
        this.vscodeAPI.postMessage({ type: 'start', description } as any)
    }

    public onUpdateActions(handler: (actions: Action[]) => void): void {
        this.updateActionsHandlers.push(handler)
    }

    public onUpdateNextAction(
        handler: (
            nextAction: {
                action: Action
                status: Exclude<ActionStatus, 'completed'>
                message?: string
                proposalID?: string
            } | null
        ) => void
    ): void {
        this.updateNextActionHandlers.push(handler)
    }

    public approveNextAction(id: string, action: Action): void {
        this.vscodeAPI.postMessage({ type: 'propose-next-action-reply', id, action })
    }
}

const DescribeBlock: React.FunctionComponent<{
    isActive: boolean
    agent: AgentRunnerClient
}> = ({ isActive, agent }) => {
    const [description, setDescription] = useState('')

    const start = useCallback(() => agent.start(description), [agent, description])

    const onSubmit = useCallback(
        (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            start()
        },
        [start]
    )

    const onKeyUp = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === 'Enter') {
                start()
                return
            }
            setDescription(event.currentTarget.value)
        },
        [start]
    )

    return (
        <div className="action action-l0">
            <div className="action-title">
                <i className="codicon codicon-comment" />
                <span className="action-title-name">Describe</span>
            </div>
            <div className="action-body">
                {isActive ? (
                    <form onSubmit={onSubmit}>
                        <textarea className="action-input" onKeyUp={onKeyUp} />
                        <input type="submit" />
                    </form>
                ) : (
                    <pre className="action-text">{description}</pre>
                )}
            </div>
        </div>
    )
}

const ActionBlock: React.FunctionComponent<{
    level: number
    codicon: string
    title: string
    children?: React.ReactNode
}> = ({ level, codicon, title, children }) => {
    return (
        <div className={`action action-l${level}`}>
            <div className="action-title">
                <i className={`codicon codicon-${codicon}`} />
                <span className="action-title-name">{title}</span>
            </div>
            <div className="action-body">{children}</div>
        </div>
    )
}

const NextActionBlock: React.FunctionComponent<{
    agent: AgentRunnerClient
    action: Action
    status: ActionStatus
    proposalID?: string
    message?: string
    children?: React.ReactNode
}> = ({ proposalID, agent, action, status, message, children }) => {
    const onApprove = useCallback(() => {
        if (proposalID) {
            agent.approveNextAction(proposalID, action)
        }
    }, [agent, proposalID, action])

    const { level } = action
    const { codicon, title } = displayInfoForAction(action)

    return (
        <div className={`action action-l${level}`}>
            <div className="action-title">
                <i className={`codicon codicon-${codicon}`} />
                <span className="action-title-name">{title}</span>
            </div>
            <div className="action-body">
                {children}
                {(status === 'pending' && (
                    <form>
                        <label>Waiting for approval</label>
                        <button onClick={onApprove} type="button">
                            Approve
                        </button>
                    </form>
                )) ||
                    (status === 'in-progress' && <div>Working...</div>) ||
                    (status === 'failed' && <div>Failed</div>) ||
                    (status === 'stopped' && <div>Stopped</div>)}
                {message && <div>{message}</div>}
            </div>
        </div>
    )
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

interface ActionInfo {
    codicon: string
    title: string
}

function displayInfoForAction(action: Action): ActionInfo {
    const hardcoded: Partial<{ [key in Action['type']]: Partial<ActionInfo> }> = {
        restate: { codicon: 'comment-discussion' },
        contextualize: { codicon: 'search-fuzzy' },
        reproduce: { codicon: 'beaker' },
        plan: { codicon: 'checklist' },
        'do-step': { codicon: 'pass' },
        search: { codicon: 'search' },
        open: { codicon: 'file' },
        scroll: { codicon: 'eye' },
        edit: { codicon: 'edit' },
        bash: { codicon: 'terminal' },
        human: { codicon: 'robot', title: 'Invoke human' },
    }
    const info = hardcoded[action.type] || {}
    switch (action.type) {
        case 'open': {
            info.title = `Open ${action.file}`
            break
        }
        case 'do-step': {
            info.title = `Do step ${action.ordinal}`
            break
        }
    }
    return {
        codicon: info?.codicon ?? 'circle',
        title: info?.title ?? capitalize(action.type).replace('-', ' '),
    }
}

function uriRangeString(uri: URI, range: RangeData): string {
    return `${uri.toString()}${range.start.line + 1}:${range.start.character + 1}-${
        range.end.line + 1
    }:${range.end.character + 1}`
}

function renderAction(action: Action, key: string): React.ReactNode {
    const { codicon, title } = displayInfoForAction(action)
    switch (action.type) {
        case 'restate': {
            return (
                <ActionBlock level={action.level} codicon={codicon} title={title}>
                    <pre className="action-text">{action.output}</pre>
                </ActionBlock>
            )
        }
        case 'contextualize': {
            return (
                <ActionBlock level={action.level} codicon={codicon} title={title}>
                    {action.output.map(annotatedContext => {
                        const langID = markdownCodeBlockLanguageIDForFilename(
                            annotatedContext.source.uri
                        )
                        const html = renderCodyMarkdown(
                            '```' + langID + '\n' + annotatedContext.text + '\n```'
                        )

                        return (
                            <div
                                key={uriRangeString(
                                    annotatedContext.source.uri,
                                    annotatedContext.source.range
                                )}
                            >
                                <div>
                                    <a
                                        href={annotatedContext.source.uri.toString()}
                                        className="action-text"
                                    >
                                        {annotatedContext.source.uri.toString()}
                                    </a>
                                </div>
                                <div
                                    className="action-code-snippet"
                                    // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
                                    dangerouslySetInnerHTML={{ __html: html }}
                                />
                                <pre className="action-text">{annotatedContext.comment}</pre>
                            </div>
                        )
                    })}
                </ActionBlock>
            )
        }
        case 'reproduce': {
            return <ActionBlock level={action.level} codicon={codicon} title={title} />
        }
        case 'plan': {
            return (
                <ActionBlock level={action.level} codicon={codicon} title={title}>
                    <ol>
                        {action.steps.map(step => (
                            <li key={step.title}>{step.title}</li>
                        ))}
                    </ol>
                </ActionBlock>
            )
        }
        case 'do-step': {
            return (
                <>
                    <ActionBlock level={action.level} codicon={codicon} title={title}>
                        <pre className="action-text">{`Doing:\n${action.step.description}`}</pre>
                    </ActionBlock>
                    {action.subactions.map((subaction, i) => renderAction(subaction, `${key}-${i}`))}
                </>
            )
        }
        case 'search': {
            return (
                <ActionBlock level={action.level} codicon={codicon} title={title}>
                    <div>Query: {action.query}</div>
                    <ol>
                        {action.results.map(result => (
                            <li key={result}>{result}</li>
                        ))}
                    </ol>
                </ActionBlock>
            )
        }
        case 'open': {
            return <ActionBlock level={action.level} codicon={codicon} title={title} />
        }
        case 'scroll': {
            return (
                <ActionBlock
                    level={action.level}
                    codicon={codicon}
                    title={`Scroll ${action.direction}`}
                />
            )
        }
        case 'edit': {
            return (
                <ActionBlock level={action.level} codicon={codicon} title={title}>
                    <textarea className="action-input" />
                </ActionBlock>
            )
        }
        case 'bash': {
            return (
                <ActionBlock level={action.level} codicon={codicon} title={title}>
                    <textarea className="action-input" />
                </ActionBlock>
            )
        }
        case 'human': {
            let child: React.ReactNode | undefined
            switch (action.actionType) {
                case 'edit':
                    child = (
                        <div>
                            <i className="codicon codicon-edit" />
                            <span>{action.description}</span>
                        </div>
                    )
                    break
                case 'view':
                    child = (
                        <div>
                            <i className="codicon codicon-eye" />
                            <span>{action.description}</span>
                        </div>
                    )
                    break
            }
            return (
                <ActionBlock level={action.level} codicon={codicon} title={title}>
                    {child}
                </ActionBlock>
            )
        }
        default: {
            return <ActionBlock level={(action as any).level} codicon={codicon} title={title} />
        }
    }
}

export const MinionApp: React.FunctionComponent<{
    vscodeAPI: GenericVSCodeWrapper<MinionWebviewMessage, MinionExtensionMessage>
}> = ({ vscodeAPI }) => {
    useEffect(() => {
        vscodeAPI.postMessage({ type: 'ready' })
    }, [vscodeAPI])

    const [actionLog, setActionLog] = useState<Action[]>([])
    const [nextAction, setNextAction] = useState<{
        action: Action
        status: ActionStatus
        proposalID?: string
    } | null>(null)
    const [agent] = useState(new AgentRunnerClient(vscodeAPI))

    useEffect(() => {
        agent.onUpdateActions(actions => {
            setActionLog(actions)
        })
        agent.onUpdateNextAction(nextAction => {
            setNextAction(nextAction)
        })
    }, [agent])

    // useEffect(() => {
    //     setActionLog([
    //         {
    //             level: 0,
    //             type: 'restate',
    //             output: 'This is a description of the thing I want to do.',
    //         },
    //         {
    //             level: 0,
    //             type: 'contextualize',
    //             output: [
    //                 {
    //                     text: 'This is a description of the thing I want to do.',
    //                     source: 'file:///Users/me/foo.ts',
    //                     comment: 'This is a comment.',
    //                 },
    //             ],
    //         },
    //         {
    //             level: 0,
    //             type: 'reproduce',
    //             bash: 'echo "hello world"',
    //         },
    //         {
    //             level: 0,
    //             type: 'plan',
    //             steps: [
    //                 {
    //                     title: 'Step 1',
    //                     description: 'This is a description of the thing I want to do.',
    //                 },
    //                 {
    //                     title: 'Step 2',
    //                     description: 'This is a description of the thing I want to do.',
    //                 },
    //             ],
    //         },
    //         {
    //             level: 0,
    //             type: 'do-step',
    //             subactions: [
    //                 {
    //                     level: 1,
    //                     type: 'search',
    //                     query: 'hello',
    //                     results: ['hello world', 'hello world 2'],
    //                 },
    //                 {
    //                     level: 1,
    //                     type: 'open',
    //                     file: 'file:///Users/me/foo.ts',
    //                 },
    //                 {
    //                     level: 1,
    //                     type: 'scroll',
    //                     direction: 'up',
    //                 },
    //                 {
    //                     level: 1,
    //                     type: 'edit',
    //                     file: 'file:///Users/me/foo.ts',
    //                     start: 123,
    //                     end: 456,
    //                     replacement: 'hello world',
    //                 },
    //                 {
    //                     level: 1,
    //                     type: 'human',
    //                     description: "Here's what I did for you",
    //                 },
    //             ],
    //         },
    //     ])
    // }, [])

    console.log('### action log', actionLog)
    const isDescribeBlockActive = actionLog.length === 0

    let nextActionComponent = undefined
    if (nextAction) {
        nextActionComponent = (
            <NextActionBlock
                agent={agent}
                proposalID={nextAction.proposalID}
                action={nextAction.action}
                status={nextAction.status}
            />
        )
    }

    return (
        <div className="app">
            <div className="transcript">
                <DescribeBlock isActive={isDescribeBlockActive} agent={agent} />
                {actionLog.map((action, i) => renderAction(action, `${i}`))}
                {nextActionComponent}
            </div>
        </div>
    )
}

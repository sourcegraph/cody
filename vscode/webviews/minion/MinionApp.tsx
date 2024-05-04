import { useCallback, useEffect, useState } from 'react'
import type { Action } from '../../src/minion/action'
import type { GenericVSCodeWrapper } from '../utils/VSCodeApi'

import './MinionApp.css'
import type { MinionExtensionMessage, MinionWebviewMessage } from './webview_protocol'

class AgentRunnerClient {
    private disposables: (() => void)[] = []
    private updateActionHandlers: ((actions: Action[]) => void)[] = []

    constructor(private vscodeAPI: GenericVSCodeWrapper<MinionWebviewMessage, MinionExtensionMessage>) {
        this.disposables.push(
            this.vscodeAPI.onMessage(message => {
                switch (message.type) {
                    case 'update-actions':
                        console.log('#### got update-actions')
                        for (const updateActionHandler of this.updateActionHandlers) {
                            updateActionHandler(message.actions)
                        }
                }
            })
        )
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d()
        }
        this.disposables = []
        for (const updateActionHandler of this.updateActionHandlers) {
            updateActionHandler([])
        }
        this.updateActionHandlers = []
    }

    public start(description: string): void {
        this.vscodeAPI.postMessage({ type: 'start', description } as any)
    }

    public onUpdateActions(handler: (actions: Action[]) => void): void {
        this.updateActionHandlers.push(handler)
    }
    // public onReceiveRequest(handler: (request: any) => any): void {}
}

const DescribeBlock: React.FunctionComponent<{ isActive: boolean; agent: AgentRunnerClient }> = ({
    isActive,
    agent,
}) => {
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
                    <>{description}</>
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

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function renderAction(action: Action, key: string): React.ReactNode {
    switch (action.type) {
        case 'restate': {
            return (
                <ActionBlock level={action.level} codicon="comment-discussion" title="Restate">
                    <pre>{action.output}</pre>
                </ActionBlock>
            )
        }
        case 'contextualize': {
            return <ActionBlock level={action.level} codicon="search-fuzzy" title="Contextualize" />
        }
        case 'reproduce': {
            return <ActionBlock level={action.level} codicon="beaker" title="Reproduce" />
        }
        case 'plan': {
            return (
                <ActionBlock level={action.level} codicon="checklist" title="Plan">
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
                    <ActionBlock level={action.level} codicon="pass" title="Do step" />
                    {action.subactions.map((subaction, i) => renderAction(subaction, `${key}-${i}`))}
                </>
            )
        }
        case 'search': {
            return (
                <ActionBlock level={action.level} codicon="search" title="Search">
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
            return <ActionBlock level={action.level} codicon="file" title={`Open ${action.file}`} />
        }
        case 'scroll': {
            return (
                <ActionBlock level={action.level} codicon="eye" title={`Scroll ${action.direction}`} />
            )
        }
        case 'edit': {
            return (
                <ActionBlock level={action.level} codicon="edit" title="Edit">
                    <textarea className="action-input" />
                </ActionBlock>
            )
        }
        case 'bash': {
            return (
                <ActionBlock level={action.level} codicon="terminal" title="Terminal">
                    <textarea className="action-input" />
                </ActionBlock>
            )
        }
        case 'human': {
            return <ActionBlock level={action.level} codicon="robot" title="Invoke human" />
        }
        default: {
            return (
                <ActionBlock
                    level={(action as any).level}
                    codicon="circle"
                    title={capitalize((action as any).type)}
                />
            )
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
    const [agent] = useState(new AgentRunnerClient(vscodeAPI))

    useEffect(() => {
        agent.onUpdateActions(actions => {
            setActionLog(actions)
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

    return (
        <div className="app">
            <div className="transcript">
                <DescribeBlock isActive={true} agent={agent} />

                {actionLog.map((action, i) => renderAction(action, `${i}`))}
            </div>
        </div>
    )
}

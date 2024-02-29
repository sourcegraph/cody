import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { Action } from '../src/chat/protocol'
import type { VSCodeWrapper } from './utils/VSCodeApi'

const defaultDescription = `Create a new sidebar panel that's similar to the search panel but executes multiple queries under the hood, with various rewriting strategies.`

export const GuidePanel: React.FunctionComponent<{
    vscodeAPI: VSCodeWrapper
}> = ({ vscodeAPI }) => {
    const [issueDescription, setIssueDescription] = useState(defaultDescription)
    const [actions, setActions] = useState<Action[]>([])
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const onSubmitIssueDescription = useCallback(() => {
        setIssueDescription(textareaRef.current!.value)
        vscodeAPI.postMessage({
            command: 'agi/submitIssueDescription',
            description: issueDescription,
        })
    }, [vscodeAPI, issueDescription])
    const onAddAction = useCallback(
        (newAction: Action) => {
            vscodeAPI.postMessage({
                command: 'agi/doNewAction',
                newAction,
                prevActions: actions,
            })
        },
        [vscodeAPI, actions]
    )

    useEffect(() => {
        return vscodeAPI.onMessage(message => {
            console.log('# view got message', message)
            switch (message.type) {
                case 'agi/actions':
                    setActions(message.actions)
                    break
            }
        })
    }, [vscodeAPI])
    return (
        <>
            <div>
                <span>What are you trying to do?</span>
                <div>
                    <textarea
                        ref={textareaRef}
                        value={issueDescription}
                        onChange={e => setIssueDescription(e.currentTarget.value)}
                    />
                </div>
                <div>
                    <button type="button" onClick={onSubmitIssueDescription}>
                        Submit
                    </button>
                </div>
            </div>
            {actions.map((action, i) => (
                <div>
                    <ActionBlock
                        key={action.type}
                        action={action}
                        isInteractive={i === actions.length - 1}
                        onAddAction={onAddAction}
                    />
                </div>
            ))}
        </>
    )
}

const ActionBlock: React.FunctionComponent<{
    action: Action
    isInteractive: boolean
    onAddAction: (action: Action) => void
}> = ({ action, isInteractive, onAddAction: addAction }) => {
    switch (action.type) {
        case 'writeSearchQuery':
            if (!action.result) {
                return <div>writing search query...</div>
            }
            return (
                <div>
                    <div>Proposed queries:</div>
                    <textarea defaultValue={action.result.join('\n')} />
                    {isInteractive && (
                        <div>
                            <button
                                onClick={() =>
                                    addAction({
                                        type: 'searchAll',
                                        queries: action.result ?? [],
                                    })
                                }
                                type="button"
                            >
                                Search all
                            </button>
                        </div>
                    )}
                </div>
            )
        case 'searchAll':
            if (!action.result) {
                return <div>searching...</div>
            }
            return (
                <div>
                    <div>Results:</div>
                    {action.result.map((result, i) => (
                        <div key={result.query}>
                            <div>
                                <span>{result.query}</span>
                                <span>
                                    {result.results.length}
                                    {result.results.length === 1 ? 'hit' : 'hits'}
                                </span>
                            </div>
                            <div>
                                {result.results.map(r => {
                                    return <div>{r.fqname}</div>
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )
        default:
            return <div>Unrecognized action: {(action as any).type}</div>
    }
}

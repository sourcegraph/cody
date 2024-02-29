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
            {actions.map(action => (
                <div>
                    <ActionBlock key={action.type} action={action} />
                </div>
            ))}
        </>
    )
}

const ActionBlock: React.FunctionComponent<{ action: Action }> = ({ action }) => {
    switch (action.type) {
        case 'writeSearchQuery':
            if (!action.result) {
                return <div>writing search query...</div>
            }
            return (
                <div>
                    <div>Proposed queries:</div>
                    <textarea defaultValue={action.result.join('\n')} />
                    <div>
                        <button type="button">Search all</button>
                    </div>
                </div>
            )
        default:
            return <div>Unrecognized action: {action.type}</div>
    }
}

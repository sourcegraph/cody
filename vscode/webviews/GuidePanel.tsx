import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { VSCodeWrapper } from './utils/VSCodeApi'

export const GuidePanel: React.FunctionComponent<{
    vscodeAPI: VSCodeWrapper
}> = ({ vscodeAPI }) => {
    const [issueDescription, setIssueDescription] = useState('')
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
                    break
            }
        })
    }, [vscodeAPI])
    return (
        <div>
            <span>What are you trying to do?</span>
            <div>
                <textarea
                    ref={textareaRef}
                    value={issueDescription}
                    onChange={onSubmitIssueDescription}
                />
            </div>
        </div>
    )
}

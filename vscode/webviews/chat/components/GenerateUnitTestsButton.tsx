import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import type React from 'react'
import { useCallback } from 'react'
import type { ApiPostMessage } from '../../Chat'

interface GenerateUnitTestsButtonProps {
    postMessage: ApiPostMessage
}

export const GenerateUnitTestsButton: React.FC<GenerateUnitTestsButtonProps> = ({ postMessage }) => {
    const handleGenerateUnitTest = useCallback(() => {
        postMessage({
            command: 'experimental-unit-test-prompt',
        })
    }, [postMessage])

    return (
        <div className="tw-mx-auto">
            <VSCodeButton appearance="secondary" onClick={handleGenerateUnitTest}>
                Generate Unit Tests
                <div className="tw-text-muted-foreground" style={{ marginLeft: '0.75em' }}>
                    EXPERIMENTAL
                </div>
            </VSCodeButton>
        </div>
    )
}

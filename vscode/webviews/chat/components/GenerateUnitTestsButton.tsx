import type React from 'react'
import { useCallback } from 'react'
import type { ApiPostMessage } from '../../Chat'
import { Button } from '../../components/shadcn/ui/button'

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
        <div className="tw-mx-auto tw-text-center">
            <Button onClick={handleGenerateUnitTest}>Generate Unit Tests (Experimental)</Button>
        </div>
    )
}

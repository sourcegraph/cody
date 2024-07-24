import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import type React from 'react'
import { useCallback } from 'react'
import type { ApiPostMessage } from '../../Chat'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/shadcn/ui/tooltip'

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
            <Tooltip disableHoverableContent={false}>
                <TooltipTrigger asChild>
                    <VSCodeButton appearance="secondary" onClick={handleGenerateUnitTest}>
                        Generate Unit Tests
                        <div className="tw-ml-3 tw-text-sm tw-text-muted-foreground">
                            (Experiment - Staff Only)
                        </div>
                    </VSCodeButton>
                </TooltipTrigger>
                <TooltipContent>
                    <div className="tw-text-left tw-flex tw-flex-col tw-gap-2">
                        <p>A new prompt-library-based approach to Generate Unit Test ⚡️</p>
                        <p>
                            Please use this instead of the existing command and post feedback to{' '}
                            <a href="https://sourcegraph.slack.com/archives/C078JDXUC3U">
                                #wg-improve-generate-unit-tests
                            </a>
                        </p>
                        <p className="tw-text-muted-foreground">
                            To disable, set{' '}
                            <code className="tw-px-1 tw-border tw-border-current-25 tw-rounded">
                                cody.experimentalUnitTestEnabled
                            </code>{' '}
                            to{' '}
                            <code className="tw-px-1 tw-border tw-border-current-25 tw-rounded">
                                false
                            </code>{' '}
                            in your user settings.
                        </p>
                    </div>
                </TooltipContent>
            </Tooltip>
        </div>
    )
}

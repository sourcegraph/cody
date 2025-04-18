import * as Form from '@radix-ui/react-form'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'
import type { AutoeditFeedbackData } from '../../../src/autoedits/analytics-logger/types'
import { AutoeditDataSDK } from '../../../src/autoedits/debug-panel/autoedit-data-sdk'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'
import { Label } from '../../components/shadcn/ui/label'
import { vscode } from '../webview-api'

interface FeedbackSectionProps {
    entry: AutoeditRequestDebugState
}

export const FeedbackSection: FC<FeedbackSectionProps> = ({ entry }) => {
    const [expectedCode, setExpectedCode] = useState('')
    const [assertions, setAssertions] = useState('')
    const [copySuccess, setCopySuccess] = useState(false)
    const [isJsonExpanded, setIsJsonExpanded] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const codeToReplaceData = entry.state.codeToReplaceData
    const { filePath, context, prediction } = AutoeditDataSDK.extractAutoeditData(entry)

    if (!prediction) {
        return (
            <div className="tw-text-gray-500 tw-text-center tw-py-8">
                Feedback is only available for loaded requests
            </div>
        )
    }

    const feedbackJson: AutoeditFeedbackData = {
        source: 'feedback',
        file_path: filePath,
        prefix: codeToReplaceData.prefixBeforeArea + codeToReplaceData.prefixInArea,
        suffix: codeToReplaceData.suffixInArea + codeToReplaceData.suffixAfterArea,
        code_to_rewrite_prefix: codeToReplaceData.codeToRewritePrefix,
        code_to_rewrite_suffix: codeToReplaceData.codeToRewriteSuffix,
        context: context,
        chosen: expectedCode,
        rejected: prediction,
        assertions: assertions,
        is_reviewed: false,
    }

    const handleCopyJson = () => {
        navigator.clipboard
            .writeText(JSON.stringify(feedbackJson, null, 4))
            .then(() => {
                setCopySuccess(true)
                setTimeout(() => setCopySuccess(false), 2000)
            })
            .catch(err => console.error('Failed to copy text: ', err))
    }

    const handleSubmit = () => {
        setIsSubmitting(true)
        vscode.postMessage({
            type: 'submitFeedback',
            entry,
            feedback: feedbackJson,
        })
        setIsSubmitting(false)
    }

    return (
        <Form.Root className="tw-space-y-6">
            <Form.Field name="expected-code" className="tw-space-y-2">
                <Label htmlFor="expected-code">Expected Code</Label>
                <Form.Control asChild>
                    <textarea
                        id="expected-code"
                        placeholder="Enter the code that the LLM should have generated..."
                        className="tw-min-h-[200px] tw-font-mono tw-text-sm tw-w-full tw-p-2 tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded tw-bg-white tw-dark:tw-bg-gray-800 tw-text-gray-900 tw-dark:tw-text-gray-100"
                        value={expectedCode}
                        onChange={e => setExpectedCode(e.target.value)}
                    />
                </Form.Control>
            </Form.Field>

            <Form.Field name="assertions" className="tw-space-y-2">
                <Label htmlFor="assertions">Assertions</Label>
                <Form.Control asChild>
                    <textarea
                        id="assertions"
                        placeholder="Enter assertions to verify the code correctness..."
                        className="tw-min-h-[100px] tw-font-mono tw-text-sm tw-w-full tw-p-2 tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded tw-bg-white tw-dark:tw-bg-gray-800 tw-text-gray-900 tw-dark:tw-text-gray-100"
                        value={assertions}
                        onChange={e => setAssertions(e.target.value)}
                    />
                </Form.Control>
            </Form.Field>

            <div className="tw-mt-8">
                <div className="tw-flex tw-justify-between tw-items-center tw-mb-2">
                    <button
                        type="button"
                        onClick={() => setIsJsonExpanded(!isJsonExpanded)}
                        className="tw-flex tw-items-center tw-gap-1 tw-text-sm tw-text-gray-600 hover:tw-text-gray-800 dark:tw-text-gray-400 dark:hover:tw-text-gray-200"
                    >
                        {isJsonExpanded ? (
                            <>
                                <ChevronDown className="tw-w-4 tw-h-4" />
                                Hide JSON
                            </>
                        ) : (
                            <>
                                <ChevronRight className="tw-w-4 tw-h-4" />
                                Show JSON
                            </>
                        )}
                    </button>
                    <div className="tw-flex tw-gap-2">
                        <button
                            type="button"
                            onClick={handleCopyJson}
                            className="tw-text-xs tw-text-gray-600 hover:tw-text-gray-800 dark:tw-text-gray-400 dark:hover:tw-text-gray-200 tw-rounded tw-px-2 tw-py-1 tw-bg-gray-100 hover:tw-bg-gray-200 dark:tw-bg-gray-700 dark:hover:tw-bg-gray-600 tw-transition-colors tw-duration-150"
                            title="Copy JSON to clipboard"
                            aria-label="Copy JSON to clipboard"
                        >
                            {copySuccess ? 'Copied!' : 'Copy'}
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="tw-text-xs tw-text-white tw-bg-blue-600 hover:tw-bg-blue-700 dark:tw-bg-blue-500 dark:hover:tw-bg-blue-600 tw-rounded tw-px-4 tw-py-1 tw-transition-colors tw-duration-150 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
                            title="Submit feedback"
                            aria-label="Submit feedback"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit'}
                        </button>
                    </div>
                </div>
                {isJsonExpanded && (
                    <pre className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-4 tw-rounded tw-text-sm tw-font-mono tw-overflow-auto">
                        {JSON.stringify(feedbackJson, null, 4)}
                    </pre>
                )}
            </div>
        </Form.Root>
    )
}

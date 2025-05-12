import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getCodeToRewrite } from '../../../src/autoedits/debug-panel/autoedit-data-sdk'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'

export const CodeToRewriteDataSection: FC<{ entry: AutoeditRequestDebugState }> = ({ entry }) => {
    // State to track whether the prompt is shown in fullscreen modal
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [copySuccess, setCopySuccess] = useState(false)
    const codeToRewriteDataRef = useRef<HTMLPreElement>(null)
    const codeToRewriteData = getCodeToRewrite(entry)

    // Format the prompt content
    const formattedCodeToRewriteData = formatCodeToRewriteData()

    // Close modal with Escape key
    const handleKeyDown = useCallback(
        (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isModalOpen) {
                setIsModalOpen(false)
            }
        },
        [isModalOpen]
    )

    // Add and remove event listener
    useEffect(() => {
        if (isModalOpen) {
            document.addEventListener('keydown', handleKeyDown)
            // Prevent scrolling of the background when modal is open
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.body.style.overflow = ''
        }
    }, [isModalOpen, handleKeyDown])

    // Handle copying code to rewrite data
    const handleCopyCodeToRewriteData = () => {
        if (formattedCodeToRewriteData) {
            navigator.clipboard
                .writeText(formattedCodeToRewriteData)
                .then(() => {
                    setCopySuccess(true)
                    setTimeout(() => setCopySuccess(false), 2000)
                })
                .catch(err => console.error('Failed to copy text: ', err))
        }
    }

    // Format the code to rewrite data based on its type
    function formatCodeToRewriteData(): string {
        if (!codeToRewriteData) {
            return 'No code to rewrite data available'
        }

        // Custom formatter for the code to rewrite data with XML tags
        try {
            const obj =
                typeof codeToRewriteData === 'string' ? JSON.parse(codeToRewriteData) : codeToRewriteData

            // Define the display order of fields
            const fieldOrder = [
                'prefixBeforeArea',
                'suffixAfterArea',
                'prefixInArea',
                'codeToRewrite',
                'suffixInArea',
            ]

            let result = ''

            // Process fields in the specified order
            for (const field of fieldOrder) {
                if (field in obj) {
                    const value = obj[field]
                    result += `<${field}>\n${value}\n</${field}>\n`
                }
            }

            // Add any remaining fields not in the specified order
            for (const [key, value] of Object.entries(obj)) {
                if (!fieldOrder.includes(key)) {
                    result += `<${key}>\n${
                        typeof value === 'string' ? value : JSON.stringify(value, null, 2)
                    }\n</${key}>\n`
                }
            }

            return result
        } catch (error) {
            // Fallback to standard JSON formatting if anything goes wrong
            return JSON.stringify(codeToRewriteData, null, 2)
        }
    }

    // Don't render anything if there's no code to rewrite data
    if (!codeToRewriteData) {
        return null
    }

    // CSS classes for code to rewrite data - always using full height now
    const codeToRewriteDataClass =
        'tw-bg-gray-50 tw-dark:tw-bg-gray-800 tw-p-4 tw-rounded tw-text-xs tw-font-mono tw-border-0 tw-m-0 tw-text-gray-800 dark:tw-text-gray-200 tw-leading-relaxed tw-whitespace-pre-wrap tw-h-full tw-overflow-y-auto'

    return (
        <>
            {/* Prompt display section */}
            <div className="tw-mb-4 tw-flex tw-flex-col tw-h-full">
                <div className="tw-flex tw-justify-end tw-items-center tw-mb-2">
                    <div className="tw-flex tw-space-x-2">
                        {/* Copy button */}
                        <button
                            type="button"
                            onClick={handleCopyCodeToRewriteData}
                            className="tw-text-xs tw-text-gray-600 hover:tw-text-gray-800 dark:tw-text-gray-400 dark:hover:tw-text-gray-200 tw-rounded tw-px-2 tw-py-1 tw-bg-gray-100 hover:tw-bg-gray-200 dark:tw-bg-gray-700 dark:hover:tw-bg-gray-600 tw-transition-colors tw-duration-150"
                            title="Copy prompt to clipboard"
                            aria-label="Copy prompt to clipboard"
                        >
                            {copySuccess ? 'Copied!' : 'Copy'}
                        </button>

                        {/* Fullscreen button */}
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(true)}
                            className="tw-text-xs tw-text-gray-600 hover:tw-text-gray-800 dark:tw-text-gray-400 dark:hover:tw-text-gray-200 tw-rounded tw-px-2 tw-py-1 tw-bg-gray-100 hover:tw-bg-gray-200 dark:tw-bg-gray-700 dark:hover:tw-bg-gray-600 tw-transition-colors tw-duration-150"
                            title="View in fullscreen"
                            aria-label="View code to rewrite data in fullscreen"
                        >
                            Fullscreen
                        </button>
                    </div>
                </div>

                {/* Prompt content with enhanced styling using CSS classes instead of inline styles */}
                <div
                    className="tw-border tw-border-gray-200 dark:tw-border-gray-700 tw-rounded-md tw-max-h-100 tw-overflow-y-auto"
                    role="region"
                    aria-label="Prompt content"
                >
                    <pre ref={codeToRewriteDataRef} className={codeToRewriteDataClass}>
                        {formattedCodeToRewriteData}
                    </pre>
                </div>
            </div>

            {/* Fullscreen modal with improved UX */}
            {isModalOpen && (
                <div
                    className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-p-4 tw-bg-black tw-bg-opacity-80 tw-backdrop-blur-sm tw-transition-opacity tw-duration-300"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-title"
                >
                    <div className="tw-bg-white tw-dark:tw-bg-gray-900 tw-rounded-lg tw-shadow-xl tw-w-full tw-h-full tw-max-w-screen-xl tw-max-h-screen tw-flex tw-flex-col">
                        {/* Modal header */}
                        <div className="tw-flex tw-justify-between tw-items-center tw-p-4 tw-border-b tw-border-gray-200 tw-dark:tw-border-gray-700">
                            <h2
                                id="modal-title"
                                className="tw-text-lg tw-font-medium tw-text-gray-900 dark:tw-text-gray-100"
                            >
                                Code To Rewrite Data
                            </h2>

                            <div className="tw-flex tw-space-x-2">
                                {/* Copy button in modal */}
                                <button
                                    type="button"
                                    onClick={handleCopyCodeToRewriteData}
                                    className="tw-flex tw-items-center tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium tw-rounded-md tw-bg-gray-100 hover:tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-gray-700 dark:hover:tw-bg-gray-600 dark:tw-text-gray-200 tw-transition-colors tw-duration-150"
                                    aria-label="Copy code to rewrite data to clipboard"
                                >
                                    {copySuccess ? 'Copied!' : 'Copy code to rewrite data'}
                                </button>

                                {/* Close button */}
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="tw-flex tw-items-center tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium tw-rounded-md tw-bg-gray-100 hover:tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-gray-700 dark:hover:tw-bg-gray-600 dark:tw-text-gray-200 tw-transition-colors tw-duration-150"
                                    aria-label="Close modal"
                                >
                                    Close (Esc)
                                </button>
                            </div>
                        </div>

                        {/* Modal body */}
                        <div className="tw-flex-grow tw-overflow-hidden">
                            <div className="tw-h-full tw-overflow-auto tw-rounded-md tw-bg-gray-50 tw-dark:tw-bg-gray-800 tw-border tw-border-gray-200 dark:tw-border-gray-700">
                                <pre className="tw-whitespace-pre-wrap tw-font-mono tw-text-sm tw-p-5 tw-m-0 tw-h-full tw-overflow-y-auto tw-text-gray-800 dark:tw-text-gray-200 tw-leading-relaxed">
                                    {formattedCodeToRewriteData}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Message, SerializedChatMessage } from '@sourcegraph/cody-shared'
import type { FireworksChatMessage } from '../../../src/autoedits/adapters/utils'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'
import { getModelResponse } from '../autoedit-data-sdk'

// Use a union type of the existing message types from the codebase
type MessageType = Message | SerializedChatMessage | FireworksChatMessage

export const PromptSection: FC<{ entry: AutoeditRequestDebugState }> = ({ entry }) => {
    // State to track whether the prompt is shown in fullscreen modal
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [copySuccess, setCopySuccess] = useState(false)
    const promptTextRef = useRef<HTMLPreElement>(null)

    // Get model response if available
    const modelResponse = getModelResponse(entry)

    // Extract prompt data from request body
    const requestBody = modelResponse?.requestBody

    // Format the prompt content
    const formattedPrompt = formatPrompt()

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

    // Handle copying prompt text
    const handleCopyPrompt = () => {
        if (formattedPrompt) {
            navigator.clipboard
                .writeText(formattedPrompt)
                .then(() => {
                    setCopySuccess(true)
                    setTimeout(() => setCopySuccess(false), 2000)
                })
                .catch(err => console.error('Failed to copy text: ', err))
        }
    }

    // Format the prompt based on its type
    function formatPrompt(): string {
        if (!requestBody) {
            return 'No prompt data available'
        }

        try {
            // Handle messages array (both Fireworks and Sourcegraph formats)
            if ('messages' in requestBody && Array.isArray(requestBody.messages)) {
                return requestBody.messages
                    .map((message: MessageType) => {
                        // Handle Fireworks format (role/content) - used in FireworksChatModelRequestParams
                        if ('role' in message && typeof message.role === 'string') {
                            const role = message.role
                            const content =
                                'content' in message && message.content !== undefined
                                    ? String(message.content)
                                    : 'No content'
                            return `${role}: ${content}`
                        }

                        // Handle Sourcegraph format (speaker/text) - used in Message and SerializedChatMessage
                        if ('speaker' in message && typeof message.speaker === 'string') {
                            const speaker = message.speaker
                            const text =
                                'text' in message && message.text !== undefined
                                    ? String(message.text)
                                    : 'No content'
                            return `${speaker}: ${text}`
                        }

                        // Fallback for unknown message format
                        return JSON.stringify(message)
                    })
                    .join('\n\n')
            }

            // Handle single prompt (completion model)
            if ('prompt' in requestBody && requestBody.prompt) {
                return String(requestBody.prompt)
            }

            // Try to extract data from any field that might contain the prompt
            const possiblePromptFields = ['text', 'content', 'userMessage', 'input']
            for (const field of possiblePromptFields) {
                if (
                    field in requestBody &&
                    requestBody[field] !== undefined &&
                    requestBody[field] !== null
                ) {
                    return String(requestBody[field])
                }
            }

            // Handle nested prompt structures
            if ('body' in requestBody && requestBody.body) {
                if (typeof requestBody.body === 'string') {
                    return requestBody.body
                }

                // Check for content in body
                if (
                    typeof requestBody.body === 'object' &&
                    requestBody.body !== null &&
                    'content' in requestBody.body
                ) {
                    return String(requestBody.body.content)
                }
            }

            // For other request bodies, convert to a simple readable format
            return Object.entries(requestBody)
                .filter(([_, value]) => value !== undefined)
                .map(([key, value]) => {
                    if (typeof value === 'object' && value !== null) {
                        return `${key}: [Object]`
                    }
                    return `${key}: ${value}`
                })
                .join('\n')
        } catch (error) {
            console.error('Error formatting prompt:', error)
            return 'Error formatting prompt. See console for details.'
        }
    }

    // Don't render anything if there's no prompt data
    if (!modelResponse?.requestBody) {
        return null
    }

    // CSS classes for prompt text - always using full height now
    const promptTextClass =
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
                            onClick={handleCopyPrompt}
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
                            aria-label="View prompt in fullscreen"
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
                    <pre ref={promptTextRef} className={promptTextClass}>
                        {formattedPrompt}
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
                                Prompt Details
                            </h2>

                            <div className="tw-flex tw-space-x-2">
                                {/* Copy button in modal */}
                                <button
                                    type="button"
                                    onClick={handleCopyPrompt}
                                    className="tw-flex tw-items-center tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium tw-rounded-md tw-bg-gray-100 hover:tw-bg-gray-200 tw-text-gray-700 dark:tw-bg-gray-700 dark:hover:tw-bg-gray-600 dark:tw-text-gray-200 tw-transition-colors tw-duration-150"
                                    aria-label="Copy prompt to clipboard"
                                >
                                    {copySuccess ? 'Copied!' : 'Copy prompt'}
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
                                    {formattedPrompt}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

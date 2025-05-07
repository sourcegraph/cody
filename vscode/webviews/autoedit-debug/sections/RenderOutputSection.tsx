import type { FC } from 'react'
import { useCallback, useState } from 'react'

import { AutoeditDataSDK } from '../../../src/autoedits/debug-panel/autoedit-data-sdk'
import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'

export const RenderOutputSection: FC<{
    entry: AutoeditRequestDebugState
}> = ({ entry }) => {
    const { renderOutput } = AutoeditDataSDK.extractAutoeditData(entry)
    const [expanded, setExpanded] = useState(false)

    const toggleExpand = useCallback(() => {
        setExpanded(!expanded)
    }, [expanded])

    if (!renderOutput) {
        return (
            <div className="tw-p-4 tw-bg-gray-50 tw-dark:tw-bg-gray-800/50 tw-rounded-md">
                <p className="tw-text-sm tw-text-gray-500 tw-dark:tw-text-gray-400">
                    No render output information available
                </p>
            </div>
        )
    }

    // Handle image render output type specially
    const isImageType = renderOutput.type === 'image' && 'imageData' in renderOutput

    return (
        <div className="tw-p-4 tw-bg-gray-50 tw-dark:tw-bg-gray-800/50 tw-rounded-md">
            <div className="tw-flex tw-justify-between tw-items-center tw-mb-4">
                <h3 className="tw-text-md tw-font-medium">Render Output</h3>
                <button
                    type="button"
                    className="tw-text-sm tw-text-blue-500 hover:tw-underline"
                    onClick={toggleExpand}
                >
                    {expanded ? 'Collapse' : 'Expand Raw Data'}
                </button>
            </div>

            <div className="tw-flex tw-gap-2 tw-mb-4">
                <span className="tw-text-sm tw-font-medium tw-text-gray-600 tw-dark:tw-text-gray-300">
                    Type:
                </span>
                <span className="tw-px-2 tw-py-0.5 tw-bg-blue-100 tw-dark:tw-bg-blue-900/30 tw-rounded tw-text-sm tw-text-blue-800 tw-dark:tw-text-blue-300">
                    {renderOutput.type}
                </span>
            </div>

            {/* Render the actual image for image type render outputs */}
            {isImageType && (
                <div className="tw-mt-4 tw-mb-4">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Preview:</h4>
                    <div className="tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded tw-p-2 tw-bg-white tw-dark:tw-bg-gray-900">
                        <img
                            src={renderOutput.imageData.light}
                            className="tw-block tw-dark:tw-hidden tw-max-w-full tw-h-auto tw-rounded tw-shadow-sm"
                            alt="Light theme suggestion preview"
                        />
                        <img
                            src={renderOutput.imageData.dark}
                            className="tw-hidden tw-dark:tw-block tw-max-w-full tw-h-auto tw-rounded tw-shadow-sm"
                            alt="Dark theme suggestion preview"
                        />
                    </div>
                    <div className="tw-mt-2 tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">
                        Position: Line {renderOutput.imageData.position.line + 1}, Column{' '}
                        {renderOutput.imageData.position.column + 1}
                    </div>
                </div>
            )}

            {expanded && (
                <div className="tw-mt-2">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Raw Data:</h4>
                    <pre className="tw-bg-gray-100 tw-dark:tw-bg-gray-800/80 tw-p-2 tw-rounded tw-text-xs tw-overflow-auto tw-max-h-[400px]">
                        {JSON.stringify(renderOutput, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    )
}

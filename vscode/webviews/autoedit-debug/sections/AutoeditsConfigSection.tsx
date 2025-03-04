import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { JsonViewer } from '../components/JsonViewer'

interface AutoeditsConfigSectionProps {
    entry: AutoeditRequestDebugState
}

/**
 * A simple component to render the JSON configuration with styling.
 */
export const AutoeditsConfigSection: FC<AutoeditsConfigSectionProps> = ({ entry }) => {
    const config = entry.autoeditsProviderConfig

    return (
        <div className="tw-space-y-4">
            <div className="tw-bg-gray-50 tw-dark:tw-bg-gray-800 tw-rounded-md tw-overflow-hidden tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-shadow-sm">
                <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-700 tw-px-4 tw-py-2 tw-border-b tw-border-gray-200 tw-dark:tw-border-gray-600">
                    <span className="tw-text-xs tw-font-semibold tw-text-gray-600 tw-dark:tw-text-gray-300">
                        The configuration used for this autoedit request.
                    </span>
                </div>
                <div className="tw-p-4">
                    <JsonViewer data={config} className="tw-m-0" />
                </div>
            </div>
        </div>
    )
}

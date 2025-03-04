import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'
import { JsonViewer } from '../components/JsonViewer'

export const NetworkRequestSection: FC<{
    entry: AutoeditRequestDebugState
}> = ({ entry }) => {
    if (!('payload' in entry.state)) {
        return null
    }

    // Extract modelResponse if available
    const modelResponse = 'modelResponse' in entry.state ? entry.state.modelResponse : null

    return (
        <div className="tw-grid tw-grid-cols-2 tw-gap-4">
            {/* Display request URL if available */}
            {modelResponse?.requestUrl && (
                <div className="tw-col-span-2">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Request URL</h4>
                    <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-max-h-60 tw-overflow-y-auto">
                        {modelResponse.requestUrl}
                    </div>
                </div>
            )}

            {/* Display request headers if available */}
            {modelResponse?.requestHeaders && (
                <div className="tw-col-span-2">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Request Headers</h4>
                    <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-max-h-60 tw-overflow-y-auto">
                        {Object.entries(modelResponse.requestHeaders).map(([key, value]) => (
                            <div key={key} className="tw-mb-1">
                                <span className="tw-font-medium">{key}:</span>{' '}
                                {key.toLowerCase() === 'authorization' ? '[REDACTED]' : value}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Display request body if available */}
            {modelResponse?.requestBody && (
                <div className="tw-col-span-2 tw-mt-4">
                    <JsonViewer data={modelResponse.requestBody} title="Request Body" maxHeight="80" />
                </div>
            )}
        </div>
    )
}

export const NetworkResponseSection: FC<{
    entry: AutoeditRequestDebugState
}> = ({ entry }) => {
    if (!('payload' in entry.state)) {
        return null
    }

    // Extract modelResponse if available
    const modelResponse = 'modelResponse' in entry.state ? entry.state.modelResponse : null

    return (
        <div className="tw-grid tw-grid-cols-2 tw-gap-4">
            {/* Display response headers from modelResponse if available */}
            {modelResponse?.responseHeaders && (
                <div className="tw-col-span-2">
                    <h4 className="tw-text-sm tw-font-medium tw-mb-2">Response Headers</h4>
                    <div className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-max-h-60 tw-overflow-y-auto">
                        {Object.entries(modelResponse.responseHeaders).map(([key, value]) => (
                            <div key={key} className="tw-mb-1">
                                <span className="tw-font-medium">{key}:</span>{' '}
                                {key.toLowerCase() === 'authorization' ? '[REDACTED]' : value}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Display full response body if available */}
            {modelResponse?.responseBody && (
                <div className="tw-col-span-2 tw-mt-4">
                    <JsonViewer
                        data={modelResponse.responseBody}
                        title="Full Response Body"
                        maxHeight="80"
                    />
                </div>
            )}
        </div>
    )
}

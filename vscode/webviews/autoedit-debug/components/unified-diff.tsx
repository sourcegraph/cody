import type { FC } from 'react'

import type { GeneratedImageSuggestion } from '../../../src/autoedits/renderer/image-gen'

export const UnifiedDiff: FC<{
    unifiedDiff: GeneratedImageSuggestion
    theme?: 'light' | 'dark'
}> = ({ unifiedDiff, theme = 'dark' }) => {
    return (
        <div className="tw-w-full tw-h-full tw-flex tw-flex-col">
            <div className="tw-overflow-auto tw-flex-1 tw-w-full">
                <img
                    src={unifiedDiff.light}
                    alt="Unified code diff"
                    className="tw-block tw-w-full tw-min-w-full tw-p-5 tw-dark:tw-hidden"
                />
                <img
                    src={unifiedDiff.dark}
                    alt="Unified code diff"
                    className="tw-hidden tw-w-full tw-min-w-full tw-p-5 tw-dark:tw-block"
                />
            </div>
        </div>
    )
}

import { X } from 'lucide-react'
import type { FC } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debugging/debug-store'
import { DISCARD_REASONS } from './utils'

interface DiscardInfoSectionProps {
    entry: AutoeditRequestDebugState
}

export const DiscardInfoSection: FC<DiscardInfoSectionProps> = ({ entry }) => {
    if (
        entry.state.phase !== 'discarded' ||
        !('payload' in entry.state) ||
        !('discardReason' in entry.state.payload)
    ) {
        return null
    }

    return (
        <div className="tw-bg-red-50 tw-dark:tw-bg-red-900/20 tw-p-4 tw-rounded-md tw-border tw-border-red-200 tw-dark:tw-border-red-900/30">
            <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
                <X className="tw-h-4 tw-w-4 tw-text-red-500" />
                <h4 className="tw-font-medium tw-text-red-800 tw-dark:tw-text-red-300">
                    Request Discarded
                </h4>
            </div>
            <p className="tw-text-sm tw-text-red-700 tw-dark:tw-text-red-400">
                Reason:{' '}
                {DISCARD_REASONS[entry.state.payload.discardReason] ||
                    `Unknown (${entry.state.payload.discardReason})`}
            </p>
        </div>
    )
}

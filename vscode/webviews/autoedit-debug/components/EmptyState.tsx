import { FileText } from 'lucide-react'
import type { FC } from 'react'

export const EmptyState: FC = () => {
    return (
        <div className="tw-p-6 tw-text-center tw-text-gray-500 tw-dark:tw-text-gray-400 tw-border tw-border-dashed tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded-md">
            <FileText className="tw-h-12 tw-w-12 tw-mx-auto tw-mb-3 tw-text-gray-400 tw-dark:tw-text-gray-600" />
            <p>
                No auto-edit requests recorded yet. Start typing or moving your cursor to trigger
                auto-edit.
            </p>
        </div>
    )
}

import clsx from 'clsx'
import { Play, Square } from 'lucide-react'
import type { FC } from 'react'

export type SubmitButtonState = 'submittable' | 'emptyEditorValue' | 'waitingResponseComplete'

export const SubmitButton: FC<{
    onClick: () => void
    state?: SubmitButtonState
}> = ({ onClick, state = 'submittable' }) => {
    const inProgress = state === 'waitingResponseComplete'

    return (
        <div className="tw-flex">
            <button
                type="submit"
                onClick={e => {
                    e.preventDefault()
                    onClick()
                }}
                className={clsx(
                    'tw-px-6 tw-py-1',
                    'tw-rounded-full',
                    'tw-w-full tw-relative tw-border tw-border-button-border tw-box-content tw-bg-button-background hover:tw-bg-button-background-hover tw-text-button-foreground',

                    'disabled:tw-bg-button-secondary-background disabled:tw-text-muted-foreground'
                )}
                title={inProgress ? 'Stop' : 'Send'}
            >
                {inProgress ? (
                    <Square className="tw-size-6 tw-fill-current" />
                ) : (
                    <Play className="tw-size-6 tw-fill-current" />
                )}
            </button>
        </div>
    )
}

import { LoaderCircleIcon } from 'lucide-react'
import type { FunctionComponent } from 'react'

export type SubmitButtonDisabled = false | 'emptyEditorValue' | 'isPendingPriorResponse'

export const SubmitButton: FunctionComponent<{
    onClick: (withEnhancedContext: boolean) => void
    isEditorFocused?: boolean

    /** Whether this editor is for a message whose assistant response is in progress. */
    isPendingResponse: boolean

    disabled?: SubmitButtonDisabled
}> = ({ onClick: parentOnClick, isEditorFocused, isPendingResponse, disabled = false }) => {
    return (
        <>
            <button
                type="submit"
                className="tw-rounded-full tw-flex tw-items-center tw-justify-center tw-bg-primary tw-w-10 tw-h-10"
                // tooltip="Send"
                onClick={() => parentOnClick(true)}
                aria-label="Send"
                disabled={disabled !== false}
                tabIndex={-1} // press Enter to invoke, doesn't need to be tabbable
            >
                {disabled === 'isPendingPriorResponse' ? (
                    <LoaderCircleIcon size={16} />
                ) : (
                    <svg
                        width="7"
                        height="8"
                        viewBox="0 0 7 8"
                        fill="currentColor"
                        className="tw-translate-x-[.04rem]"
                    >
                        <title>Send</title>
                        <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M6.72789 3.54579L1.4092 0V0.250867L1.23764 0.136491C1.10978 0.0512528 0.945385 0.043306 0.809903 0.115814C0.674421 0.188322 0.589844 0.329514 0.589844 0.483178V7.57476C0.589844 7.72842 0.674421 7.86961 0.809903 7.94212C0.945385 8.01463 1.10978 8.00668 1.23764 7.92145L6.55632 4.37566C6.67224 4.29838 6.74186 4.16828 6.74186 4.02897C6.74186 3.88965 6.67224 3.75956 6.55632 3.68228L6.53973 3.67122L6.72789 3.54579Z"
                        />
                    </svg>
                )}
            </button>
        </>
    )
}

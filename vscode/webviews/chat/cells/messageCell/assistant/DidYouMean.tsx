interface DidYouMeanNoticeProps {
    query: string
    disabled: boolean
    switchToSearch: (query: string) => void
}

export const DidYouMeanNotice = (props: DidYouMeanNoticeProps) => {
    // TODO(camdencheek): remove the disable functionality once SRCH-1484 is fixed
    const { query, disabled, switchToSearch } = props

    return (
        <div className="tw-border-b tw-border-b-muted tw-p-4 tw-text-sm md:tw-text-md tw-leading-tight">
            Did you mean to search{' '}
            <button
                type="button"
                onClick={() => !disabled && switchToSearch(query)}
                className={`tw-italic tw-font-semibold tw-border-0 tw-bg-transparent tw-p-0 ${
                    disabled ? 'tw-text-text-disabled' : 'tw-text-link'
                }`}
                disabled={disabled}
            >
                {query}
            </button>
            ?
        </div>
    )
}

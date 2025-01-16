interface DidYouMeanNoticeProps {
    query: string
    disabled: boolean
    switchToSearch: (query: string) => void
}

export const DidYouMeanNotice = (props: DidYouMeanNoticeProps) => {
    const { query, disabled, switchToSearch } = props

    return (
        <div className="tw-border tw-border-border tw-bg-input-background tw-rounded-md tw-p-4">
            Did you mean to search{' '}
            <button
                type="button"
                onClick={() => !disabled && switchToSearch(query)}
                className={`tw-italic tw-font-bold tw-border-0 tw-bg-transparent tw-p-0 ${
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

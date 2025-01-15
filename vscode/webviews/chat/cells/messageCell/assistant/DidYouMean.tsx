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
            <span
                onClick={() => !disabled && switchToSearch(query)}
                onKeyDown={() => !disabled && switchToSearch(query)}
                className={`tw-italic tw-font-bold ${
                    disabled ? 'tw-text-text-disabled' : 'tw-text-link tw-cursor-pointer'
                }`}
                role="button"
                tabIndex={disabled ? -1 : 0}
            >
                {query}
            </span>
            ?
        </div>
    )
}

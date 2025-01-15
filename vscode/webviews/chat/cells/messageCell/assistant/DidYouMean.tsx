interface DidYouMeanNoticeProps {
    query: string
    disabled: boolean
    switchToSearch: (query: string) => void
}

export const DidYouMeanNotice = (props: DidYouMeanNoticeProps) => {
    const { query } = props

    return (
        <div className="tw-bg-blue-0">
            Did you mean to search <code>{query}</code>?
        </div>
    )
}

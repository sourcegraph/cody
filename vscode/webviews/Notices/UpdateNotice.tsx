import { Notice, NoticeProps } from './Notice'

import styles from './UpdateNotice.module.css'

interface UpdateNoticeProps {
    version: string
    onDismiss: NoticeProps['onDismiss']
}

export const UpdateNotice: React.FunctionComponent<UpdateNoticeProps> = ({ version, onDismiss }) => (
    <Notice
        icon={<Icon />}
        title={`Cody updated to ${version}!`}
        /* At the top of each GitHub release notes we include a link to the
           release's blog post for that point release (e.g. 0.8.x). So even
           if they update from 0.7.1 -> 0.8.3 they'll have a blog post link handy */
        linkHref={`https://github.com/sourcegraph/cody/releases/tag/vscode-v${version}`}
        linkText="See what’s new →"
        linkTarget="_blank"
        onDismiss={onDismiss}
    />
)

export const Icon: React.FunctionComponent = () => (
    <svg className={styles.icon} width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M10.3714 9.37143L9 14L7.62857 9.37143L3 8L7.62857 6.62857L9 2L10.3714 6.62857L15 8L10.3714 9.37143Z" />
        <path d="M21 12L17 14.2L13 12L15.2 16L13 20L17 17.8L21 20L18.8 16L21 12Z" />
        <path d="M8.3 19L10 16L7 17.7L4 16L5.7 19L4 22L7 20.3L10 22L8.3 19Z" />
    </svg>
)

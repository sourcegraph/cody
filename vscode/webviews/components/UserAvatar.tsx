import { CodyIDE } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import type { FunctionComponent } from 'react'
import type { UserAccountInfo } from '../Chat'
import styles from './UserAvatar.module.css'

interface Props {
    user: NonNullable<UserAccountInfo['user']>
    size: number
    className?: string
    ide?: CodyIDE
}

/**
 * UserAvatar displays the avatar of a user.
 */
export const UserAvatar: FunctionComponent<Props> = ({ user, size, className, ide }) => {
    const title = user.displayName || user.username
    const altText = ide === CodyIDE.VSCode ? `Avatar for ${user.username}` : ''

    if (user?.avatarURL) {
        let url = user.avatarURL
        try {
            const urlObject = new URL(user.avatarURL)
            // Add a size param for non-data URLs. This will resize the image if it is hosted on
            // certain places like Gravatar and GitHub.
            if (size && !user.avatarURL.startsWith('data:')) {
                const highDPISize = size * 2
                urlObject.searchParams.set('s', highDPISize.toString())
            }
            url = urlObject.href
        } catch {
            // noop
        }

        return (
            <img
                className={clsx(styles.userAvatar, className)}
                src={url}
                role="presentation"
                title={title}
                alt={altText}
            />
        )
    }

    return (
        <div title={title} className={clsx(styles.userAvatarText, className)}>
            <span className={styles.initials}>
                {getInitials(user?.displayName || user?.username || '')}
            </span>
        </div>
    )
}

function getInitials(fullName: string): string {
    const names = fullName.split(' ')
    const initials = names.map(name => name.charAt(0).toUpperCase())
    if (initials.length > 1) {
        return `${initials[0]}${initials.at(-1)}`
    }
    return initials[0]
}

import { clsx } from 'clsx'
import type { FunctionComponent } from 'react'
import type { UserAccountInfo } from '../Chat'
import styles from './UserAvatar.module.css'

interface Props {
    user: NonNullable<UserAccountInfo['user']>
    size: number
    sourcegraphGradientBorder?: boolean
    className?: string
}

const SOURCEGRAPH_GRADIENT_BORDER_SIZE = 1 /* px */

/**
 * UserAvatar displays the avatar of a user.
 */
export const UserAvatar: FunctionComponent<Props> = ({
    user,
    size,
    sourcegraphGradientBorder,
    className,
}) => {
    const inner = (
        <InnerUserAvatar
            user={user}
            size={sourcegraphGradientBorder ? size - SOURCEGRAPH_GRADIENT_BORDER_SIZE * 2 : size}
            className={sourcegraphGradientBorder ? undefined : className}
        />
    )
    return sourcegraphGradientBorder ? (
        <div className={clsx(styles.sourcegraphGradientBorder, 'tw-inline-flex', className)}>
            {inner}
        </div>
    ) : (
        inner
    )
}

const InnerUserAvatar: FunctionComponent<Omit<Props, 'sourcegraphGradientBorder'>> = ({
    user,
    size,
    className,
}) => {
    const title = user.displayName || user.username

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
                className={styles.userAvatar}
                src={url}
                role="presentation"
                title={title}
                alt={`Avatar for ${user.username}`}
                width={size}
                height={size}
            />
        )
    }
    return (
        <div
            title={title}
            className={clsx(styles.userAvatar, className)}
            style={{ width: `${size}px`, height: `${size}px` }}
        >
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

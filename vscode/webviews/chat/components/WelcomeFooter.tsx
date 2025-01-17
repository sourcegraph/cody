import type { CodyIDE } from '@sourcegraph/cody-shared'
import { QuickStart } from './QuickStart'
import styles from './WelcomeFooter.module.css'

import { BookOpenText, type LucideProps, MessageCircleQuestion } from 'lucide-react'
import type { ForwardRefExoticComponent } from 'react'

interface ChatViewLink {
    icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'>>
    text: string
    url: string
}

const chatLinks: ChatViewLink[] = [
    {
        icon: BookOpenText,
        text: 'Documentation',
        url: 'https://sourcegraph.com/docs/cody',
    },
    {
        icon: MessageCircleQuestion,
        text: 'Help and Support',
        url: 'https://community.sourcegraph.com/',
    },
]

export default function WelcomeFooter({ IDE }: { IDE: CodyIDE }) {
    return (
        <div className={styles.welcomeFooter}>
            <QuickStart />
            <div className={styles.links}>
                {chatLinks.map(link => (
                    <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tw-flex tw-flex-row tw-gap-3 tw-items-center tw-text-muted-foreground"
                    >
                        <link.icon size={16} />
                        {link.text}
                    </a>
                ))}
            </div>
        </div>
    )
}

import { CodyIDE } from '@sourcegraph/cody-shared'
import styles from './WelcomeFooter.module.css'

import {
    AtSignIcon,
    BookOpenText,
    type LucideProps,
    MessageCircleQuestion,
    MessageSquarePlus,
    TextSelect,
    X,
    Zap,
} from 'lucide-react'
import type { ForwardRefExoticComponent } from 'react'
import { useState } from 'react'

interface ChatViewTip {
    message: string
    icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'>>
    vsCodeOnly: boolean
}

interface ChatViewLink {
    icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'>>
    text: string
    url: string
}

const chatTips: ChatViewTip[] = [
    {
        message: 'Type @ to add context to your chat',
        icon: AtSignIcon,
        vsCodeOnly: true,
    },
    {
        message: 'Start a new chat with ⇧ ⌥ L or switch to chat with ⌥ /',
        icon: MessageSquarePlus,
        vsCodeOnly: false,
    },
    {
        message: 'To add code context from an editor, right click and use Add to Cody Chat',
        icon: TextSelect,
        vsCodeOnly: true,
    },
]

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
    const [showTipsOverlay, setShowTipsOverlay] = useState(false)
    const examples = [
        {
            input: '=useCallBack(',
            description: 'Deterministically find symbols',
        },
        {
            input: '"// TODO"',
            description: 'Find string literals',
        },
        {
            input: 'How does this file handle error cases?',
            description: '@-mention repos and files to include in search or chat',
        },
    ]

    const allExamples = [
        ...examples,
        {
            title: 'Combine search and chat for power usage',
            examples: [
                {
                    input: 'HttpError',
                    description: 'Start with a search query',
                },
                {
                    input: 'Analyze these error handling implementations and explain our retry and timeout strategy',
                    description: 'Follow-up with a question about the results returned',
                    maxWidth: '320px',
                },
            ],
        },
    ]

    function tips() {
        return chatTips.map((tip, key) => {
            const Icon = tip.icon
            if (tip.vsCodeOnly && IDE !== CodyIDE.VSCode) {
                return null
            }
            return (
                <div key={`tip-${key + 1}`} className={styles.item}>
                    <Icon className="tw-w-8 tw-h-8 tw-shrink-0" strokeWidth={1.25} />
                    <div className="tw-text-muted-foreground">{tip.message}</div>
                </div>
            )
        })
    }

    function links() {
        return chatLinks.map((link, key) => {
            const Icon = link.icon
            return (
                <div className={styles.item} key={`link-${key + 1}`}>
                    <Icon className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                    <a href={link.url} className={styles.link} rel="noreferrer" target="_blank">
                        {link.text}
                    </a>
                </div>
            )
        })
    }

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            setShowTipsOverlay(true)
        }
    }

    const handleOverlayKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            setShowTipsOverlay(false)
        }
    }

    const handleOverlayClick = (event: React.MouseEvent) => {
        if (event.target === event.currentTarget) {
            setShowTipsOverlay(false)
        }
    }

    return (
        <div className={styles.welcomeFooter}>
            <div className={`${styles.cheatsheet} tw-mx-auto`} style={{ maxWidth: '768px' }}>
                <div className="tw-flex tw-items-center tw-gap-4 tw-font-medium tw-text-foreground md:tw-text-base">
                    <Zap className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                    Quick Start
                </div>
                <div className={styles.examples}>
                    {examples.map(example => (
                        <div key={`example-${example.input}`} className={styles.example}>
                            <div
                                className={`${styles.exampleInput} tw-py-1 tw-px-2 md:tw-py-2 md:tw-px-4 md:tw-text-md`}
                            >
                                {example.input}
                            </div>
                            <div className="tw-text-muted-foreground tw-text-sm md:tw-text-md tw-py-2">
                                {example.description}
                            </div>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    className="tw-text-md tw-my-2 md:tw-my-4 tw-px-4 tw-py-2 tw-border tw-border-muted tw-rounded-md hover:tw-bg-muted tw-mt-2"
                    onClick={() => setShowTipsOverlay(true)}
                    onKeyDown={handleKeyDown}
                >
                    More tips
                </button>
            </div>
            <div className={`${styles.links} tw-mx-auto`} style={{ maxWidth: '768px' }}>
                {links()}
            </div>
            {showTipsOverlay && (
                <div
                    className="tw-fixed tw-inset-0 tw-bg-black/50 tw-flex tw-items-center tw-justify-center tw-p-4"
                    onClick={handleOverlayClick}
                    onKeyDown={handleOverlayKeyDown}
                    role="button"
                    tabIndex={0}
                >
                    <div
                        className="tw-bg-background tw-p-8 tw-rounded-lg tw-max-w-2xl tw-w-full tw-max-h-[80vh] tw-overflow-y-auto"
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="tw-flex tw-justify-between tw-items-center tw-mb-2">
                            <div className="tw-flex tw-items-center tw-gap-4 tw-font-medium tw-text-foreground md:tw-text-base">
                                <Zap className="tw-w-8 tw-h-8" strokeWidth={1.25} />
                                Quick Start
                            </div>
                            <button
                                type="button"
                                className="tw-p-1 tw-rounded-full hover:tw-bg-muted"
                                onClick={() => setShowTipsOverlay(false)}
                                onKeyDown={handleOverlayKeyDown}
                                aria-label="Close quick start guide"
                            >
                                <X className="tw-w-8 tw-h-8" />
                            </button>
                        </div>
                        <div className={styles.cheatsheet}>
                            <div className={styles.examples}>
                                {allExamples.map(example => (
                                    <div
                                        key={`overlay-example-${
                                            'input' in example ? example.input : example.title
                                        }`}
                                        className={styles.example}
                                    >
                                        {'title' in example && (
                                            <h4 className="tw-text-sm tw-font-medium tw-mb-2 tw-text-foreground tw-pt-8 tw-border-t tw-border-muted">
                                                {example.title}
                                            </h4>
                                        )}
                                        {'examples' in example ? (
                                            <div className="tw-flex tw-flex-row tw-flex-wrap tw-gap-8">
                                                {example.examples.map(ex => (
                                                    <div
                                                        key={`nested-example-${ex.input}`}
                                                        className={styles.example}
                                                        style={
                                                            ex.maxWidth
                                                                ? { maxWidth: ex.maxWidth }
                                                                : undefined
                                                        }
                                                    >
                                                        <div
                                                            className={`${styles.exampleInput} tw-py-1 tw-px-2 md:tw-py-2 md:tw-px-4 md:tw-text-md`}
                                                        >
                                                            {ex.input}
                                                        </div>
                                                        <div className="tw-text-muted-foreground tw-text-sm md:tw-text-md tw-py-2">
                                                            {ex.description}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <>
                                                <div
                                                    className={`${styles.exampleInput} tw-py-1 tw-px-2 md:tw-py-2 md:tw-px-4 md:tw-text-md`}
                                                >
                                                    {example.input}
                                                </div>
                                                <div className="tw-text-muted-foreground tw-text-sm md:tw-text-md tw-py-2">
                                                    {example.description}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}{' '}
                            </div>
                            <div className={styles.tips}>{tips()}</div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

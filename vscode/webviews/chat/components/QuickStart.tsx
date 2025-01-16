import {
    AtSignIcon,
    ChevronDown,
    ChevronRight,
    type LucideProps,
    MessageSquarePlus,
    TextSelect,
    X,
    Zap,
} from 'lucide-react'
import type { ForwardRefExoticComponent } from 'react'
interface ChatViewTip {
    message: string
    icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'>>
    vsCodeOnly: boolean
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

import { useState } from 'react'
import styles from './WelcomeFooter.module.css'
interface Example {
    input: string
    description: string
    maxWidth?: string
}

interface ExampleGroup {
    title?: string
    input?: string
    description?: string
    examples?: Example[]
}

export function QuickStart() {
    const [showTipsOverlay, setShowTipsOverlay] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(false)

    const examples: Example[] = [
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
            description: 'Ask questions in natural language',
        },
    ]

    const allExamples: ExampleGroup[] = [
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

    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed)
    }

    const handleCollapseKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            toggleCollapse()
        }
    }

    return (
        <>
            <div className="tw-mx-auto tw-my-2 tw-flex tw-max-w-3xl tw-max-w-[768px] tw-flex-col tw-py-2 tw-text-sm tw-text-muted-foreground">
                <div
                    className={`tw-flex tw-items-center tw-justify-between tw-gap-4 tw-text-md tw-font-medium tw-text-foreground tw-p-4 md:tw-text-base ${
                        isCollapsed ? 'hover:tw-bg-muted tw-cursor-pointer tw-rounded-lg' : ''
                    }`}
                    onClick={isCollapsed ? toggleCollapse : undefined}
                    onKeyDown={isCollapsed ? handleCollapseKeyDown : undefined}
                    role="button"
                    tabIndex={isCollapsed ? 0 : undefined}
                >
                    <div className="tw-flex tw-items-center tw-gap-4 tw-text-md">
                        <Zap className="tw-h-8 tw-w-8" strokeWidth={1.25} />
                        Quick Start
                    </div>
                    <button
                        type="button"
                        onClick={toggleCollapse}
                        onKeyDown={handleCollapseKeyDown}
                        className="tw-p-1 hover:tw-bg-muted tw-rounded-full"
                        aria-label={isCollapsed ? 'Expand quick start' : 'Collapse quick start'}
                    >
                        {isCollapsed ? (
                            <ChevronRight className="tw-h-8 tw-w-8 tw-text-muted-foreground" />
                        ) : (
                            <ChevronDown className="tw-h-8 tw-w-8 tw-text-muted-foreground" />
                        )}
                    </button>
                </div>
                <div
                    className={`tw-overflow-hidden tw-transition-[max-height] tw-duration-300 tw-ease-in-out ${
                        isCollapsed ? 'tw-max-h-0' : 'tw-max-h-[1000px]'
                    }`}
                >
                    <div className={styles.examples}>
                        {examples.map(example => (
                            <div key={`example-${example.input}`} className={styles.example}>
                                <div
                                    className={`${styles.exampleInput} tw-px-4 tw-py-2 md:tw-px-4 md:tw-py-2 md:tw-text-md`}
                                >
                                    {example.input}
                                </div>
                                <div className="tw-py-2 tw-text-sm tw-text-muted-foreground md:tw-text-md">
                                    {example.description}
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="tw-m-4 tw-rounded-md tw-border tw-border-muted tw-px-4 tw-py-2 tw-text-md hover:tw-bg-muted"
                        onClick={() => setShowTipsOverlay(true)}
                        onKeyDown={handleKeyDown}
                    >
                        More tips
                    </button>
                </div>
            </div>

            {/* Overlay */}
            {showTipsOverlay && (
                <div
                    className="tw-fixed tw-inset-0 tw-flex tw-items-center tw-justify-center tw-bg-black/20 tw-p-4 tw-animate-[fadeIn_0.2s_ease-in-out]"
                    onClick={handleOverlayClick}
                    onKeyDown={handleOverlayKeyDown}
                    role="presentation"
                >
                    <div
                        className="tw-w-full tw-max-h-[90vh] tw-max-w-2xl tw-overflow-y-auto tw-rounded-xl tw-bg-background tw-p-12 tw-animate-[slideUp_0.2s_ease-in-out] tw-shadow-lg"
                        role="dialog"
                        aria-modal="true"
                        style={{
                            animation: 'fadeIn 0.25s ease-in-out, slideUp 0.25s ease-in-out',
                        }}
                    >
                        {/* Overlay content */}
                        <div className="tw-flex tw-items-center tw-justify-between">
                            <div className="tw-flex tw-items-center tw-gap-4 tw-font-medium tw-text-foreground text-md md:tw-text-base">
                                <Zap className="tw-h-8 tw-w-8" strokeWidth={1.25} />
                                Quick Start
                            </div>
                            <button
                                type="button"
                                className="tw-rounded-full tw-p-1 hover:tw-bg-muted"
                                onClick={() => setShowTipsOverlay(false)}
                                onKeyDown={handleOverlayKeyDown}
                                aria-label="Close quick start guide"
                            >
                                <X className="tw-h-8 tw-w-8" />
                            </button>
                        </div>
                        <div className={styles.cheatsheet}>
                            <div className={styles.examples}>
                                {/* Render all examples including nested ones */}
                                {allExamples.map(example => (
                                    <div
                                        key={`overlay-example-${
                                            'input' in example ? example.input : example.title
                                        }`}
                                        className={styles.example}
                                    >
                                        {'title' in example && (
                                            <h4 className="tw-mb-2 tw-border-t tw-border-muted tw-pt-8 tw-text-md tw-font-medium tw-text-foreground">
                                                {example.title}
                                            </h4>
                                        )}
                                        {'examples' in example ? (
                                            <div className="tw-flex tw-flex-row tw-flex-wrap tw-gap-8">
                                                {example.examples?.map(ex => (
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
                                                            className={`${styles.exampleInput} tw-px-4 tw-py-2 md:tw-px-4 md:tw-py-2 md:tw-text-md`}
                                                        >
                                                            {ex.input}
                                                        </div>
                                                        <div className="tw-py-2 tw-text-sm tw-text-muted-foreground md:tw-text-md">
                                                            {ex.description}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <>
                                                <div
                                                    className={`${styles.exampleInput} tw-px-4 tw-py-2 md:tw-px-4 md:tw-py-2 md:tw-text-md`}
                                                >
                                                    {example.input}
                                                </div>
                                                <div className="tw-py-2 tw-text-sm tw-text-muted-foreground md:tw-text-md">
                                                    {example.description}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="tw-mt-8 tw-border-t tw-border-muted tw-pt-12">
                                <div className="tw-grid tw-gap-4">
                                    {chatTips.map(tip => (
                                        <div
                                            key={tip.message}
                                            className="tw-flex tw-items-center tw-gap-3"
                                        >
                                            <tip.icon className="tw-h-6 tw-w-6 tw-shrink-0" />
                                            <span className="tw-text-md tw-text-muted-foreground">
                                                {tip.message}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

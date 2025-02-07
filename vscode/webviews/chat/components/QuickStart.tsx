import { useState } from 'react'
import styles from './QuickStart.module.css'

import {
    Minimize,
    Expand,
    Zap,
} from 'lucide-react'
import classNames from 'classnames'

interface Example {
    input: string
    description: string
    maxWidth?: string
    step?: number
}

interface ExampleGroup {
    title: string
    examples: Example[]
}

interface QuickStartProps {
    updateInput: (exampleText: string) => void
}

export function QuickStart({ updateInput }: QuickStartProps): JSX.Element | null {
    const [isCollapsed, setIsCollapsed] = useState(() => {
        const saved = localStorage.getItem('quickStartCollapsed')
        return saved ? JSON.parse(saved) : false
    })

    const examples: Example[] = [
        {
            input: '= useCallback(',
            description: 'Deterministically find symbols',
        },
        {
            input: '"I love Sourcegraph"',
            description: 'Find string literals',
        },
        {
            input: 'How does this file handle error cases?',
            description: 'Ask questions in natural language',
        },
    ]

    const allExamples: (Example | ExampleGroup)[] = [
        ...examples,
        {
            title: 'Combine search and chat for power usage',
            examples: [
                {
                    step: 1,
                    input: 'HttpError',
                    description: 'Start with a search query',
                },
                {
                    step: 2,
                    input: 'Analyze these error handling implementations and explain our retry and timeout strategy',
                    description: 'Follow-up with a question about the results returned',
                    maxWidth: '320px',
                },
            ],
        },
    ]

    const toggleCollapse = () => {
        setIsCollapsed((prevState: boolean) => {
            const newState = !prevState
            localStorage.setItem('quickStartCollapsed', JSON.stringify(newState))
            return newState
        })
    }

    const handleCollapseKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            toggleCollapse()
        }
    }

    return (
        <>
            <div
                className={styles.container}
                tabIndex={0}
            >
                <div
                    className={classNames(
                        styles.qsHeaderContainer,
                        "tw-rounded-xl tw-animate-[slideUp_0.2s_ease-in-out] tw-shadow-lg")}
                    role="dialog"
                    aria-modal="true"
                >
                    <div className={styles.qsHeader}>
                        <div
                            className={styles.header}
                        >
                            <Zap className="tw-h-8 tw-w-8" strokeWidth={1.25} />
                            {/* TODO (jason): won't listen to spacing. shouldn't use nbsp */}
                            &nbsp;
                            <div>Quick Start</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => toggleCollapse()}
                            onKeyDown={handleCollapseKeyDown}
                            aria-label="Close quick start guide"
                        >
                            {isCollapsed
                                ? (
                                    <div className={styles.expandButton}>
                                        <Expand className="tw-h-8 tw-w-8" />
                                        <span>Expand</span>
                                    </div>
                                ) : (
                                    <div className={styles.expandButton}>
                                        <Minimize className="tw-h-8 tw-w-8" />
                                        <span>Minimize</span>
                                    </div>
                                )}
                        </button>
                    </div>
                    {!isCollapsed && (
                        <div className={styles.examplesContainer}>
                            {allExamples.map((example, i) => {
                                return (
                                    <>
                                        {'title' in example &&
                                            <div className={styles.exampleGroupTitle}>{example.title}</div>
                                        }
                                        {'input' in example ? (
                                            <div>regular example</div>
                                        ) : (
                                            <div>nested Example</div>
                                        )}
                                    </>
                                )
                            })}
                            Start over
                        </div>
                    )}
                </div>
            </div >
        </>
    )
}

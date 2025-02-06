import { useState } from 'react'
import styles from './QuickStart.module.css'

import {
    Minimize,
    Expand,
    Zap,
} from 'lucide-react'

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
                className={styles.quickstartContainer}
                tabIndex={0}
            >
                <div
                    className="
                        tw-w-full
                        tw-max-h-[90vh]
                        tw-rounded-xl
                        tw-bg-background
                        tw-p-4
                        tw-animate-[slideUp_0.2s_ease-in-out]
                        tw-shadow-lg"
                    role="dialog"
                    aria-modal="true"
                    style={{
                        animation: 'fadeIn 0.25s ease-in-out, slideUp 0.25s ease-in-out',
                    }}
                >
                    <div className={styles.quickstartHeader}>
                        <div
                            className="tw-flex tw-items-center tw-gap-4 tw-font-medium tw-text-foreground text-md md:tw-text-base"
                            onClick={() => {
                                toggleCollapse()
                            }}
                        >
                            <Zap className="tw-h-8 tw-w-8" strokeWidth={1.25} />
                            Quick Start
                        </div>
                        <button
                            type="button"
                            className="tw-rounded-full tw-p-1 hover:tw-bg-muted"
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
                        <div className={styles.cheatsheet}>
                            <div className={styles.examples}>
                                {/* Render all examples including nested ones */}
                                {allExamples.map(example => (
                                    <div
                                        key={`overlay-example-${'input' in example ? example.input : example.title
                                            }`}
                                        className={styles.example}
                                    >
                                        {'title' in example && (
                                            <h4 className="tw-mb-2 tw-pt-8 tw-text-md tw-font-medium tw-text-foreground">
                                                {example.title}
                                            </h4>
                                        )}
                                        {'examples' in example ? (
                                            <div className="tw-flex tw-flex-row tw-flex-wrap tw-gap-6">
                                                {example.examples?.map((ex) => (
                                                    <div
                                                        key={`nested-example-${ex.input}`}
                                                        className={styles.exampleSteps}
                                                        style={
                                                            ex.maxWidth
                                                                ? { maxWidth: ex.maxWidth }
                                                                : undefined
                                                        }
                                                    >
                                                        <p>step {ex.step}</p>
                                                        <div>
                                                            <div
                                                                className={`${styles.exampleInput} tw-px-4 tw-py-2 md:tw-px-4 md:tw-py-2 md:tw-text-md`}
                                                                onClick={() => updateInput(ex.input)}
                                                            >
                                                                {ex.input}
                                                            </div>
                                                            <div className="tw-py-2 tw-text-sm tw-text-muted-foreground md:tw-text-md">
                                                                {ex.description}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <>
                                                <div
                                                    className={`${styles.exampleInput} tw-px-4 tw-py-2 md:tw-px-4 md:tw-py-2 md:tw-text-md`}
                                                    onClick={() => updateInput(example.input)}
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
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

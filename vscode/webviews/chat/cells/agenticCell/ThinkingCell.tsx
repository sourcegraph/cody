import type { ProcessingStep } from '@sourcegraph/cody-shared'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'

interface Props {
    processes?: ProcessingStep[]
}

export const ThinkingCell: React.FC<Props> = ({ processes }) => {
    if (!processes?.some(p => p.type === 'thought')) {
        return null
    }

    const [isExpanded, setIsExpanded] = useState(true)

    const toggleExpansion = () => {
        setIsExpanded(!isExpanded)
    }

    return (
        <div className="tw-py-2 tw-px-4 tw-w-full">
            {processes
                ?.filter(p => p.type === 'thought' && p.content)
                ?.map(p => (
                    <div
                        key={p.id}
                        className="tw-px-4 tw-border tw-border-muted tw-rounded-lg tw-shadow-lg"
                    >
                        <button
                            className="tw-w-full tw-px-4 tw-py-2 tw-flex tw-justify-between tw-items-center tw-text-left"
                            onClick={toggleExpansion}
                            aria-expanded={isExpanded}
                            aria-controls="thinking-process-content"
                            type="button"
                        >
                            <span className="tw-text-md tw-font-semibold">Thinking...</span>
                            {isExpanded ? (
                                <ChevronUp className="tw-h-5 tw-w-5" size={16} />
                            ) : (
                                <ChevronDown className="tw-h-5 tw-w-5" size={16} />
                            )}
                        </button>
                        <div
                            id="thinking-process-content"
                            className={`tw-px-4 tw-overflow-hidden tw-transition-all tw-duration-300 tw-ease-in-out ${
                                isExpanded ? 'tw-max-h-screen tw-py-1' : 'tw-max-h-0'
                            }`}
                        >
                            <p className="tw-whitespace-pre-wrap tw-pb-4 tw-text-muted-foreground">
                                {p?.content}
                            </p>
                        </div>
                    </div>
                ))}
        </div>
    )
}

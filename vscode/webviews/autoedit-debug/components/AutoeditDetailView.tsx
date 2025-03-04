import * as TabsPrimitive from '@radix-ui/react-tabs'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { FC } from 'react'
import { useState } from 'react'

import type { AutoeditRequestDebugState } from '../../../src/autoedits/debug-panel/debug-store'
import { Badge } from '../../components/shadcn/ui/badge'
import { Button } from '../../components/shadcn/ui/button'

import { AutoeditDataSDK } from '../autoedit-data-sdk'
import { getStatusColor } from '../autoedit-ui-utils'
import { AutoeditsConfigSection } from '../sections/AutoeditsConfigSection'
import { ContextInfoSection } from '../sections/ContextInfoSection'
import { NetworkRequestSection, NetworkResponseSection } from '../sections/NetworkRequestSection'
import { PromptSection } from '../sections/PromptSection'
import { TimelineSection } from '../sections/TimelineSection'
import { SideBySideDiff } from './side-by-side-diff/SideBySideDiff'

export const AutoeditDetailView: FC<{
    entry: AutoeditRequestDebugState
    onPrevious: () => void
    onNext: () => void
    onClose: () => void
    hasPrevious: boolean
    hasNext: boolean
}> = ({ entry, onPrevious, onNext, onClose, hasPrevious, hasNext }) => {
    const [activeTab, setActiveTab] = useState('timeline')

    // Extract all relevant data in one place using the SDK
    const { phase, filePath, discardReason, position, prediction, codeToRewrite, triggerKind } =
        AutoeditDataSDK.extractAutoeditData(entry)

    return (
        <div className="tw-flex tw-flex-col tw-gap-6">
            {/* Header with navigation */}
            <div className="tw-flex tw-flex-col tw-gap-4">
                <div className="tw-flex tw-items-center tw-justify-between">
                    <div className="tw-flex tw-items-center tw-gap-2">
                        <div className="tw-font-mono tw-text-sm tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-px-2 tw-py-0.5 tw-rounded">
                            {entry.state.requestId}
                        </div>
                        <Badge className={getStatusColor(phase)}>{phase}</Badge>
                        <span className="tw-text-xs tw-text-gray-500 tw-dark:tw-text-gray-400">
                            {triggerKind}
                        </span>
                    </div>

                    <div className="tw-flex tw-items-center tw-gap-2">
                        <Button
                            size="icon"
                            variant="outline"
                            onClick={onPrevious}
                            disabled={!hasPrevious}
                            className="tw-h-8 tw-w-8"
                        >
                            <ChevronLeft className="tw-h-4 tw-w-4" />
                            <span className="tw-sr-only">Previous</span>
                        </Button>
                        <Button
                            size="icon"
                            variant="outline"
                            onClick={onNext}
                            disabled={!hasNext}
                            className="tw-h-8 tw-w-8"
                        >
                            <ChevronRight className="tw-h-4 tw-w-4" />
                            <span className="tw-sr-only">Next</span>
                        </Button>
                        <Button
                            size="icon"
                            variant="outline"
                            onClick={onClose}
                            title="Close detail view"
                            className="tw-h-8 tw-w-8"
                        >
                            <X className="tw-h-4 tw-w-4" />
                            <span className="tw-sr-only">Close</span>
                        </Button>
                    </div>
                </div>

                <div>
                    <h2 className="tw-text-lg tw-font-semibold tw-truncate">
                        {filePath}
                        {position ? `:${position?.line + 1}:${position?.character + 1}` : ''}
                    </h2>

                    {/* Diff View Section */}
                    {entry.sideBySideDiffDecorationInfo && (
                        <div className="tw-mt-8">
                            <SideBySideDiff
                                sideBySideDiffDecorationInfo={entry.sideBySideDiffDecorationInfo}
                                languageId={entry.state.payload.languageId}
                            />
                        </div>
                    )}

                    {/* Prediction text */}
                    {!entry.sideBySideDiffDecorationInfo && prediction && (
                        <div className="tw-mt-4 tw-p-4 tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded">
                            <h4 className="tw-text-md tw-font-semibold tw-mb-3">Prediction Text</h4>
                            <pre className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-overflow-auto tw-max-h-[200px]">
                                {prediction}
                            </pre>
                        </div>
                    )}

                    {/* Code to rewrite */}
                    {!entry.sideBySideDiffDecorationInfo && codeToRewrite && (
                        <div className="tw-mt-4 tw-p-4 tw-border tw-border-gray-200 tw-dark:tw-border-gray-700 tw-rounded">
                            <h4 className="tw-text-md tw-font-semibold tw-mb-3">Code to Rewrite</h4>
                            <pre className="tw-bg-gray-100 tw-dark:tw-bg-gray-800 tw-p-3 tw-rounded tw-text-xs tw-overflow-auto tw-max-h-[200px]">
                                {codeToRewrite}
                            </pre>
                        </div>
                    )}
                </div>
            </div>

            {/* Discard warning if applicable */}
            {discardReason && (
                <div className="tw-bg-red-50 tw-dark:tw-bg-red-900/20 tw-p-4 tw-rounded-md tw-border tw-border-red-200 tw-dark:tw-border-red-900/30">
                    <div className="tw-flex tw-items-center tw-gap-2 tw-mb-2">
                        <X className="tw-h-4 tw-w-4 tw-text-red-500" />
                        <h4 className="tw-font-medium tw-text-red-800 tw-dark:tw-text-red-300">
                            Request Discarded
                        </h4>
                    </div>
                    <p className="tw-text-sm tw-text-red-700 tw-dark:tw-text-red-400">
                        Reason: {discardReason}
                    </p>
                </div>
            )}

            {/* Tabbed content */}
            <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab} className="tw-w-full">
                <div className="tw-border-b tw-border-gray-200 tw-dark:tw-border-gray-700">
                    <TabsPrimitive.List className="tw-flex tw-flex-wrap tw--mb-px">
                        <TabButton value="timeline" activeTab={activeTab}>
                            Timeline
                        </TabButton>
                        <TabButton value="prompt" activeTab={activeTab}>
                            Prompt
                        </TabButton>
                        <TabButton value="context" activeTab={activeTab}>
                            Context
                        </TabButton>
                        <TabButton value="network-request" activeTab={activeTab}>
                            Request
                        </TabButton>
                        <TabButton value="network-response" activeTab={activeTab}>
                            Response
                        </TabButton>
                        <TabButton value="config" activeTab={activeTab}>
                            Config
                        </TabButton>
                    </TabsPrimitive.List>
                </div>

                <div className="tw-pt-4 tw-p-y-4">
                    <TabsPrimitive.Content value="timeline" className="tw-space-y-8">
                        <TimelineSection entry={entry} />
                    </TabsPrimitive.Content>

                    <TabsPrimitive.Content value="prompt" className="tw-space-y-8">
                        <PromptSection entry={entry} />
                    </TabsPrimitive.Content>

                    <TabsPrimitive.Content value="context" className="tw-space-y-8">
                        <ContextInfoSection entry={entry} />
                    </TabsPrimitive.Content>

                    <TabsPrimitive.Content value="network-request" className="tw-space-y-8">
                        <NetworkRequestSection entry={entry} />
                    </TabsPrimitive.Content>

                    <TabsPrimitive.Content value="network-response" className="tw-space-y-8">
                        <NetworkResponseSection entry={entry} />
                    </TabsPrimitive.Content>

                    <TabsPrimitive.Content value="config" className="tw-space-y-8">
                        <AutoeditsConfigSection entry={entry} />
                    </TabsPrimitive.Content>
                </div>
            </TabsPrimitive.Root>
        </div>
    )
}

const TabButton: FC<{ value: string; activeTab: string; children: React.ReactNode }> = ({
    value,
    activeTab,
    children,
}) => {
    const isActive = value === activeTab
    return (
        <TabsPrimitive.Trigger
            value={value}
            className={`
                tw-px-4 tw-py-2 tw-font-medium tw-text-sm
                tw-border-b-2 tw-transition-colors
                ${
                    isActive
                        ? 'tw-border-blue-500 tw-text-blue-600 tw-dark:tw-border-blue-400 tw-dark:tw-text-blue-400'
                        : 'tw-border-transparent tw-text-gray-500 tw-dark:tw-text-gray-400 hover:tw-text-gray-700 hover:tw-border-gray-300 dark:hover:tw-text-gray-300'
                }
            `}
        >
            {children}
        </TabsPrimitive.Trigger>
    )
}

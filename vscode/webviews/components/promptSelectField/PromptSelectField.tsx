import type { Action } from '@sourcegraph/cody-shared'
import { ExternalLink } from 'lucide-react'
import {
    type MutableRefObject,
    useCallback,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { useConfig } from '../../utils/useConfig'
import { PromptList, type PromptsFilterArgs } from '../promptList/PromptList'
import type { Organization } from '../promptOwnerFilter/PromptOwnerFilter'
import { PromptOwnerFilter } from '../promptOwnerFilter/PromptOwnerFilter'
import { PromptTagsFilter } from '../promptTagsFilter/PromptTagsFilter'
import { Button } from '../shadcn/ui/button'
import { ToolbarPopoverItem } from '../shadcn/ui/toolbar'
import { cn } from '../shadcn/utils'
import { useCurrentUserId } from './useCurrentUserId'

// Define PopoverControlMethods interface here
interface PopoverControlMethods {
    open: () => void
    close: () => void
}

export const PromptSelectField: React.FunctionComponent<{
    onSelect: (item: Action) => void
    onCloseByEscape?: () => void
    className?: string
    promptSelectorRef?: MutableRefObject<{ open: () => void; close: () => void } | null>

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({ onSelect, onCloseByEscape, className, __storybook__open, promptSelectorRef }) => {
    const telemetryRecorder = useTelemetryRecorder()
    const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
    const [ownerFilterValue, setOwnerFilterValue] = useState<string | null>(null)
    const { value: userId, error: userIdError } = useCurrentUserId()
    const { authStatus } = useConfig()

    // Use a ref to control the popover
    const popoverControlRef = useRef<PopoverControlMethods | null>(null)

    // Expose open and close methods via ref
    useImperativeHandle(
        promptSelectorRef,
        () => ({
            open: () => popoverControlRef.current?.open(),
            close: () => popoverControlRef.current?.close(),
        }),
        []
    )

    // Convert the organizations from authStatus to the format expected by PromptOwnerFilter
    const organizations = useMemo<Organization[]>(() => {
        if (!authStatus.authenticated || !authStatus.organizations) {
            return []
        }

        return authStatus.organizations.map(org => ({
            id: org.id,
            name: org.name,
        }))
    }, [authStatus])

    // Determine the endpoint URL for the prompt library
    const promptLibraryUrl = useMemo(() => {
        if (!authStatus.endpoint) {
            return 'https://sourcegraph.com/prompts'
        }
        // Remove trailing slash if present
        const baseUrl = authStatus.endpoint.replace(/\/$/, '')
        return `${baseUrl}/prompts`
    }, [authStatus.endpoint])

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                telemetryRecorder.recordEvent('cody.promptSelectField', 'open', {
                    billingMetadata: { product: 'cody', category: 'billable' },
                })
            }
        },
        [telemetryRecorder.recordEvent]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
        },
        [onCloseByEscape]
    )

    const promptFilters = useMemo(() => {
        const filters: PromptsFilterArgs = {}

        if (selectedTagId) {
            filters.tags = [selectedTagId]
        }

        if (ownerFilterValue) {
            filters.owner = ownerFilterValue
        }

        return Object.keys(filters).length > 0 ? filters : undefined
    }, [selectedTagId, ownerFilterValue])

    return (
        <ToolbarPopoverItem
            role="combobox"
            iconEnd="chevron"
            className={cn('tw-justify-between', className)}
            __storybook__open={__storybook__open}
            controlRef={popoverControlRef}
            tooltip="Insert prompt from Prompt Library"
            aria-label="Insert prompt"
            popoverContent={close => (
                <div className="tw-flex tw-flex-col tw-max-h-[500px] tw-overflow-auto tw-relative">
                    <div className="tw-flex tw-flex-row tw-gap-4 tw-px-2 tw-py-3 tw-border-b tw-border-border tw-mb-1">
                        <div className="tw-flex tw-flex-row tw-gap-2 tw-justify-start">
                            <div className="tw-w-1/2">
                                <PromptOwnerFilter
                                    value={ownerFilterValue}
                                    onFilterChange={setOwnerFilterValue}
                                    className="!tw-px-0 !tw-py-0 !tw-border-b-0"
                                    organizations={organizations}
                                    userId={userId && !userIdError ? (userId as string) : undefined}
                                />
                            </div>
                            <div className="tw-w-1/2">
                                <PromptTagsFilter
                                    selectedTagId={selectedTagId}
                                    onTagChange={setSelectedTagId}
                                    className="!tw-px-0 !tw-py-0 !tw-border-b-0"
                                />
                            </div>
                        </div>
                    </div>
                    <PromptList
                        onSelect={item => {
                            onSelect(item)
                            close()
                        }}
                        showSearch={true}
                        paddingLevels="middle"
                        telemetryLocation="PromptSelectField"
                        showOnlyPromptInsertableCommands={true}
                        showPromptLibraryUnsupportedMessage={true}
                        lastUsedSorting={true}
                        recommendedOnly={false}
                        inputClassName="tw-bg-popover"
                        promptFilters={promptFilters}
                    />
                    <div className="tw-sticky tw-bottom-0 tw-w-full tw-bg-popover tw-py-2 tw-px-3 tw-border-t tw-border-border">
                        <a
                            href={promptLibraryUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tw-w-full"
                        >
                            <Button
                                type="button"
                                variant="link"
                                className="tw-w-full tw-justify-center tw-text-sm tw-text-muted-foreground"
                            >
                                Explore Prompt Library
                                <ExternalLink className="tw-ml-1 tw-size-6" />
                            </Button>
                        </a>
                    </div>
                </div>
            )}
            popoverRootProps={{ onOpenChange }}
            popoverContentProps={{
                className: 'tw-min-w-[325px] tw-w-[75vw] tw-max-w-[550px] !tw-p-0',
                onKeyDown: onKeyDown,
                onCloseAutoFocus: event => {
                    // Prevent the popover trigger from stealing focus after the user selects an
                    // item. We want the focus to return to the editor.
                    event.preventDefault()
                },
            }}
        >
            Prompts
        </ToolbarPopoverItem>
    )
}

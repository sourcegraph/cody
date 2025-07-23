import {
    type ChatMessage,
    type Model,
    ModelTag,
    type ModelsData,
    isCodyProModel,
} from '@sourcegraph/cody-shared'
import { isMacOS } from '@sourcegraph/cody-shared'
import { DeepCodyAgentID, ToolCodyModelName } from '@sourcegraph/cody-shared/src/models/client'
import { clsx } from 'clsx'
import { AlertTriangleIcon, BookOpenIcon, BrainIcon, ExternalLinkIcon } from 'lucide-react'
import { type FunctionComponent, type ReactNode, useCallback, useMemo } from 'react'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { chatModelIconComponent } from '../ChatModelIcon'
import { Badge } from '../shadcn/ui/badge'
import { Command, CommandGroup, CommandItem, CommandLink, CommandList } from '../shadcn/ui/command'
import { ToolbarPopoverItem } from '../shadcn/ui/toolbar'
import { cn } from '../shadcn/utils'
import styles from './ModelSelectField.module.css'

type Value = string

interface SelectListOption {
    value: Value | undefined
    title: string | ReactNode
    tooltip: string
    filterKeywords?: string[]
    group?: string
    disabled?: boolean
}

export const ModelSelectField: React.FunctionComponent<{
    models: Model[]
    onModelSelect: (model: Model) => void
    serverSentModelsEnabled: boolean

    onCloseByEscape?: () => void
    className?: string

    intent?: ChatMessage['intent']

    /** For storybooks only. */
    __storybook__open?: boolean
    modelSelectorRef?: React.MutableRefObject<{ open: () => void; close: () => void } | null>
    modelsData?: ModelsData
}> = ({
    models,
    onModelSelect: parentOnModelSelect,
    serverSentModelsEnabled,
    onCloseByEscape,
    className,
    intent,
    __storybook__open,
    modelSelectorRef,
    modelsData,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    // The first model is the always the default.
    const selectedModel = models[0]

    const onModelSelect = useCallback(
        (model: Model): void => {
            if (selectedModel.id !== model.id) {
                telemetryRecorder.recordEvent('cody.modelSelector', 'select', {
                    metadata: {
                        modelIsCodyProOnly: isCodyProModel(model) ? 1 : 0,
                        isCodyProUser: 0,
                    },
                    privateMetadata: {
                        modelId: model.id,
                        modelProvider: model.provider,
                        modelTitle: model.title,
                    },
                    billingMetadata: {
                        product: 'cody',
                        category: 'billable',
                    },
                })
            }
            parentOnModelSelect(model)
        },
        [selectedModel, telemetryRecorder.recordEvent, parentOnModelSelect]
    )

    // Readonly if they are an enterprise user that does not support server-sent models
    const readOnly = !serverSentModelsEnabled

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                // Trigger only when dropdown is about to be opened.
                telemetryRecorder.recordEvent('cody.modelSelector', 'open', {
                    metadata: {
                        isCodyProUser: 0,
                        totalModels: models.length,
                    },
                    billingMetadata: {
                        product: 'cody',
                        category: 'billable',
                    },
                })
            }
        },
        [telemetryRecorder.recordEvent, models.length]
    )

    const options = useMemo<SelectListOption[]>(
        () =>
            models
                .map(m => {
                    const availability = modelAvailability(serverSentModelsEnabled, m, intent)
                    if (availability === 'needs-cody-pro') {
                        return undefined
                    }

                    return {
                        value: m.id,
                        title: (
                            <ModelTitleWithIcon
                                model={m}
                                showIcon={true}
                                showProvider={true}
                                modelAvailability={availability}
                            />
                        ),
                        // needs-cody-pro models should be clickable (not disabled) so the user can
                        // be taken to the upgrade page.
                        disabled: !['available', 'needs-cody-pro'].includes(availability),
                        group: getModelDropDownUIGroup(m),
                        tooltip: getTooltip(m, availability),
                    } satisfies SelectListOption
                })
                .filter(Boolean) as SelectListOption[],
        [models, serverSentModelsEnabled, intent]
    )
    const optionsByGroup: { group: string; options: SelectListOption[] }[] = useMemo(() => {
        return optionByGroup(options)
    }, [options])

    const onChange = useCallback(
        (value: string | undefined) => {
            onModelSelect(models.find(m => m.id === value)!)
        },
        [onModelSelect, models]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
        },
        [onCloseByEscape]
    )

    if (!models.length || models.length < 1) {
        return null
    }

    const isRateLimited = useMemo(() => models.some(model => model.disabled), [models])
    const value = selectedModel.id
    return (
        <ToolbarPopoverItem
            role="combobox"
            data-testid="chat-model-selector"
            iconEnd={readOnly ? undefined : 'chevron'}
            className={cn('tw-justify-between', className)}
            disabled={readOnly}
            __storybook__open={__storybook__open}
            tooltip={readOnly ? undefined : isMacOS() ? 'Switch model (⌘M)' : 'Switch model (Ctrl+M)'}
            aria-label="Select a model or an agent"
            controlRef={modelSelectorRef}
            popoverContent={close => (
                <Command
                    loop={true}
                    defaultValue={value}
                    tabIndex={0}
                    className={`focus:tw-outline-none ${styles.chatModelPopover}`}
                    data-testid="chat-model-popover"
                >
                    {intent === 'agentic' && (
                        <div className="tw-pl-5 tw-pr-3 tw-py-1.5 tw-text-sm tw-text-foreground tw-flex tw-justify-center">
                            <div className="tw-flex tw-items-start tw-gap-2 tw-bg-muted tw-px-2 tw-py-0.5 tw-rounded">
                                <AlertTriangleIcon className="tw-w-[16px] tw-h-[16px] tw-mt-[2px]" />
                                <span className="tw-leading-4 tw-font-semibold">
                                    Only Claude 3.7 Sonnet is currently available in Agent Mode
                                </span>
                            </div>
                        </div>
                    )}
                    <CommandList
                        className="model-selector-popover tw-max-h-[80vh] tw-overflow-y-auto"
                        data-testid="chat-model-popover-option"
                    >
                        {isRateLimited && (
                            <div className="tw-pl-5 tw-pr-3 tw-py-1.5 tw-text-sm tw-text-foreground tw-flex tw-justify-center">
                                <div className="tw-flex tw-items-center tw-gap-2 tw-bg-muted tw-px-2 tw-py-0.5 tw-rounded">
                                    <AlertTriangleIcon className="tw-w-[16px] tw-h-[16px]" />
                                    <span className="tw-font-semibold">
                                        Usage limit reached: Premium models disabled
                                    </span>
                                </div>
                            </div>
                        )}
                        {optionsByGroup.map(({ group, options }) => (
                            <CommandGroup heading={group} key={group}>
                                {options.map(option => (
                                    <CommandItem
                                        data-testid="chat-model-popover-option"
                                        key={option.value}
                                        value={option.value}
                                        onSelect={currentValue => {
                                            onChange(currentValue)
                                            close()
                                        }}
                                        disabled={option.disabled}
                                        tooltip={option.tooltip}
                                    >
                                        {option.title}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                        <CommandGroup>
                            <CommandLink
                                href="https://sourcegraph.com/docs/cody/clients/install-vscode#supported-llm-models"
                                target="_blank"
                                rel="noreferrer"
                                className={styles.modelTitleWithIcon}
                            >
                                <span className={styles.modelIcon}>
                                    {/* wider than normal to fit in with provider icons */}
                                    <BookOpenIcon size={16} strokeWidth={2} />{' '}
                                </span>
                                <span className={styles.modelName}>Documentation</span>
                                <span className={styles.rightIcon}>
                                    <ExternalLinkIcon
                                        size={16}
                                        strokeWidth={1.25}
                                        className="tw-opacity-80"
                                    />
                                </span>
                            </CommandLink>
                        </CommandGroup>
                    </CommandList>
                </Command>
            )}
            popoverRootProps={{ onOpenChange }}
            popoverContentProps={{
                className: 'tw-min-w-[325px] tw-w-[unset] tw-max-w-[90%] !tw-p-0',
                onKeyDown: onKeyDown,
                onCloseAutoFocus: event => {
                    // Prevent the popover trigger from stealing focus after the user selects an
                    // item. We want the focus to return to the editor.
                    event.preventDefault()
                },
            }}
        >
            {value !== undefined ? options.find(option => option.value === value)?.title : 'Select...'}
        </ToolbarPopoverItem>
    )
}
type ModelAvailability = 'available' | 'needs-cody-pro' | 'not-selectable-on-enterprise'

function modelAvailability(
    serverSentModelsEnabled: boolean,
    model: Model,
    intent?: ChatMessage['intent']
): ModelAvailability {
    if (model.disabled) {
        return 'not-selectable-on-enterprise'
    }
    if (!serverSentModelsEnabled) {
        return 'not-selectable-on-enterprise'
    }
    // For agentic mode, only allow models with the AgenticCompatible tag (Claude 3.7 Sonnet)
    if (intent === 'agentic' && !model.tags.includes(ModelTag.Default)) {
        return 'not-selectable-on-enterprise'
    }
    return 'available'
}

function getTooltip(model: Model, availability: string): string {
    if (model.id.includes(DeepCodyAgentID)) {
        return 'Agentic chat reflects on your request and uses tools to dynamically retrieve relevant context, improving accuracy and response quality.'
    }

    if (model.tags.includes(ModelTag.Waitlist)) {
        return 'Request access to this new model'
    }
    if (model.tags.includes(ModelTag.OnWaitlist)) {
        return 'Request received, we will reach out with next steps'
    }

    if (model.disabled) {
        return 'This model is currently unavailable due to rate limiting. Please try a faster model.'
    }

    const capitalizedProvider =
        model.provider === 'openai'
            ? 'OpenAI'
            : model.provider.charAt(0).toUpperCase() + model.provider.slice(1)
    switch (availability) {
        case 'not-selectable-on-enterprise':
            return 'Chat model set by your Sourcegraph Enterprise admin'
        default:
            return `${model.title} by ${capitalizedProvider}`
    }
}

const getBadgeText = (model: Model): string | null => {
    const tagToText: Record<string, string> = {
        [ModelTag.Internal]: 'Internal',
        [ModelTag.Experimental]: 'Experimental',
        [ModelTag.Waitlist]: 'Join Waitlist',
        [ModelTag.OnWaitlist]: 'On Waitlist',
        [ModelTag.EarlyAccess]: 'Early Access',
        [ModelTag.Recommended]: 'Recommended',
        [ModelTag.Deprecated]: 'Deprecated',
        [ModelTag.Dev]: 'Preview',
    }

    return model.tags.reduce((text, tag) => text || tagToText[tag] || '', null as string | null)
}

const ModelTitleWithIcon: React.FC<{
    model: Model
    showIcon?: boolean
    showProvider?: boolean
    modelAvailability?: ModelAvailability
    isCurrentlySelected?: boolean
}> = ({ model, showIcon, modelAvailability }) => {
    const modelBadge = getBadgeText(model)
    const isDisabled = modelAvailability !== 'available'

    return (
        <span
            className={clsx(styles.modelTitleWithIcon, {
                [styles.disabled]: isDisabled,
            })}
        >
            {showIcon ? (
                model.id.includes(DeepCodyAgentID) ? (
                    <BrainIcon size={16} className={styles.modelIcon} />
                ) : (
                    <ChatModelIcon model={model.provider} className={styles.modelIcon} />
                )
            ) : null}
            <span className={clsx('tw-flex-grow', styles.modelName)}>{model.title}</span>
            {modelBadge && (
                <Badge
                    variant="secondary"
                    className={clsx(styles.badge, {
                        'tw-opacity-75': modelAvailability === 'needs-cody-pro',
                    })}
                >
                    {modelBadge}
                </Badge>
            )}
        </span>
    )
}

const ChatModelIcon: FunctionComponent<{
    model: string
    className?: string
}> = ({ model, className }) => {
    const ModelIcon = chatModelIconComponent(model)
    return ModelIcon ? <ModelIcon size={16} className={className} /> : null
}

/** Common {@link ModelsService.uiGroup} values. */
const ModelUIGroup: Record<string, string> = {
    Agents: 'Agent, extensive context fetching',
    Power: 'More powerful models',
    Balanced: 'Balanced for power and speed',
    Speed: 'Faster models',
    Ollama: 'Ollama (Local models)',
    Other: 'Other',
}

const getModelDropDownUIGroup = (model: Model): string => {
    if ([DeepCodyAgentID, ToolCodyModelName].some(id => model.id.includes(id)))
        return ModelUIGroup.Agents
    if (model.tags.includes(ModelTag.Power)) return ModelUIGroup.Power
    if (model.tags.includes(ModelTag.Balanced)) return ModelUIGroup.Balanced
    if (model.tags.includes(ModelTag.Speed)) return ModelUIGroup.Speed
    if (model.tags.includes(ModelTag.Ollama)) return ModelUIGroup.Ollama
    return ModelUIGroup.Other
}

const optionByGroup = (
    options: SelectListOption[]
): { group: string; options: SelectListOption[] }[] => {
    const groupOrder = [
        ModelUIGroup.Power,
        ModelUIGroup.Balanced,
        ModelUIGroup.Speed,
        ModelUIGroup.Ollama,
        ModelUIGroup.Other,
    ]
    const groups = new Map<string, SelectListOption[]>()

    for (const option of options) {
        const group = option.group ?? ModelUIGroup.Other
        const groupOptions = groups.get(group) ?? []
        groupOptions.push(option)
        groups.set(group, groupOptions)
    }

    return [...groups.entries()]
        .sort(([a], [b]) => groupOrder.indexOf(a) - groupOrder.indexOf(b))
        .map(([group, options]) => ({ group, options }))
}

import { type Model, ModelTag, isCodyProModel, isWaitlistModel } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { BookOpenIcon, BuildingIcon, ExternalLinkIcon } from 'lucide-react'
import { type FunctionComponent, type ReactNode, useCallback, useMemo } from 'react'
import type { UserAccountInfo } from '../../Chat'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
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

    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>

    onCloseByEscape?: () => void
    className?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({
    models,
    onModelSelect: parentOnModelSelect,
    serverSentModelsEnabled,
    userInfo,
    onCloseByEscape,
    className,
    __storybook__open,
}) => {
    const telemetryRecorder = useTelemetryRecorder()

    // The first model is the always the default.
    const selectedModel = models[0]

    const isCodyProUser = userInfo.isDotComUser && userInfo.isCodyProUser
    const isEnterpriseUser = !userInfo.isDotComUser
    const showCodyProBadge = !isEnterpriseUser && !isCodyProUser

    const onModelSelect = useCallback(
        (model: Model): void => {
            telemetryRecorder.recordEvent('cody.modelSelector', 'select', {
                metadata: {
                    modelIsCodyProOnly: isCodyProModel(model) ? 1 : 0,
                    isCodyProUser: isCodyProUser ? 1 : 0,
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

            if (showCodyProBadge && isCodyProModel(model)) {
                getVSCodeAPI().postMessage({
                    command: 'links',
                    value: 'https://sourcegraph.com/cody/subscription',
                })
                getVSCodeAPI().postMessage({
                    command: 'event',
                    eventName: 'CodyVSCodeExtension:upgradeLLMChoiceCTA:clicked',
                    properties: { limit_type: 'chat_commands' },
                })
                return
            }
            if (isWaitlistModel(model)) {
                getVSCodeAPI().postMessage({
                    command: 'links',
                    value: 'waitlist',
                })
            }
            parentOnModelSelect(model)
        },
        [telemetryRecorder.recordEvent, showCodyProBadge, parentOnModelSelect, isCodyProUser]
    )

    // Readonly if they are an enterprise user that does not support server-sent models
    const readOnly = !(userInfo.isDotComUser || serverSentModelsEnabled)

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                // Trigger `CodyVSCodeExtension:openLLMDropdown:clicked` only when dropdown is about to be opened.
                getVSCodeAPI().postMessage({
                    command: 'event',
                    eventName: 'CodyVSCodeExtension:openLLMDropdown:clicked',
                    properties: undefined,
                })

                telemetryRecorder.recordEvent('cody.modelSelector', 'open', {
                    metadata: {
                        isCodyProUser: isCodyProUser ? 1 : 0,
                        totalModels: models.length,
                    },
                    billingMetadata: {
                        product: 'cody',
                        category: 'billable',
                    },
                })
            }
        },
        [telemetryRecorder.recordEvent, isCodyProUser, models.length]
    )

    const options = useMemo<SelectListOption[]>(
        () =>
            models.map(m => {
                const availability = modelAvailability(userInfo, serverSentModelsEnabled, m)
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
            }),
        [models, userInfo, serverSentModelsEnabled]
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

    const value = selectedModel.id
    return (
        <ToolbarPopoverItem
            role="combobox"
            iconEnd={readOnly ? undefined : 'chevron'}
            className={cn('tw-justify-between', className)}
            disabled={readOnly}
            __storybook__open={__storybook__open}
            tooltip={readOnly ? undefined : 'Select a model'}
            aria-label="Select a model"
            popoverContent={close => (
                <Command loop={true} defaultValue={value} tabIndex={0} className="focus:tw-outline-none">
                    <CommandList className={'model-selector-popover'}>
                        {optionsByGroup.map(({ group, options }) => (
                            <CommandGroup heading={group} key={group}>
                                {options.map(option => (
                                    <CommandItem
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
                        {userInfo.isDotComUser && (
                            <CommandGroup>
                                <CommandLink
                                    key="enterprise-model-options"
                                    href={ENTERPRISE_MODEL_DOCS_PAGE}
                                    target="_blank"
                                    rel="noreferrer"
                                    onSelect={() => {
                                        telemetryRecorder.recordEvent(
                                            'cody.modelSelector',
                                            'clickEnterpriseModelOption',
                                            {
                                                billingMetadata: {
                                                    product: 'cody',
                                                    category: 'billable',
                                                },
                                            }
                                        )
                                    }}
                                    className={styles.modelTitleWithIcon}
                                >
                                    <span className={styles.modelIcon}>
                                        {/* wider than normal to fit in with provider icons */}
                                        <BuildingIcon size={16} strokeWidth={2} />{' '}
                                    </span>
                                    <span className={styles.modelName}>Enterprise Model Options</span>
                                    <span className={styles.rightIcon}>
                                        <ExternalLinkIcon
                                            size={16}
                                            strokeWidth={1.25}
                                            className="tw-opacity-80"
                                        />
                                    </span>
                                </CommandLink>
                            </CommandGroup>
                        )}
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

const ENTERPRISE_MODEL_DOCS_PAGE =
    'https://sourcegraph.com/docs/cody/clients/enable-cody-enterprise?utm_source=cody.modelSelector'

type ModelAvailability = 'available' | 'needs-cody-pro' | 'not-selectable-on-enterprise'

function modelAvailability(
    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>,
    serverSentModelsEnabled: boolean,
    model: Model
): ModelAvailability {
    if (!userInfo.isDotComUser && !serverSentModelsEnabled) {
        return 'not-selectable-on-enterprise'
    }
    if (isCodyProModel(model) && userInfo.isDotComUser && !userInfo.isCodyProUser) {
        return 'needs-cody-pro'
    }
    return 'available'
}

function getTooltip(model: Model, availability: string): string {
    if (model.tags.includes(ModelTag.Waitlist)) {
        return 'Request access to this new model'
    }
    if (model.tags.includes(ModelTag.OnWaitlist)) {
        return 'Request received, we will reach out with next steps'
    }

    switch (availability) {
        case 'not-selectable-on-enterprise':
            return 'Chat model set by your Sourcegraph Enterprise admin'
        case 'needs-cody-pro':
            return `Upgrade to Cody Pro to use ${model.title} by ${model.provider}`
        default:
            return `${model.title} by ${model.provider}`
    }
}

const ModelTitleWithIcon: FunctionComponent<{
    model: Model
    showIcon?: boolean
    showProvider?: boolean
    modelAvailability?: ModelAvailability
}> = ({ model, showIcon, modelAvailability }) => {
    const getBadgeText = (model: Model, modelAvailability?: ModelAvailability): string | null => {
        if (modelAvailability === 'needs-cody-pro') return 'Cody Pro'
        if (model.tags.includes(ModelTag.Experimental)) return 'Experimental'
        if (model.tags.includes(ModelTag.Waitlist)) return 'Join Waitlist'
        if (model.tags.includes(ModelTag.OnWaitlist)) return 'On Waitlist'
        if (model.tags.includes(ModelTag.EarlyAccess)) return 'Early Access'
        if (model.tags.includes(ModelTag.Recommended)) return 'Recommended'
        return null
    }

    return (
        <span
            className={clsx(styles.modelTitleWithIcon, {
                [styles.disabled]: modelAvailability !== 'available',
            })}
        >
            {showIcon && <ChatModelIcon model={model.provider} className={styles.modelIcon} />}
            <span className={clsx('tw-flex-grow', styles.modelName)}>{model.title}</span>
            {getBadgeText(model, modelAvailability) && (
                <Badge
                    variant="secondary"
                    className={clsx(styles.badge, {
                        'tw-opacity-75': modelAvailability === 'needs-cody-pro',
                    })}
                >
                    {getBadgeText(model, modelAvailability)}
                </Badge>
            )}
        </span>
    )
}

const ChatModelIcon: FunctionComponent<{ model: string; className?: string }> = ({
    model,
    className,
}) => {
    const ModelIcon = chatModelIconComponent(model)
    return ModelIcon ? <ModelIcon size={16} className={className} /> : null
}

/** Common {@link ModelsService.uiGroup} values. */
const ModelUIGroup: Record<string, string> = {
    Power: 'More powerful models',
    Balanced: 'Balanced for power and speed',
    Speed: 'Faster models',
    Ollama: 'Ollama (Local models)',
    Other: 'Other',
}

const getModelDropDownUIGroup = (model: Model): string => {
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

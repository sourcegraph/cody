import { type Model, ModelTag, isCodyProModel, isWaitlistModel } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { BookOpenIcon, BuildingIcon, ExternalLinkIcon, FlaskConicalIcon } from 'lucide-react'
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
            // Log event when user switches to a different model from Deep Cody.
            if (selectedModel.id.includes('deep-cody') && selectedModel.id !== model.id) {
                // TODO (bee) remove after testing has been completed.
                telemetryRecorder.recordEvent('cody.deepCody', 'switch')
            }

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
        [
            selectedModel,
            telemetryRecorder.recordEvent,
            showCodyProBadge,
            parentOnModelSelect,
            isCodyProUser,
        ]
    )

    // Readonly if they are an enterprise user that does not support server-sent models
    const readOnly = !(userInfo.isDotComUser || serverSentModelsEnabled)

    const onOpenChange = useCallback(
        (open: boolean): void => {
            if (open) {
                // Trigger only when dropdown is about to be opened.
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
            data-testid="chat-model-selector"
            iconEnd={readOnly ? undefined : 'chevron'}
            className={cn('tw-justify-between', className)}
            disabled={readOnly}
            __storybook__open={__storybook__open}
            tooltip={readOnly ? undefined : 'Select a model'}
            aria-label="Select a model"
            popoverContent={close => (
                <Command
                    loop={true}
                    defaultValue={value}
                    tabIndex={0}
                    className="focus:tw-outline-none"
                    data-testid="chat-model-popover"
                >
                    <CommandList
                        className="model-selector-popover tw-max-h-[80vh] tw-overflow-y-auto"
                        data-testid="chat-model-popover-option"
                    >
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
    if (model.id.includes('deep-cody')) {
        return 'Uses Claude 3.5 Sonnet (New) with other models to fetch any extra context needed for better responses'
    }
    if (model.tags.includes(ModelTag.Waitlist)) {
        return 'Request access to this new model'
    }
    if (model.tags.includes(ModelTag.OnWaitlist)) {
        return 'Request received, we will reach out with next steps'
    }

    const capitalizedProvider =
        model.provider === 'openai'
            ? 'OpenAI'
            : model.provider.charAt(0).toUpperCase() + model.provider.slice(1)
    switch (availability) {
        case 'not-selectable-on-enterprise':
            return 'Chat model set by your Sourcegraph Enterprise admin'
        case 'needs-cody-pro':
            return `Upgrade to Cody Pro to use ${model.title} by ${capitalizedProvider}`
        default:
            return `${model.title} by ${capitalizedProvider}`
    }
}

const getBadgeText = (model: Model, modelAvailability?: ModelAvailability): string | null => {
    if (modelAvailability === 'needs-cody-pro') return 'Cody Pro'

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
}> = ({ model, showIcon, modelAvailability }) => {
    const modelBadge = getBadgeText(model, modelAvailability)
    const isDisabled = modelAvailability !== 'available'

    if (model.id.includes('deep-cody')) {
        return (
            <span className={clsx(styles.modelTitleWithIcon, { [styles.disabled]: isDisabled })}>
                {showIcon && <FlaskConicalIcon size={16} className={styles.modelIcon} />}
                <span className={clsx('tw-flex-grow', styles.modelName)}>{model.title}</span>
                <Badge variant="secondary" className={styles.badge}>
                    Experimental ⓘ
                </Badge>
            </span>
        )
    }

    return (
        <span className={clsx(styles.modelTitleWithIcon, { [styles.disabled]: isDisabled })}>
            {showIcon && <ChatModelIcon model={model.provider} className={styles.modelIcon} />}
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

const ChatModelIcon: FunctionComponent<{ model: string; className?: string }> = ({
    model,
    className,
}) => {
    const ModelIcon = chatModelIconComponent(model)
    return ModelIcon ? <ModelIcon size={16} className={className} /> : null
}

/** Common {@link ModelsService.uiGroup} values. */
const ModelUIGroup: Record<string, string> = {
    DeepCody: 'Mixed models, extended processing',
    Power: 'More powerful models',
    Balanced: 'Balanced for power and speed',
    Speed: 'Faster models',
    Ollama: 'Ollama (Local models)',
    Other: 'Other',
}

const getModelDropDownUIGroup = (model: Model): string => {
    if (model.id.includes('deep-cody')) return ModelUIGroup.DeepCody
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

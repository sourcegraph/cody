import type { PopoverContentProps } from '@radix-ui/react-popover'
import { type ModelProvider, ModelUIGroup } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { type FunctionComponent, type ReactNode, useCallback, useMemo, useState } from 'react'
import type { UserAccountInfo } from '../../Chat'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { chatModelIconComponent } from '../ChatModelIcon'
import { Command, CommandGroup, CommandItem, CommandList } from '../shadcn/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '../shadcn/ui/popover'
import { ToolbarButton } from '../shadcn/ui/toolbar'
import { cn } from '../shadcn/utils'
import styles from './ModelSelectField.module.css'

type Value = string

interface SelectListOption {
    value: Value | undefined
    title: string | ReactNode
    filterKeywords?: string[]
    group?: string
    disabled?: boolean
}

export const ModelSelectField: React.FunctionComponent<{
    models: ModelProvider[]
    onModelSelect: (model: ModelProvider) => void

    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>

    align?: PopoverContentProps['align']
    onCloseByEscape?: () => void
    className?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({
    models,
    onModelSelect: parentOnModelSelect,
    userInfo,
    align,
    onCloseByEscape,
    className,
    __storybook__open,
}) => {
    const usableModels = useMemo(() => models.filter(m => !m.deprecated), [models])
    const selectedModel = usableModels.find(m => m.default) ?? usableModels[0]

    const isCodyProUser = userInfo.isDotComUser && userInfo.isCodyProUser
    const isEnterpriseUser = !userInfo.isDotComUser
    const showCodyProBadge = !isEnterpriseUser && !isCodyProUser

    const onModelSelect = useCallback(
        (model: ModelProvider): void => {
            if (showCodyProBadge && model.codyProOnly) {
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
            getVSCodeAPI().postMessage({
                command: 'event',
                eventName: 'CodyVSCodeExtension:chooseLLM:clicked',
                properties: { LLM_provider: model.model },
            })
            parentOnModelSelect(model)
        },
        [showCodyProBadge, parentOnModelSelect]
    )

    const readOnly = !userInfo.isDotComUser
    const [open, setOpen] = useState(__storybook__open && !readOnly)

    const onOpenChange = useCallback((open: boolean): void => {
        setOpen(open)
        if (open) {
            // Trigger `CodyVSCodeExtension:openLLMDropdown:clicked` only when dropdown is about to be opened.
            getVSCodeAPI().postMessage({
                command: 'event',
                eventName: 'CodyVSCodeExtension:openLLMDropdown:clicked',
                properties: undefined,
            })
        }
    }, [])

    const options = useMemo<SelectListOption[]>(
        () =>
            usableModels.map(
                m =>
                    ({
                        value: m.model,
                        title: (
                            <ModelTitleWithIcon
                                model={m}
                                showIcon={true}
                                showProvider={true}
                                modelAvailability={modelAvailability(userInfo, m)}
                            />
                        ),
                        // needs-cody-pro models should be clickable (not disabled) so the user can
                        // be taken to the upgrade page.
                        disabled: !['available', 'needs-cody-pro'].includes(
                            modelAvailability(userInfo, m)
                        ),
                        group: m.uiGroup ?? 'Other',
                    }) satisfies SelectListOption
            ),
        [usableModels, userInfo]
    )
    const optionsByGroup: { group: string; options: SelectListOption[] }[] = useMemo(() => {
        const groups = new Map<string, SelectListOption[]>()
        for (const option of options) {
            const groupOptions = groups.get(option.group ?? '')
            if (groupOptions) {
                groupOptions.push(option)
            } else {
                groups.set(option.group ?? '', [option])
            }
        }
        return Array.from(groups.entries())
            .sort((a, b) => {
                const aIndex = GROUP_ORDER.indexOf(a[0])
                const bIndex = GROUP_ORDER.indexOf(b[0])
                if (aIndex !== -1 && bIndex !== -1) {
                    return aIndex - bIndex
                }
                if (aIndex !== -1) {
                    return -1
                }
                if (bIndex !== -1) {
                    return 1
                }
                return 0
            })
            .map(([group, options]) => ({ group, options }))
    }, [options])

    const onChange = useCallback(
        (value: string | undefined) => {
            onModelSelect(usableModels.find(m => m.model === value)!)
        },
        [onModelSelect, usableModels]
    )

    const onKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'Escape') {
                onCloseByEscape?.()
            }
        },
        [onCloseByEscape]
    )

    if (!usableModels.length || usableModels.length < 1) {
        return null
    }

    const value = selectedModel.model
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <ToolbarButton
                    variant="secondary"
                    role="combobox"
                    aria-expanded={open}
                    iconEnd={readOnly ? undefined : 'chevron'}
                    className={cn('tw-justify-between', className)}
                    disabled={readOnly}
                    aria-label="Select a model"
                    tabIndex={-1} // TODO(sqs): should add a keyboard shortcut for this
                >
                    {value !== undefined
                        ? options.find(option => option.value === value)?.title
                        : 'Select...'}
                </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent
                className="tw-min-w-[325px] tw-w-[unset] tw-max-w-[90%] !tw-p-0"
                align={align}
                onKeyDown={onKeyDown}
            >
                <Command loop={true} defaultValue={value} tabIndex={0} className="focus:tw-outline-none">
                    <CommandList>
                        {optionsByGroup.map(({ group, options }) => (
                            <CommandGroup heading={group} key={group}>
                                {options.map(option => (
                                    <CommandItem
                                        key={option.value}
                                        value={option.value}
                                        onSelect={currentValue => {
                                            onChange(currentValue)
                                            setOpen(false)
                                        }}
                                        disabled={option.disabled}
                                    >
                                        {option.title}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}

const GROUP_ORDER = [
    ModelUIGroup.Accuracy,
    ModelUIGroup.Balanced,
    ModelUIGroup.Speed,
    ModelUIGroup.Ollama,
]

type ModelAvailability = 'available' | 'needs-cody-pro' | 'not-selectable-on-enterprise'

function modelAvailability(
    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>,
    model: ModelProvider
): ModelAvailability {
    if (!userInfo.isDotComUser) {
        return 'not-selectable-on-enterprise'
    }
    if (model.codyProOnly && !userInfo.isCodyProUser) {
        return 'needs-cody-pro'
    }
    return 'available'
}

const ModelTitleWithIcon: FunctionComponent<{
    model: ModelProvider
    showIcon?: boolean
    showProvider?: boolean
    modelAvailability?: ModelAvailability
}> = ({ model, showIcon, showProvider, modelAvailability }) => (
    <span
        className={clsx(styles.modelTitleWithIcon, {
            [styles.disabled]: modelAvailability !== 'available',
        })}
        title={
            modelAvailability === 'not-selectable-on-enterprise'
                ? 'Chat model set by your Sourcegraph Enterprise admin'
                : modelAvailability === 'needs-cody-pro'
                  ? `Upgrade to Cody Pro to use ${model.title}`
                  : undefined
        }
    >
        {showIcon && <ChatModelIcon model={model.model} className={styles.modelIcon} />}
        <span className={styles.modelText}>
            <span className={styles.modelName}>{model.title}</span>
            <span className={styles.modelProvider}>
                {showProvider && model.provider !== 'Ollama' && `by ${capitalize(model.provider)}`}
            </span>
        </span>
        {modelAvailability === 'needs-cody-pro' && (
            <span className={clsx(styles.badge, styles.codyProBadge)}>Cody Pro</span>
        )}
        {model.initialDefault && (
            <span className={clsx(styles.badge, styles.otherBadge, styles.defaultBadge)}>Default</span>
        )}
        {model.provider === 'Ollama' && (
            <span className={clsx(styles.badge, styles.otherBadge)}>Experimental</span>
        )}
        {(model.title === 'Claude 3 Opus' || model.title === 'GPT-4 Turbo') &&
        !model.initialDefault &&
        modelAvailability !== 'needs-cody-pro' ? (
            <span className={clsx(styles.badge, styles.otherBadge, styles.recommendedBadge)}>
                Recommended
            </span>
        ) : null}
    </span>
)

const ChatModelIcon: FunctionComponent<{ model: string; className?: string }> = ({
    model,
    className,
}) => {
    const ModelIcon = chatModelIconComponent(model)
    return ModelIcon ? <ModelIcon size={16} className={className} /> : null
}

const capitalize = (s: string): string =>
    s
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

import { type Model, ModelUIGroup } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { BookOpenIcon, BuildingIcon, ExternalLinkIcon } from 'lucide-react'
import { type FunctionComponent, type ReactNode, useCallback, useMemo } from 'react'
import type { UserAccountInfo } from '../../Chat'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { useTelemetryRecorder } from '../../utils/telemetry'
import { chatModelIconComponent } from '../ChatModelIcon'
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

    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>

    onCloseByEscape?: () => void
    className?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({
    models,
    onModelSelect: parentOnModelSelect,
    userInfo,
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
        (model: Model): void => {
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

    const onOpenChange = useCallback((open: boolean): void => {
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
            usableModels.map(m => {
                const availability = modelAvailability(userInfo, m)
                return {
                    value: m.model,
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
                    group: m.uiGroup ?? 'Other',
                    tooltip:
                        availability === 'not-selectable-on-enterprise'
                            ? 'Chat model set by your Sourcegraph Enterprise admin'
                            : availability === 'needs-cody-pro'
                              ? `Upgrade to Cody Pro to use ${m.title} by ${m.provider}`
                              : `${m.title} by ${m.provider}`,
                } satisfies SelectListOption
            }),
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

    const telemetryRecorder = useTelemetryRecorder()

    if (!usableModels.length || usableModels.length < 1) {
        return null
    }

    const value = selectedModel.model
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
                    <CommandList>
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
                        <CommandGroup heading="Enterprise Model Options">
                            {ENTERPRISE_MODEL_OPTIONS.map(({ id, url, title }) => (
                                <CommandLink
                                    key={id}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onSelect={() => {
                                        telemetryRecorder.recordEvent(
                                            'cody.modelSelector',
                                            'clickEnterpriseModelOption',
                                            { metadata: { [id]: 1 } }
                                        )
                                    }}
                                    className={styles.modelTitleWithIcon}
                                >
                                    <span className={styles.modelIcon}>
                                        {/* wider than normal to fit in with provider icons */}
                                        <BuildingIcon size={16} strokeWidth={2} />{' '}
                                    </span>
                                    <span className={styles.modelName}>{title}</span>
                                    <span className={styles.rightIcon}>
                                        <ExternalLinkIcon
                                            size={16}
                                            strokeWidth={1.25}
                                            className="tw-opacity-80"
                                        />
                                    </span>
                                </CommandLink>
                            ))}
                        </CommandGroup>
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

const ENTERPRISE_MODEL_DOCS_PAGE =
    'https://sourcegraph.com/docs/cody/clients/enable-cody-enterprise?utm_source=cody.modelSelector'

const ENTERPRISE_MODEL_OPTIONS: { id: string; url: string; title: string }[] = [
    {
        id: 'anthropic-account',
        url: `${ENTERPRISE_MODEL_DOCS_PAGE}#use-your-organizations-anthropic-account`,
        title: 'Anthropic account',
    },
    {
        id: 'openai-account',
        url: `${ENTERPRISE_MODEL_DOCS_PAGE}#use-your-organizations-openai-account`,
        title: 'OpenAI account',
    },
    {
        id: 'amazon-bedrock',
        url: `${ENTERPRISE_MODEL_DOCS_PAGE}#use-amazon-bedrock-aws`,
        title: 'Amazon Bedrock',
    },
    {
        id: 'azure-openai-service',
        url: `${ENTERPRISE_MODEL_DOCS_PAGE}#use-azure-openai-service`,
        title: 'Azure OpenAI Service',
    },
]

const GROUP_ORDER = [
    ModelUIGroup.Accuracy,
    ModelUIGroup.Balanced,
    ModelUIGroup.Speed,
    ModelUIGroup.Ollama,
]

type ModelAvailability = 'available' | 'needs-cody-pro' | 'not-selectable-on-enterprise'

function modelAvailability(
    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>,
    model: Model
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
    model: Model
    showIcon?: boolean
    showProvider?: boolean
    modelAvailability?: ModelAvailability
}> = ({ model, showIcon, showProvider, modelAvailability }) => (
    <span
        className={clsx(styles.modelTitleWithIcon, {
            [styles.disabled]: modelAvailability !== 'available',
        })}
    >
        {showIcon && <ChatModelIcon model={model.model} className={styles.modelIcon} />}
        <span className={styles.modelName}>{model.title}</span>
        {modelAvailability === 'needs-cody-pro' && (
            <span className={clsx(styles.badge, styles.badgePro)}>Cody Pro</span>
        )}
        {model.provider === 'Ollama' && <span className={clsx(styles.badge)}>Experimental</span>}
        {model.title === 'Claude 3 Sonnet' ||
        ((model.title === 'Claude 3 Opus' || model.title === 'GPT-4o') &&
            modelAvailability !== 'needs-cody-pro') ? (
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

import { type ModelProvider, ModelUIGroup } from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { type FunctionComponent, useCallback, useMemo } from 'react'
import type { UserAccountInfo } from '../../Chat'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { chatModelIconComponent } from '../ChatModelIcon'
import { ComboBox, type SelectListOption } from '../shadcn/ui/combobox'
import styles from './ModelSelectField.module.css'

export const ModelSelectField: React.FunctionComponent<{
    models: ModelProvider[]
    onModelSelect: (model: ModelProvider) => void

    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>

    readOnly?: boolean

    className?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({
    models,
    onModelSelect: parentOnModelSelect,
    userInfo,
    readOnly,
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
            if (showCodyProBadge && selectedModel.codyProOnly) {
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
                properties: { LLM_provider: selectedModel.model },
            })
            parentOnModelSelect(model)
        },
        [showCodyProBadge, selectedModel, parentOnModelSelect]
    )

    const onPopoverOpen = useCallback((): void => {
        // Trigger `CodyVSCodeExtension:openLLMDropdown:clicked` only when dropdown is about to be opened.
        getVSCodeAPI().postMessage({
            command: 'event',
            eventName: 'CodyVSCodeExtension:openLLMDropdown:clicked',
            properties: undefined,
        })
    }, [])

    if (!usableModels.length || usableModels.length < 1) {
        return null
    }

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
                        filterKeywords: [m.title, m.provider],
                        disabled: modelAvailability(userInfo, m) !== 'available',
                        group: m.uiGroup ?? 'Other',
                    }) satisfies SelectListOption
            ),
        [usableModels, userInfo]
    )

    const onChange = useCallback(
        (value: string | undefined) => {
            onModelSelect(usableModels.find(m => m.model === value)!)
        },
        [onModelSelect, usableModels]
    )

    return (
        <ComboBox
            options={options}
            groupOrder={GROUP_ORDER}
            pluralNoun="models"
            value={selectedModel.model}
            onChange={onChange}
            className={className}
            readOnly={readOnly || !userInfo.isDotComUser}
            onOpen={onPopoverOpen}
            __storybook__open={__storybook__open}
            aria-label="Choose a model"
        />
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
            <span className={styles.modelName}>{capitalize(model.title)}</span>
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

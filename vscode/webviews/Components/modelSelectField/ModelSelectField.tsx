import type { ModelProvider } from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import { type FunctionComponent, useCallback, useMemo } from 'react'
import type { UserAccountInfo } from '../../Chat'
import { getVSCodeAPI } from '../../utils/VSCodeApi'
import { chatModelIconComponent } from '../ChatModelIcon'
import { PopoverButton } from '../platform/Button'
import { SelectList, type SelectListOption } from '../platform/SelectList'
import styles from './ModelSelectField.module.css'

export const ModelSelectField: React.FunctionComponent<{
    models: ModelProvider[]
    onModelSelect: (model: ModelProvider) => void

    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>

    disabled?: boolean

    className?: string

    /** For storybooks only. */
    __storybook__open?: boolean
}> = ({
    models,
    onModelSelect: parentOnModelSelect,
    userInfo,
    disabled,
    className,
    __storybook__open,
}) => {
    const selectedModel = models.find(m => m.default) ?? models[0]

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

    if (!models.length || models.length < 1) {
        return null
    }

    return (
        <PopoverButton
            popoverContent={close => (
                <ModelSelectList
                    value={selectedModel}
                    options={models}
                    userInfo={userInfo}
                    onChange={(value, shouldClose) => {
                        onModelSelect(value)
                        if (shouldClose) {
                            close()
                        }
                    }}
                />
            )}
            onOpen={onPopoverOpen}
            disabled={disabled || !userInfo.isDotComUser}
            className={className}
            aria-label="Choose a model"
            __storybook__open={__storybook__open}
        >
            <ModelTitleWithIcon
                model={selectedModel}
                showIcon={true}
                showProvider={false}
                modelAvailability={modelAvailability(userInfo, selectedModel)}
            />
        </PopoverButton>
    )
}

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

const ModelSelectList: FunctionComponent<{
    value: ModelProvider
    options: ModelProvider[]
    onChange: (model: ModelProvider, shouldClose: boolean) => void
    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>
}> = ({ value, options: modelOptions, onChange: parentOnChange, userInfo }) => {
    const options = useMemo<SelectListOption[]>(
        () =>
            modelOptions.map(
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
                        disabled: modelAvailability(userInfo, m) !== 'available',
                    }) satisfies SelectListOption
            ),
        [modelOptions, userInfo]
    )

    const onChange = useCallback(
        (value: string | undefined, close: boolean) => {
            parentOnChange(modelOptions.find(m => m.model === value)!, close)
        },
        [parentOnChange, modelOptions]
    )

    return <SelectList value={value.model} options={options} onChange={onChange} />
}

const ModelTitleWithIcon: FunctionComponent<{
    model: ModelProvider
    showIcon?: boolean
    showProvider?: boolean
    modelAvailability?: ModelAvailability
}> = ({ model, showIcon, showProvider, modelAvailability }) => (
    <span
        className={classNames(styles.modelTitleWithIcon, {
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
                {showProvider && `by ${capitalize(model.provider)}`}
            </span>
        </span>
        {modelAvailability === 'needs-cody-pro' || model.provider === 'Ollama' ? (
            <span className={styles.badge}>
                {modelAvailability === 'needs-cody-pro' && (
                    <span className={styles.codyProBadge}>Pro</span>
                )}
                {model.provider === 'Ollama' && (
                    <span className={styles.experimentalBadge}>Experimental</span>
                )}
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

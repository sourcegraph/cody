import type React from 'react'
import { useCallback, useRef, useState, type ComponentProps } from 'react'

import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import type { ChatModelDropdownMenuProps } from '@sourcegraph/cody-ui/src/Chat'
import {
    AnthropicLogo,
    MetaLogo,
    MistralLogo,
    OpenAILogo,
    UnrecognizedLogo,
} from '@sourcegraph/cody-ui/src/icons/LLMProviderIcons'

import { getVSCodeAPI } from '../utils/VSCodeApi'

import type { ChatModelProvider } from '@sourcegraph/cody-shared'
import styles from './ChatModelDropdownMenu.module.css'

type DropdownProps = ComponentProps<typeof VSCodeDropdown>

export const ChatModelDropdownMenu: React.FunctionComponent<ChatModelDropdownMenuProps> = ({
    models,
    disabled, // disabled is true when transcript length is > 1
    onCurrentChatModelChange,
    userInfo,
}) => {
    const [currentModel, setCurrentModel] = useState(models.find(m => m.default) || models[0])
    const currentModelIndex = models.indexOf(models.find(m => m.default) || models[0])
    const dropdownRef = useRef<DropdownProps>(null)

    const isCodyProUser = userInfo.isDotComUser && userInfo.isCodyProUser
    const isEnterpriseUser = !userInfo.isDotComUser
    const showCodyProBadge = !isEnterpriseUser && !isCodyProUser

    const handleChange = useCallback(
        (event: any): void => {
            const selectedModel = models[event.target?.selectedIndex]
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
            onCurrentChatModelChange(selectedModel)
            setCurrentModel(selectedModel)
        },
        [models, onCurrentChatModelChange, showCodyProBadge]
    )

    function isModelDisabled(codyProOnly: boolean): boolean {
        return codyProOnly ? codyProOnly && showCodyProBadge : false
    }

    if (!models.length || models.length < 1) {
        return null
    }

    const enabledDropdownProps: Pick<DropdownProps, 'title' | 'onClickCapture'> = {
        title: `This chat is using ${currentModel.title}. Start a new chat to choose a different model.`,
        onClickCapture: () => {
            // Trigger `CodyVSCodeExtension:openLLMDropdown:clicked` only when dropdown is about to be opened.
            if (!dropdownRef.current?.open) {
                getVSCodeAPI().postMessage({
                    command: 'event',
                    eventName: 'CodyVSCodeExtension:openLLMDropdown:clicked',
                    properties: undefined,
                })
            }
        },
    }

    return (
        <div className={styles.container}>
            <VSCodeDropdown
                ref={dropdownRef}
                disabled={disabled}
                className={styles.dropdownContainer}
                onChange={handleChange}
                selectedIndex={currentModelIndex}
                {...(!disabled && enabledDropdownProps)}
            >
                {models?.map((option, index) => (
                    <VSCodeOption
                        className={styles.option}
                        key={option.model}
                        id={index.toString()}
                        title={
                            isModelDisabled(option.codyProOnly)
                                ? `Upgrade to Cody Pro to use ${option.title}`
                                : undefined
                        }
                    >
                        <ModelIcon
                            title={option.title}
                            model={option.model}
                            provider={option.provider}
                        />
                        <span
                            className={classNames(
                                styles.titleContainer,
                                isModelDisabled(option.codyProOnly) && styles.disabled
                            )}
                            title={
                                isEnterpriseUser
                                    ? 'Chat model set by your Sourcegraph Enterprise admin'
                                    : undefined
                            }
                        >
                            <span className={styles.title}>{option.title}</span>
                            <span className={styles.provider}>{` by ${option.provider}`}</span>
                        </span>
                        {isModelDisabled(option.codyProOnly) && (
                            <span className={styles.badge}>Pro</span>
                        )}
                    </VSCodeOption>
                ))}

                <div slot="selected-value" className={styles.selectedValue}>
                    <ModelIcon
                        title={currentModel.title}
                        model={currentModel.model}
                        provider={currentModel.model}
                    />
                    <span>
                        <span className={styles.title}>{currentModel.title}</span>
                    </span>
                </div>
            </VSCodeDropdown>
        </div>
    )
}

const ModelIcon = ({
    title,
    model,
    provider,
    className,
}: Pick<ChatModelProvider, 'title' | 'model' | 'provider'> & { className?: string }): JSX.Element => {
    if (provider === 'OpenAI' || model.startsWith('openai/')) {
        return <OpenAILogo className={className} />
    }
    if (provider === 'Anthropic' || model.startsWith('anthropic/')) {
        return <AnthropicLogo className={className} />
    }
    if (provider === 'Mistral' || provider.includes('mixtral') || provider.includes('mistral')) {
        return <MistralLogo className={className} />
    }
    if (provider === 'Meta' || model.includes('codellama')) {
        return <MetaLogo className={className} />
    }
    return (
        <UnrecognizedLogo
            name={model}
            abbreviation={abbreviationForModel({ title, model, provider })}
            className={className}
        />
    )
}

function abbreviationForModel({
    title,
    provider,
    model,
}: Pick<ChatModelProvider, 'title' | 'model' | 'provider'>): string {
    if (model.match(/\bphi\b/)) {
        return 'Φ'
    }
    return title
        .split(/[^\w(]+(?=[a-zA-Z])|[a-z](?=[A-Z])/) // split on non-word chars or lowercase before uppercase
        .map(word => word[0])
        .slice(0, 3)
        .join('')
        .toUpperCase()
}

import React, { useCallback, useState } from 'react'

import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { ChatModelDropdownMenuProps } from '@sourcegraph/cody-ui/src/Chat'
import { AnthropicLogo, OpenAILogo } from '@sourcegraph/cody-ui/src/icons/LLMProviderIcons'

import { getVSCodeAPI } from '../utils/VSCodeApi'

import styles from './ChatModelDropdownMenu.module.css'

export const ChatModelDropdownMenu: React.FunctionComponent<ChatModelDropdownMenuProps> = ({
    models,
    disabled, // disabled is true when transcript length is > 1
    onCurrentChatModelChange,
    userInfo,
}) => {
    const [currentModel, setCurrentModel] = useState(models.find(m => m.default) || models[0])

    const isCodyProUser = userInfo.isDotComUser && userInfo.isCodyProUser
    const isEnterpriseUser = !userInfo.isDotComUser
    const showCodyProBadge = !isEnterpriseUser && !isCodyProUser

    const handleChange = useCallback(
        (event: any): void => {
            if (showCodyProBadge) {
                getVSCodeAPI().postMessage({ command: 'links', value: 'https://sourcegraph.com/cody/subscription' })
                getVSCodeAPI().postMessage({
                    command: 'event',
                    eventName: 'CodyVSCodeExtension:upgradeLLMChoiceCTA:clicked',
                    properties: { limit_type: 'chat_commands' },
                })
                return
            }
            const selectedModel = models[event.target?.selectedIndex]
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

    function isModelDisabled(model: string): boolean {
        return showCodyProBadge && model !== currentModel.model
    }

    if (!models.length || models.length < 1) {
        return null
    }

    const tooltips = {
        enabled: 'Select a chat model',
        disabled: {
            codyProUser: `This chat is using ${currentModel.title}. Start a new chat to choose a different model.`,
            dotComUser: 'Upgrade to Cody Pro to use a different chat model.',
            enterpriseUser: `${currentModel.title} is the default chat model on your Sourcegraph instance.`,
        },
    }

    return (
        <div className={styles.container}>
            <VSCodeDropdown
                disabled={disabled}
                className={styles.dropdownContainer}
                onChange={handleChange}
                title={isEnterpriseUser ? tooltips.disabled.enterpriseUser : undefined}
                onClick={() =>
                    getVSCodeAPI().postMessage({
                        command: 'event',
                        eventName: 'CodyVSCodeExtension:openLLMDropdown:clicked',
                        properties: undefined,
                    })
                }
            >
                {models?.map((option, index) => (
                    <VSCodeOption
                        className={styles.option}
                        key={option.model}
                        id={index.toString()}
                        title={isModelDisabled(option.model) ? `Upgrade to Cody Pro to use ${option.title}` : undefined}
                    >
                        <ProviderIcon model={option.model} />
                        <span
                            className={classNames(
                                styles.titleContainer,
                                isModelDisabled(option.model) && styles.disabled
                            )}
                        >
                            <span className={styles.title}>{option.title}</span>
                            <span className={styles.provider}>{` by ${option.provider}`}</span>
                        </span>
                        {isModelDisabled(option.model) && <span className={styles.badge}>Pro</span>}
                    </VSCodeOption>
                ))}

                <div slot="selected-value" className={styles.selectedValue}>
                    <ProviderIcon model={currentModel.model} />
                    <span>
                        <span className={styles.title}>{currentModel.title}</span>
                    </span>
                </div>
            </VSCodeDropdown>
        </div>
    )
}

export const ProviderIcon = ({ model, className }: { model: string; className?: string }): JSX.Element => {
    if (model.startsWith('openai/')) {
        return <OpenAILogo className={className} />
    }
    if (model.startsWith('anthropic/')) {
        return <AnthropicLogo className={className} />
    }
    return <></>
}

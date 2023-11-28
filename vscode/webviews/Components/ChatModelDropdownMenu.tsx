import React, { useCallback, useState } from 'react'

import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react'

import { ChatModelDropdownMenuProps } from '@sourcegraph/cody-ui/src/Chat'
import { AnthropicLogo, OpenAILogo } from '@sourcegraph/cody-ui/src/icons/LLMProviderIcons'

import styles from './ChatModelDropdownMenu.module.css'

export const ChatModelDropdownMenu: React.FunctionComponent<ChatModelDropdownMenuProps> = ({
    models,
    disabled, // disabled is true when transcript length is > 1
    onCurrentChatModelChange,
    userInfo,
}) => {
    const [currentModel, setCurrentModel] = useState(models.find(m => m.default) || models[0])
    const handleChange = useCallback(
        (event: any): void => {
            const selectedModel = models[event.target?.selectedIndex]
            onCurrentChatModelChange(selectedModel)
            setCurrentModel(selectedModel)
        },
        [models, onCurrentChatModelChange]
    )

    if (!models.length || models.length < 1) {
        return null
    }

    const isCodyProUser = userInfo.isDotComUser && userInfo.isCodyProUser
    const isEnterpriseUser = !userInfo.isDotComUser

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
                disabled={!isCodyProUser || disabled}
                className={styles.dropdownContainer}
                onChange={handleChange}
                title={
                    isCodyProUser
                        ? disabled
                            ? tooltips.disabled.codyProUser
                            : tooltips.enabled
                        : isEnterpriseUser
                        ? tooltips.disabled.enterpriseUser
                        : tooltips.disabled.dotComUser
                }
            >
                {models?.map((option, index) => (
                    <VSCodeOption className={styles.option} key={option.model} id={index.toString()}>
                        <ProviderIcon model={option.model} />
                        <span>
                            <span className={styles.title}>{option.title}</span>
                            <span className={styles.provider}>{` by ${option.provider}`}</span>
                        </span>
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

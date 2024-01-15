import React, { useCallback, useRef, useState, type ComponentProps } from 'react'

import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { type ChatModelDropdownMenuProps } from '@sourcegraph/cody-ui/src/Chat'
import { AnthropicLogo, MistralLogo, OpenAILogo } from '@sourcegraph/cody-ui/src/icons/LLMProviderIcons'

import { getVSCodeAPI } from '../utils/VSCodeApi'

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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const selectedModel = models[event.target?.selectedIndex]
            if (showCodyProBadge && selectedModel.codyProOnly) {
                getVSCodeAPI().postMessage({ command: 'links', value: 'https://sourcegraph.com/cody/subscription' })
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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
                        <ProviderIcon model={option.model} />
                        <span
                            className={classNames(
                                styles.titleContainer,
                                isModelDisabled(option.codyProOnly) && styles.disabled
                            )}
                            title={isEnterpriseUser ? 'Chat model set by your Sourcegraph Enterprise admin' : undefined}
                        >
                            <span className={styles.title}>{option.title}</span>
                            <span className={styles.provider}>{` by ${option.provider}`}</span>
                        </span>
                        {isModelDisabled(option.codyProOnly) && <span className={styles.badge}>Pro</span>}
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

const ProviderIcon = ({ model, className }: { model: string; className?: string }): JSX.Element => {
    if (model.startsWith('openai/')) {
        return <OpenAILogo className={className} />
    }
    if (model.startsWith('anthropic/')) {
        return <AnthropicLogo className={className} />
    }
    if (model.includes('mixtral')) {
        return <MistralLogo className={className} />
    }
    return <></>
}

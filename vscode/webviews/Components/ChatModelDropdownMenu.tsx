import type React from 'react'
import { type ComponentProps, type FunctionComponent, useCallback, useRef, useState } from 'react'

import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { getVSCodeAPI } from '../utils/VSCodeApi'

import type { ModelProvider } from '@sourcegraph/cody-shared'
import type { UserAccountInfo } from '../Chat'
import styles from './ChatModelDropdownMenu.module.css'
import { chatModelIconComponent } from './ChatModelIcon'

type DropdownProps = ComponentProps<typeof VSCodeDropdown>

export interface ChatModelDropdownMenuProps {
    models: ModelProvider[]
    disabled: boolean // Disabled when transcript length > 1
    onCurrentChatModelChange: (model: ModelProvider) => void
    userInfo: Pick<UserAccountInfo, 'isCodyProUser' | 'isDotComUser'>
}

export const ChatModelDropdownMenu: React.FunctionComponent<ChatModelDropdownMenuProps> = ({
    models,
    disabled, // disabled is true when transcript length is > 1
    onCurrentChatModelChange,
    userInfo,
}) => {
    const [currentModel, setCurrentModel] = useState(models.find(m => m.default) || models[0])
    const dropdownRef = useRef<DropdownProps>(null)

    const isCodyProUser = userInfo.isDotComUser && userInfo.isCodyProUser
    const isEnterpriseUser = !userInfo.isDotComUser
    const showCodyProBadge = !isEnterpriseUser && !isCodyProUser

    const onChange = useCallback(
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
                onChange={onChange}
                value={currentModel.model}
                aria-label="Choose a model"
                {...(!disabled && enabledDropdownProps)}
            >
                {models?.map((option, index) => (
                    <VSCodeOption
                        className={styles.option}
                        key={option.model}
                        value={option.model}
                        title={
                            isModelDisabled(option.codyProOnly)
                                ? `Upgrade to Cody Pro to use ${option.title}`
                                : undefined
                        }
                    >
                        <ChatModelIcon model={option.model} />
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
                            <span className={styles.provider}>{` by ${capitalize(
                                option.provider
                            )}`}</span>
                        </span>
                        <span className={styles.badge}>
                            {isModelDisabled(option.codyProOnly) && (
                                <span className={styles.codyProBadge}>Pro</span>
                            )}
                            {option.provider === 'Ollama' && (
                                <span className={styles.experimentalBadge}>Experimental</span>
                            )}
                        </span>
                    </VSCodeOption>
                ))}

                <div slot="selected-value" className={styles.selectedValue}>
                    <ChatModelIcon model={currentModel.model} />
                    <span>
                        <span className={styles.title}>{currentModel.title}</span>
                    </span>
                </div>
            </VSCodeDropdown>
        </div>
    )
}

const ChatModelIcon: FunctionComponent<{ model: string }> = ({ model }) => {
    const ModelIcon = chatModelIconComponent(model)
    return ModelIcon ? <ModelIcon size={16} /> : null
}

const capitalize = (s: string): string =>
    s
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')

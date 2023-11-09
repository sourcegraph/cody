import React, { useCallback, useState } from 'react'

import { VSCodeDropdown, VSCodeOption } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'

import { ChatModelSelection } from '@sourcegraph/cody-ui/src/Chat'
import { AnthropicLogo, OpenAILogo } from '@sourcegraph/cody-ui/src/icons/LLMProviderIcons'

import { getVSCodeAPI } from '../utils/VSCodeApi'

import styles from './ChatModelDropdownMenu.module.css'

export const ChatModelDropdownMenu: React.FunctionComponent<{
    models: ChatModelSelection[]
    disabled: boolean
}> = ({ models, disabled }) => {
    const [currentModel, setCurrentModel] = useState(models.find(m => m.default) || models[0])

    const handleClick = useCallback((model: ChatModelSelection): void => {
        getVSCodeAPI().postMessage({ command: 'chatModel', model: model.model })
        setCurrentModel(model)
    }, [])

    if (!models.length || models.length < 1) {
        return null
    }

    return (
        <div
            className={styles.container}
            title={disabled ? 'Start a new chat to use a different model' : currentModel.title}
        >
            <span className={classNames(styles.title, disabled && styles.disabled)}>
                <ProviderIcon model={currentModel.model} className={styles.headerLogo} />
            </span>
            <VSCodeDropdown disabled={disabled} className={styles.dropdownContainer}>
                {models?.map((option, index) => (
                    <VSCodeOption
                        className={styles.option}
                        key={option.model}
                        id={index.toString()}
                        selected={currentModel.model === option.model}
                        onClick={() => handleClick(option)}
                    >
                        <ProviderIcon model={option.model} className={styles.logo} />
                        {`${option.title} by ${option.provider}`}
                    </VSCodeOption>
                ))}
            </VSCodeDropdown>
        </div>
    )
}

export const ProviderIcon = ({ model, className }: { model: string; className?: string }): JSX.Element => {
    return model.startsWith('openai/') ? <OpenAILogo className={className} /> : <AnthropicLogo className={className} />
}

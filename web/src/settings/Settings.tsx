import React, { useCallback, useState } from 'react'

import classNames from 'classnames'
import { isEqual } from 'lodash'

import { useConfig, WebConfiguration } from './useConfig'

import styles from './Settings.module.css'

const SAMPLE_PUBLIC_CODEBASES = ['github.com/sourcegraph/sourcegraph', 'github.com/hashicorp/errwrap']

const PRE_CHAT_HOOK_INPUT_NAME = 'hooks.preChat[0]'

export const Settings: React.FunctionComponent<{
    config: WebConfiguration
    setConfig: ReturnType<typeof useConfig>[1]
}> = ({ config, setConfig }) => {
    const [pendingConfig, setPendingConfig] = useState<WebConfiguration>()
    const onInput = useCallback<React.FormEventHandler<HTMLInputElement | HTMLTextAreaElement>>(
        event => {
            const { name, value } = event.currentTarget
            setPendingConfig(prev => {
                const base = prev ?? config
                const updated: WebConfiguration =
                    name === PRE_CHAT_HOOK_INPUT_NAME
                        ? { ...base, hooks: { preChat: [value] } }
                        : {
                              ...base,
                              [name]: value,
                          }
                if (isEqual(updated, config)) {
                    return undefined // no changes vs. applied config
                }
                return updated
            })
        },
        [config]
    )

    const onApply = useCallback<React.FormEventHandler>(
        event => {
            event.preventDefault()
            if (pendingConfig) {
                setConfig(pendingConfig)
            }
            setPendingConfig(undefined)
        },
        [pendingConfig, setConfig]
    )

    const sampleCodebases = config.serverEndpoint === 'https://sourcegraph.com' ? SAMPLE_PUBLIC_CODEBASES : null

    return (
        <aside className={styles.container}>
            <form className={styles.form} onSubmit={onApply}>
                <label className={styles.label}>
                    Sourcegraph URL{' '}
                    <input
                        name="serverEndpoint"
                        type="url"
                        required={true}
                        value={pendingConfig?.serverEndpoint ?? config.serverEndpoint}
                        onInput={onInput}
                        size={18}
                    />
                </label>
                <label className={styles.label}>
                    Access token{' '}
                    <input
                        name="accessToken"
                        type="password"
                        value={pendingConfig?.accessToken ?? config?.accessToken ?? ''}
                        onInput={onInput}
                        size={8}
                    />
                </label>
                <label className={styles.label}>
                    Codebase{' '}
                    <input
                        name="codebase"
                        type="text"
                        value={pendingConfig?.codebase ?? config.codebase ?? ''}
                        onInput={onInput}
                        list="codebases"
                        size={24}
                    />
                    {sampleCodebases && (
                        <datalist id="codebases">
                            {sampleCodebases.map(codebase => (
                                <option key={codebase} value={codebase} />
                            ))}
                        </datalist>
                    )}
                </label>
                <label className={classNames(styles.label, styles.hookLabel)}>
                    Pre-chat hook{' '}
                    <textarea
                        name={PRE_CHAT_HOOK_INPUT_NAME}
                        value={pendingConfig?.hooks?.preChat?.[0] ?? config.hooks?.preChat?.[0] ?? ''}
                        onChange={onInput}
                    />
                </label>

                <button type="submit" className={styles.button} disabled={!pendingConfig}>
                    Apply
                </button>
            </form>
        </aside>
    )
}

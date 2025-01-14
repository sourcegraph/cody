import classNames from 'classnames'
import { type FC, type FunctionComponent, useLayoutEffect, useMemo, useState } from 'react'

import {
    type CodyClientConfig,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import { AppWrapper } from 'cody-ai/webviews/AppWrapper'
import type { VSCodeWrapper } from 'cody-ai/webviews/utils/VSCodeApi'

import {
    ChatMentionContext,
    type ChatMentionsSettings,
    PromptEditorV2,
} from '@sourcegraph/prompt-editor'
import { getAppWrappers } from 'cody-ai/webviews/App'
import { useClientActionDispatcher } from 'cody-ai/webviews/client/clientState'
import type { View } from 'cody-ai/webviews/tabs'
import { ComposedWrappers, type Wrapper } from 'cody-ai/webviews/utils/composeWrappers'
import { createWebviewTelemetryRecorder } from 'cody-ai/webviews/utils/telemetry'
import type { Config } from 'cody-ai/webviews/utils/useConfig'

import type { CodyExternalApi, InitialContext } from '../types'

import { useCodyWebAgent } from './use-cody-agent'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import styles from './CodyPromptTemplate.module.css'

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [],
})

export interface CodyPromptTemplateProps {
    serverEndpoint: string
    accessToken: string | null
    createAgentWorker: () => Worker
    setMessage: (m: SerializedPromptEditorValue) => void
    telemetryClientName?: string
    initialContext?: InitialContext
    customHeaders?: Record<string, string>
    className?: string

    /**
     * Whenever an external (imperative) Cody Chat API instance is ready,
     * for example it gives you ability to run prompt, Note that this handler
     * should be memoized and not change between components re-render, otherwise
     * it will be stuck in infinite update loop
     */
    onExternalApiReady?: (api: CodyExternalApi) => void

    initialEditorState?: SerializedPromptEditorState | undefined
    disabled?: boolean
    placeholder?: string
}
/**
 * The root component node for Cody Prompt Template editing, implements all things necessary
 * to run this with @ mentions in the prompt template editor.
 */
export const CodyPromptTemplate: FunctionComponent<CodyPromptTemplateProps> = ({
    serverEndpoint,
    accessToken,
    createAgentWorker,
    initialContext,
    telemetryClientName,
    customHeaders,
    className,
    onExternalApiReady,
    setMessage,
    disabled,
    initialEditorState,
    placeholder,
}) => {
    const { client, vscodeAPI } = useCodyWebAgent({
        serverEndpoint,
        accessToken,
        createAgentWorker,
        initialContext,
        telemetryClientName,
        customHeaders,
    })

    if (isErrorLike(client)) {
        return <p>Cody Web client agent error: {client.message}</p>
    }

    if (client === null || vscodeAPI === null) {
        return <p>Error: Client and api have not been initialized.</p>
    }

    return (
        <AppWrapper>
            <div className={classNames(className, styles.root)}>
                <Panel
                    vscodeAPI={vscodeAPI}
                    initialContext={initialContext}
                    className={styles.container}
                    onExternalApiReady={onExternalApiReady}
                    setMessage={setMessage}
                    disabled={disabled}
                    initialEditorState={initialEditorState}
                    placeholder={placeholder}
                />
            </div>
        </AppWrapper>
    )
}

interface PanelProps {
    vscodeAPI: VSCodeWrapper
    initialContext: InitialContext | undefined
    setMessage: (m: SerializedPromptEditorValue) => void
    initialEditorState?: SerializedPromptEditorState | undefined
    disabled?: boolean
    className?: string
    onExternalApiReady?: (api: CodyExternalApi) => void
    placeholder?: string
}

const Panel: FC<PanelProps> = props => {
    const {
        vscodeAPI,
        initialContext: initialContextData,
        className,
        setMessage,
        disabled,
        initialEditorState,
        placeholder,
    } = props

    const dispatchClientAction = useClientActionDispatcher()
    const [_errorMessages, setErrorMessages] = useState<string[]>([])
    const [config, setConfig] = useState<Config | null>(null)
    const [clientConfig, setClientConfig] = useState<CodyClientConfig | null>(null)
    const [view, setView] = useState<View | undefined>()

    useLayoutEffect(() => {
        vscodeAPI.onMessage(message => {
            switch (message.type) {
                case 'errors':
                    setErrorMessages(prev => [...prev, message.errors].slice(-5))
                    break
                case 'view':
                    setView(message.view)
                    break
                case 'config':
                    message.config.webviewType = 'sidebar'
                    message.config.multipleWebviewsEnabled = false
                    setConfig(message)
                    break
                case 'clientConfig':
                    if (message.clientConfig) {
                        setClientConfig(message.clientConfig)
                    }
                    break
                case 'clientAction':
                    dispatchClientAction(message)
                    break
            }
        })
    }, [vscodeAPI, dispatchClientAction])

    // V2 telemetry recorder
    const telemetryRecorder = useMemo(() => createWebviewTelemetryRecorder(vscodeAPI), [vscodeAPI])

    const wrappers = useMemo<Wrapper[]>(
        () =>
            getAppWrappers({
                vscodeAPI,
                telemetryRecorder,
                config,
                clientConfig,
                staticDefaultContext: undefined,
            }),
        [vscodeAPI, telemetryRecorder, config, clientConfig]
    )

    const CONTEXT_MENTIONS_SETTINGS = useMemo<ChatMentionsSettings>(() => {
        const { repository } = initialContextData ?? {}

        return {
            resolutionMode: 'remote',
            remoteRepositoriesNames: repository?.name ? [repository.name] : [],
        }
    }, [initialContextData])

    const isLoading = !config || !view

    return (
        <div className={className} data-cody-web-chat={true}>
            {!isLoading && (
                <ChatMentionContext.Provider value={CONTEXT_MENTIONS_SETTINGS}>
                    <ComposedWrappers wrappers={wrappers}>
                        <PromptEditorV2
                            seamless={true}
                            placeholder={placeholder}
                            initialEditorState={initialEditorState}
                            onChange={setMessage}
                            disabled={disabled}
                            contextWindowSizeInTokens={4096}
                            editorClassName={styles.editor}
                            contentEditableClassName={styles.editorContentEditable}
                        />
                    </ComposedWrappers>
                </ChatMentionContext.Provider>
            )}
        </div>
    )
}

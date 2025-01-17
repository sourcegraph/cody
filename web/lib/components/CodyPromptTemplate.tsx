import classNames from 'classnames'
import {
    type FC,
    type FunctionComponent,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react'

import {
    type CodyClientConfig,
    type SerializedPromptEditorState,
    isErrorLike,
    setDisplayPathEnvInfo,
} from '@sourcegraph/cody-shared'
import { AppWrapper } from 'cody-ai/webviews/AppWrapper'
import type { VSCodeWrapper } from 'cody-ai/webviews/utils/VSCodeApi'

import {
    ChatMentionContext,
    type ChatMentionsSettings,
    PromptEditor,
    type PromptEditorRefAPI,
} from '@sourcegraph/prompt-editor'
import { getAppWrappers } from 'cody-ai/webviews/App'
import { useClientActionDispatcher } from 'cody-ai/webviews/client/clientState'
import { ComposedWrappers, type Wrapper } from 'cody-ai/webviews/utils/composeWrappers'
import { createWebviewTelemetryRecorder } from 'cody-ai/webviews/utils/telemetry'

import { useCodyWebAgent } from './use-cody-agent'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import styles from './CodyPromptTemplate.module.css'
import { PromptTemplateSkeleton } from './skeleton/ChatSkeleton'

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
    telemetryClientName?: string
    customHeaders?: Record<string, string>
    className?: string

    initialEditorState?: SerializedPromptEditorState | undefined
    disabled?: boolean
    placeholder?: string

    /**
     * Whenever an external (imperative) Cody Chat API instance is ready,
     * for example it gives you ability to run prompt, Note that this handler
     * should be memoized and not change between components re-render, otherwise
     * it will be stuck in infinite update loop
     */
    onEditorApiReady?: (api: PromptEditorRefAPI) => void
}
/**
 * The root component node for Cody Prompt Template editing, implements all things necessary
 * to run this with @ mentions in the prompt template editor.
 */
export const CodyPromptTemplate: FunctionComponent<CodyPromptTemplateProps> = ({
    serverEndpoint,
    accessToken,
    createAgentWorker,
    telemetryClientName,
    customHeaders,
    className,
    disabled,
    initialEditorState,
    placeholder,
    onEditorApiReady,
}) => {
    const { client, vscodeAPI } = useCodyWebAgent({
        serverEndpoint,
        accessToken,
        createAgentWorker,
        telemetryClientName,
        customHeaders,
    })

    if (isErrorLike(client)) {
        return <p>Cody Web client agent error: {client.message}</p>
    }

    if (client === null || vscodeAPI === null) {
        return <PromptTemplateSkeleton className={classNames(className, styles.root)} />
    }

    return (
        <AppWrapper>
            <div className={classNames(className, styles.root)}>
                <CodyPromptTemplatePanel
                    vscodeAPI={vscodeAPI}
                    className={styles.container}
                    disabled={disabled}
                    initialEditorState={initialEditorState}
                    placeholder={placeholder}
                    onEditorApiReady={onEditorApiReady}
                />
            </div>
        </AppWrapper>
    )
}

interface PanelProps {
    vscodeAPI: VSCodeWrapper
    initialEditorState?: SerializedPromptEditorState | undefined
    disabled?: boolean
    className?: string
    placeholder?: string
    onEditorApiReady?: (api: PromptEditorRefAPI) => void
}

const CodyPromptTemplatePanel: FC<PanelProps> = props => {
    const { vscodeAPI, className, disabled, initialEditorState, placeholder, onEditorApiReady } = props

    const dispatchClientAction = useClientActionDispatcher()
    const [clientConfig, setClientConfig] = useState<CodyClientConfig | null>(null)
    const editorRef = useRef<PromptEditorRefAPI>(null)
    // biome-ignore lint/correctness/useExhaustiveDependencies:
    useEffect(() => {
        if (editorRef?.current && onEditorApiReady) {
            onEditorApiReady(editorRef.current)
        }
    }, [onEditorApiReady, editorRef?.current])

    useLayoutEffect(() => {
        vscodeAPI.onMessage(message => {
            switch (message.type) {
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
                config: null,
                clientConfig,
                staticDefaultContext: undefined,
            }),
        [vscodeAPI, telemetryRecorder, clientConfig]
    )

    const CONTEXT_MENTIONS_SETTINGS = useMemo<ChatMentionsSettings>(() => {
        return {
            resolutionMode: 'remote',
            remoteRepositoriesNames: [],
        }
    }, [])

    return (
        <div className={className} data-cody-web-chat={true}>
            <ChatMentionContext.Provider value={CONTEXT_MENTIONS_SETTINGS}>
                <ComposedWrappers wrappers={wrappers}>
                    <PromptEditor
                        editorRef={editorRef}
                        seamless={true}
                        placeholder={placeholder}
                        initialEditorState={initialEditorState}
                        disabled={disabled}
                        contextWindowSizeInTokens={4096}
                        editorClassName={styles.editor}
                        contentEditableClassName={styles.editorContentEditable}
                    />
                </ComposedWrappers>
            </ChatMentionContext.Provider>
        </div>
    )
}
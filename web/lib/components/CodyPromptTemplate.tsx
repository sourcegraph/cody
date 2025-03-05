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
    type ContextItem,
    type ContextItemCurrentDirectory,
    type ContextItemCurrentFile,
    type ContextItemCurrentOpenTabs,
    type ContextItemCurrentRepository,
    type ContextItemCurrentSelection,
    type DefaultContext,
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

import { type UseCodyWebAgentInput, useCodyWebAgent } from './use-cody-agent'

// Include global Cody Web styles to the styles bundle
import '../global-styles/styles.css'
import { Uri } from 'vscode'
import styles from './CodyPromptTemplate.module.css'
import { PromptTemplateSkeleton } from './skeleton/ChatSkeleton'

// Internal API mock call in order to set up web version of
// the cody agent properly (completely mock data)
setDisplayPathEnvInfo({
    isWindows: false,
    workspaceFolders: [],
})

export interface CodyPromptTemplateProps {
    agentConfig: UseCodyWebAgentInput
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
    agentConfig,
    className,
    disabled,
    initialEditorState,
    placeholder,
    onEditorApiReady,
}) => {
    const agent = useCodyWebAgent(agentConfig)

    useEffect(() => {
        if (agent && !isErrorLike(agent)) {
            // Without calling this function the at-mentions menu isn't properly populated.
            // TODO(@fkling): Find a way to make at-mentions work without having to call this function,
            // since it seems odd that we have to 'create a chat' if all we want to is to use the input.
            agent.createNewChat()
        }
    }, [agent])

    if (isErrorLike(agent)) {
        return <p>Cody Web client agent error: {agent.message}</p>
    }

    if (agent === null) {
        return <PromptTemplateSkeleton className={classNames(className, styles.root)} />
    }

    return (
        <AppWrapper>
            <div className={classNames(className, styles.root)}>
                <CodyPromptTemplatePanel
                    vscodeAPI={agent.vscodeAPI}
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

    const staticDefaultContext = useMemo<DefaultContext>((): DefaultContext => {
        return { initialContext: [], corpusContext: DYNAMIC_MENTIONS }
    }, [])

    const wrappers = useMemo<Wrapper[]>(
        () =>
            getAppWrappers({
                vscodeAPI,
                telemetryRecorder,
                config: null,
                clientConfig,
                staticDefaultContext,
            }),
        [vscodeAPI, telemetryRecorder, clientConfig, staticDefaultContext]
    )

    const CONTEXT_MENTIONS_SETTINGS = useMemo<ChatMentionsSettings>(() => {
        return {
            resolutionMode: 'remote',
            remoteRepositoriesNames: [],
        }
    }, [])

    const openExternalLink = (uri: string) =>
        void vscodeAPI.postMessage({
            command: 'openURI',
            uri: Uri.parse(uri),
        })

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
                        openExternalLink={openExternalLink}
                    />
                </ComposedWrappers>
            </ChatMentionContext.Provider>
        </div>
    )
}

const DYNAMIC_MENTIONS: ContextItem[] = [
    {
        type: 'current-selection',
        id: 'current-selection',
        name: 'current-selection',
        title: 'Current Selection',
        uri: Uri.parse('cody://selection'),
        description: 'Picks the current selection',
        icon: 'square-dashed-mouse-pointer',
    } as ContextItemCurrentSelection,
    {
        type: 'current-file',
        id: 'current-file',
        name: 'current-file',
        title: 'Current File',
        uri: Uri.parse('cody://current-file'),
        description: 'Picks the current file',
        icon: 'file',
    } as ContextItemCurrentFile,
    {
        type: 'current-repository',
        id: 'current-repository',
        name: 'current-repository',
        title: 'Current Repository',
        uri: Uri.parse('cody://repository'),
        description: 'Picks the current repository',
        icon: 'git-folder',
    } as ContextItemCurrentRepository,
    {
        type: 'current-directory',
        id: 'current-directory',
        name: 'current-directory',
        title: 'Current Directory',
        uri: Uri.parse('cody://current-dir'),
        description: 'Picks the current directory',
        icon: 'folder',
    } as ContextItemCurrentDirectory,
    {
        type: 'current-open-tabs',
        id: 'current-open-tabs',
        name: 'current-open-tabs',
        title: 'Currently Open Tabs',
        uri: Uri.parse('cody://tabs'),
        description: 'Picks all currently open tabs',
        icon: 'layout-menubar',
    } as ContextItemCurrentOpenTabs,
]

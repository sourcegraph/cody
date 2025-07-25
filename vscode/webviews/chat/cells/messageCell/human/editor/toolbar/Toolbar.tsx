import type { WebviewToExtensionAPI } from '@sourcegraph/cody-shared'
import {
    type Action,
    type ChatMessage,
    type ContextItemMedia,
    type Model,
    ModelTag,
    isMacOS,
} from '@sourcegraph/cody-shared'
import clsx from 'clsx'
import { type FunctionComponent, useCallback, useEffect, useMemo, useRef } from 'react'
import type { UserAccountInfo } from '../../../../../../Chat'
import { ModelSelectField } from '../../../../../../components/modelSelectField/ModelSelectField'
import { PromptSelectField } from '../../../../../../components/promptSelectField/PromptSelectField'
import toolbarStyles from '../../../../../../components/shadcn/ui/toolbar.module.css'
import { useActionSelect } from '../../../../../../prompts/promptUtils'
import { useClientConfig } from '../../../../../../utils/useClientConfig'
import { MediaUploadButton } from './MediaUploadButton'
import { ModeSelectorField } from './ModeSelectorButton'
import { SubmitButton, type SubmitButtonState } from './SubmitButton'

/**
 * The toolbar for the human message editor.
 */
export const Toolbar: FunctionComponent<{
    models: Model[]
    userInfo: UserAccountInfo

    isEditorFocused: boolean

    onSubmitClick: (intent?: ChatMessage['intent']) => void
    submitState: SubmitButtonState

    /** Handler for clicks that are in the "gap" (dead space), not any toolbar items. */
    onGapClick?: () => void

    focusEditor?: () => void

    hidden?: boolean
    className?: string

    intent?: ChatMessage['intent']

    extensionAPI: WebviewToExtensionAPI

    onMediaUpload?: (mediaContextItem: ContextItemMedia) => void

    setLastManuallySelectedIntent: (intent: ChatMessage['intent']) => void
}> = ({
    isEditorFocused,
    onSubmitClick,
    submitState,
    onGapClick,
    focusEditor,
    hidden,
    className,
    models,
    intent,
    extensionAPI,
    onMediaUpload,
    setLastManuallySelectedIntent,
}) => {
    /**
     * If the user clicks in a gap or on the toolbar outside of any of its buttons, report back to
     * parent via {@link onGapClick}.
     */
    const onMaybeGapClick = useCallback(
        (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
            const targetIsToolbarButton = event.target !== event.currentTarget
            if (!targetIsToolbarButton) {
                event.preventDefault()
                event.stopPropagation()
                onGapClick?.()
            }
        },
        [onGapClick]
    )

    /**
     * Image upload is enabled if the user is not on Sourcegraph.com,
     * or is using a BYOK model with vision tag.
     */
    const isImageUploadEnabled = useMemo(() => {
        const selectedModel = models?.[0]
        return selectedModel?.tags?.includes(ModelTag.Vision)
    }, [models?.[0]])

    const modelSelectorRef = useRef<{ open: () => void; close: () => void } | null>(null)
    const promptSelectorRef = useRef<{ open: () => void; close: () => void } | null>(null)

    // Set up keyboard event listener
    useEffect(() => {
        const handleKeyboardShortcuts = (event: KeyboardEvent) => {
            // Model selector (⌘M on Mac, ctrl+M on other platforms)
            // metaKey is set to cmd(⌘) on macOS, and windows key on other platforms
            if ((isMacOS() ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'm') {
                event.preventDefault()
                modelSelectorRef?.current?.open()
            }
            // Prompt selector (⌘/ on Mac, ctrl+/ on other platforms)
            else if ((isMacOS() ? event.metaKey : event.ctrlKey) && event.key === '/') {
                event.preventDefault()
                promptSelectorRef?.current?.open()
            }
            // Close dropdowns on Escape
            else if (event.key === 'Escape') {
                modelSelectorRef?.current?.close()
                promptSelectorRef?.current?.close()
            }
        }

        window.addEventListener('keydown', handleKeyboardShortcuts)
        return () => window.removeEventListener('keydown', handleKeyboardShortcuts)
    }, [])

    return (
        <menu
            role="toolbar"
            aria-hidden={hidden}
            hidden={hidden}
            className={clsx(
                'tw-flex tw-items-center tw-justify-between tw-flex-wrap-reverse tw-border-t tw-border-t-border tw-gap-2 [&_>_*]:tw-flex-shrink-0',
                className
            )}
            onMouseDown={onMaybeGapClick}
            onClick={onMaybeGapClick}
            onKeyDown={() => null}
            data-testid="chat-editor-toolbar"
        >
            <div className="tw-flex tw-items-center">
                {onMediaUpload && isImageUploadEnabled && (
                    <MediaUploadButton
                        onMediaUpload={onMediaUpload}
                        isEditorFocused={isEditorFocused}
                        submitState={submitState}
                        className={`tw-opacity-60 focus-visible:tw-opacity-100 hover:tw-opacity-100 tw-mr-2 tw-gap-0.5 ${toolbarStyles.button} ${toolbarStyles.buttonSmallIcon}`}
                    />
                )}
                <PromptSelectFieldToolbarItem
                    focusEditor={focusEditor}
                    className="tw-ml-1 tw-mr-1"
                    promptSelectorRef={promptSelectorRef}
                />
                <ModeSelectorField
                    className={className}
                    _intent={intent}
                    isDotComUser={false}
                    isCodyProUser={false}
                    manuallySelectIntent={setLastManuallySelectedIntent}
                />
                {models?.length >= 2 && (
                    <ModelSelectFieldToolbarItem
                        models={models}
                        focusEditor={focusEditor}
                        modelSelectorRef={modelSelectorRef}
                        className="tw-mr-1"
                        extensionAPI={extensionAPI}
                        intent={intent}
                    />
                )}
            </div>
            <div className="tw-flex-1 tw-flex tw-justify-end">
                <SubmitButton onClick={onSubmitClick} state={submitState} />
            </div>
        </menu>
    )
}

const PromptSelectFieldToolbarItem: FunctionComponent<{
    focusEditor?: () => void
    className?: string
    promptSelectorRef?: React.MutableRefObject<{ open: () => void; close: () => void } | null>
}> = ({ focusEditor, className, promptSelectorRef }) => {
    const runAction = useActionSelect()

    const onSelect = useCallback(
        async (item: Action) => {
            await runAction(item, () => {})
            focusEditor?.()
        },
        [focusEditor, runAction]
    )

    return (
        <PromptSelectField
            onSelect={onSelect}
            onCloseByEscape={focusEditor}
            className={className}
            promptSelectorRef={promptSelectorRef}
        />
    )
}

const ModelSelectFieldToolbarItem: FunctionComponent<{
    models: Model[]
    focusEditor?: () => void
    className?: string
    extensionAPI: WebviewToExtensionAPI
    modelSelectorRef: React.MutableRefObject<{ open: () => void; close: () => void } | null>
    intent?: ChatMessage['intent']
}> = ({ focusEditor, className, models, extensionAPI, modelSelectorRef, intent }) => {
    const clientConfig = useClientConfig()
    const serverSentModelsEnabled = !!clientConfig?.modelsAPIEnabled

    const agenticModel = useMemo(() => models.find(m => m.tags.includes(ModelTag.Default)), [models])

    // If in agentic mode, ensure the agentic model is selected
    useEffect(() => {
        if (intent === 'agentic' && agenticModel && models[0]?.id !== agenticModel.id) {
            extensionAPI.setChatModel(agenticModel.id).subscribe({
                error: error => console.error('Failed to set chat model:', error),
            })
        }
    }, [intent, agenticModel, models, extensionAPI.setChatModel])

    const onModelSelect = useCallback(
        (model: Model) => {
            extensionAPI.setChatModel(model.id).subscribe({
                error: error => console.error('setChatModel:', error),
            })
            focusEditor?.()
        },
        [extensionAPI.setChatModel, focusEditor]
    )

    return (
        !!models?.length &&
        serverSentModelsEnabled && (
            <ModelSelectField
                models={models}
                onModelSelect={onModelSelect}
                serverSentModelsEnabled={serverSentModelsEnabled}
                className={className}
                data-testid="chat-model-selector"
                modelSelectorRef={modelSelectorRef}
                onCloseByEscape={() => modelSelectorRef?.current?.close()}
                intent={intent}
            />
        )
    )
}

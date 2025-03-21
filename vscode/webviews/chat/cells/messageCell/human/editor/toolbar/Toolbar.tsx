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
import { useActionSelect } from '../../../../../../prompts/PromptsTab'
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
    manuallySelectIntent: (intent: ChatMessage['intent']) => void

    extensionAPI: WebviewToExtensionAPI

    omniBoxEnabled: boolean
    onMediaUpload?: (mediaContextItem: ContextItemMedia) => void
}> = ({
    userInfo,
    isEditorFocused,
    onSubmitClick,
    submitState,
    onGapClick,
    focusEditor,
    hidden,
    className,
    models,
    intent,
    manuallySelectIntent,
    extensionAPI,
    omniBoxEnabled,
    onMediaUpload,
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
        const isDotCom = userInfo?.isDotComUser
        const selectedModel = models?.[0]
        const isBYOK = selectedModel?.tags?.includes(ModelTag.BYOK)
        const isVision = selectedModel?.tags?.includes(ModelTag.Vision)
        return (!isDotCom || isBYOK) && isVision
    }, [userInfo?.isDotComUser, models?.[0]])

    const modelSelectorRef = useRef<{ open: () => void; close: () => void } | null>(null)

    // Set up keyboard event listener
    useEffect(() => {
        const handleKeyboardShortcuts = (event: KeyboardEvent) => {
            // Model selector (⌘M on Mac, ctrl+M on other platforms)
            // metaKey is set to cmd(⌘) on macOS, and windows key on other platforms
            if ((isMacOS() ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'm') {
                event.preventDefault()
                modelSelectorRef?.current?.open()
            }

            // Close dropdowns on Escape
            else if (event.key === 'Escape') {
                modelSelectorRef?.current?.close()
            }
        }

        window.addEventListener('keydown', handleKeyboardShortcuts)
        return () => window.removeEventListener('keydown', handleKeyboardShortcuts)
    }, [])

    if (models?.length < 2) {
        return null
    }

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
                <PromptSelectFieldToolbarItem focusEditor={focusEditor} className="tw-ml-1 tw-mr-1" />
                <ModeSelectorField
                    className={className}
                    omniBoxEnabled={omniBoxEnabled}
                    _intent={intent}
                    isDotComUser={userInfo?.isDotComUser}
                    isCodyProUser={userInfo?.isCodyProUser}
                    manuallySelectIntent={manuallySelectIntent}
                />
                <ModelSelectFieldToolbarItem
                    models={models}
                    userInfo={userInfo}
                    focusEditor={focusEditor}
                    modelSelectorRef={modelSelectorRef}
                    className="tw-mr-1"
                    extensionAPI={extensionAPI}
                />
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
}> = ({ focusEditor, className }) => {
    const runAction = useActionSelect()

    const onSelect = useCallback(
        async (item: Action) => {
            await runAction(item, () => {})
            focusEditor?.()
        },
        [focusEditor, runAction]
    )

    return <PromptSelectField onSelect={onSelect} onCloseByEscape={focusEditor} className={className} />
}

const ModelSelectFieldToolbarItem: FunctionComponent<{
    models: Model[]
    userInfo: UserAccountInfo
    focusEditor?: () => void
    className?: string
    extensionAPI: WebviewToExtensionAPI
    modelSelectorRef: React.MutableRefObject<{ open: () => void; close: () => void } | null>
}> = ({ userInfo, focusEditor, className, models, extensionAPI, modelSelectorRef }) => {
    const clientConfig = useClientConfig()
    const serverSentModelsEnabled = !!clientConfig?.modelsAPIEnabled

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
        (userInfo.isDotComUser || serverSentModelsEnabled) && (
            <ModelSelectField
                models={models}
                onModelSelect={onModelSelect}
                serverSentModelsEnabled={serverSentModelsEnabled}
                userInfo={userInfo}
                className={className}
                data-testid="chat-model-selector"
                modelSelectorRef={modelSelectorRef}
                onCloseByEscape={() => modelSelectorRef?.current?.close()}
            />
        )
    )
}

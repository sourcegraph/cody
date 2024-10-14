import type { SerializedPromptEditorState } from '@sourcegraph/cody-shared'
import { PromptString, editorStateFromPromptString } from '@sourcegraph/cody-shared'
import { getContextFileFromDirectory } from '../commands/context/directory'
import { getContextFileFromTabs } from '../commands/context/open-tabs'
import { getFileContext, getSelectionOrFileContext } from '../commands/context/selection'
import { getWorkspaceContext } from '../commands/context/workspace'
import { selectedCodePromptWithExtraFiles } from '../commands/execute'

const PROMPT_CURRENT_FILE_PLACEHOLDER: string = '[[current file]]'
const PROMPT_CURRENT_SELECTION_PLACEHOLDER: string = '[[current selection]]'
const PROMPT_CURRENT_DIRECTORY_PLACEHOLDER: string = '[[current directory]]'
const PROMPT_EDITOR_OPEN_TABS_PLACEHOLDER: string = '[[open tabs]]'
const PROMPT_CURRENT_REPOSITORY_PLACEHOLDER: string = '[[current repository]]'

/**
 * This function replaces prompt generic mentions like current file, selection, directory,
 * etc. with actual context items mentions based on Editor context information.
 */
export async function hydratePromptText(promptRawText: string): Promise<SerializedPromptEditorState> {
    const promptText = PromptString.unsafe_fromUserQuery(promptRawText)
    const promptTextMentionMatches = promptText.toString().match(/\[\[[^\]]*\]\]/gm) ?? []

    let hydratedPromptText = promptText

    for (const currentMatch of promptTextMentionMatches) {
        switch (currentMatch) {
            case PROMPT_CURRENT_FILE_PLACEHOLDER:
                hydratedPromptText = await hydrateWithCurrentFile(hydratedPromptText)
                continue
            case PROMPT_CURRENT_SELECTION_PLACEHOLDER:
                hydratedPromptText = await hydrateWithCurrentSelection(hydratedPromptText)
                continue
            case PROMPT_CURRENT_DIRECTORY_PLACEHOLDER:
                hydratedPromptText = await hydrateWithCurrentDirectory(hydratedPromptText)
                continue
            case PROMPT_EDITOR_OPEN_TABS_PLACEHOLDER:
                hydratedPromptText = await hydrateWithOpenTabs(hydratedPromptText)
                continue
            case PROMPT_CURRENT_REPOSITORY_PLACEHOLDER:
                hydratedPromptText = await hydrateWithCurrentWorkspace(hydratedPromptText)
        }
    }

    return editorStateFromPromptString(hydratedPromptText)
}

async function hydrateWithCurrentFile(promptText: PromptString): Promise<PromptString> {
    const currentFileContextItem = await getFileContext()

    // TODO (vk): Add support for error notification if prompt hydration fails
    if (currentFileContextItem === null) {
        return promptText
    }

    return promptText.replaceAll(
        PROMPT_CURRENT_FILE_PLACEHOLDER,
        selectedCodePromptWithExtraFiles(currentFileContextItem, [])
    )
}

async function hydrateWithCurrentSelection(promptText: PromptString): Promise<PromptString> {
    const currentSelection = (await getSelectionOrFileContext())[0]

    // TODO (vk): Add support for error notification if prompt hydration fails
    if (!currentSelection) {
        return promptText
    }

    return promptText.replaceAll(
        PROMPT_CURRENT_SELECTION_PLACEHOLDER,
        selectedCodePromptWithExtraFiles(currentSelection, [])
    )
}

async function hydrateWithCurrentDirectory(promptText: PromptString): Promise<PromptString> {
    const currentFileContextItem = await getFileContext()

    // TODO (vk): Add support for error notification if prompt hydration fails
    if (!currentFileContextItem) {
        return promptText
    }

    // Currently we just search files in the directory that contains opened files
    // and include these files mentions, but it would be better to support openctx
    // remote directory mentions here to enhance functionality of prompt directory
    // mentions
    const directoryFiles = await getContextFileFromDirectory()

    return promptText.replaceAll(
        PROMPT_CURRENT_DIRECTORY_PLACEHOLDER,
        selectedCodePromptWithExtraFiles(currentFileContextItem, directoryFiles)
    )
}

async function hydrateWithOpenTabs(promptText: PromptString): Promise<PromptString> {
    const openTabs = await getContextFileFromTabs()

    if (openTabs.length === 0) {
        return promptText
    }

    const [firstOpenTab, ...otherOpenTabs] = openTabs

    return promptText.replaceAll(
        PROMPT_EDITOR_OPEN_TABS_PLACEHOLDER,
        selectedCodePromptWithExtraFiles(firstOpenTab, otherOpenTabs)
    )
}

async function hydrateWithCurrentWorkspace(promptText: PromptString) {
    const currentWorkspace = getWorkspaceContext()

    // TODO (vk): Add support for error notification if prompt hydration fails
    if (!currentWorkspace) {
        return promptText
    }

    return promptText.replaceAll(
        PROMPT_CURRENT_REPOSITORY_PLACEHOLDER,
        selectedCodePromptWithExtraFiles(currentWorkspace, [])
    )
}

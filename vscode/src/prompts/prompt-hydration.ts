import type {
    ContextItem,
    ContextItemOpenCtx,
    SerializedPromptEditorState,
} from '@sourcegraph/cody-shared'
import {
    ContextItemSource,
    PromptString,
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
    contextFiltersProvider,
    currentAuthStatusAuthed,
    displayPath,
    editorStateFromPromptString,
    firstValueFrom,
    isError,
    pendingOperation,
} from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { contextItemMentionFromOpenCtxItem } from '../chat/context/chatContext'
import { getContextFileFromTabs } from '../commands/context/open-tabs'
import { getFileContext, getSelectionOrFileContext } from '../commands/context/selection'
import { selectedCodePromptWithExtraFiles } from '../commands/execute'
import { createRepositoryMention } from '../context/openctx/common/get-repository-mentions'
import { remoteReposForAllWorkspaceFolders } from '../repository/remoteRepos'
import { getCurrentRepositoryInfo } from './utils';

const PROMPT_CURRENT_FILE_PLACEHOLDER: string = '[[current file]]'
const PROMPT_CURRENT_SELECTION_PLACEHOLDER: string = '[[current selection]]'
const PROMPT_CURRENT_DIRECTORY_PLACEHOLDER: string = '[[current directory]]'
const PROMPT_EDITOR_OPEN_TABS_PLACEHOLDER: string = '[[open tabs]]'
const PROMPT_CURRENT_REPOSITORY_PLACEHOLDER: string = '[[current repository]]'

/**
 * Be default IDE itself can figure out all needed context via vscode API,
 * for Cody Web where we don't hava access to this API (or way to override this)
 * we pass static initial context from the main thread (current repo, file, dir, etc.)
 */
export type PromptHydrationInitialContext = ContextItem[]

type PromptHydrationModifier = (promptText: PromptString, initialContext: PromptHydrationInitialContext) =>
    Promise<[PromptString, ContextItem[]]>

const PROMPT_HYDRATION_MODIFIERS: Record<string, PromptHydrationModifier> = {
    [PROMPT_CURRENT_FILE_PLACEHOLDER]: hydrateWithCurrentFile,
    [PROMPT_CURRENT_SELECTION_PLACEHOLDER]: hydrateWithCurrentSelection,
    [PROMPT_CURRENT_DIRECTORY_PLACEHOLDER]: hydrateWithCurrentDirectory,
    [PROMPT_EDITOR_OPEN_TABS_PLACEHOLDER]: hydrateWithOpenTabs,
    [PROMPT_CURRENT_REPOSITORY_PLACEHOLDER]: hydrateWithCurrentWorkspace,
}

/**
 * This function replaces prompt generic mentions like current file, selection, directory,
 * etc. with actual context items mentions based on Editor context information.
 */
export async function hydratePromptText(promptRawText: string, initialContext: PromptHydrationInitialContext): Promise<SerializedPromptEditorState> {
    const promptText = PromptString.unsafe_fromUserQuery(promptRawText)
    const promptTextMentionMatches = promptText.toString().match(/\[\[[^\]]*\]\]/gm) ?? []

    let hydratedPromptText = promptText
    const contextItemsMap = new Map<string, ContextItem>()

    for (const currentMatch of promptTextMentionMatches) {
        const hydrateModifier = PROMPT_HYDRATION_MODIFIERS[currentMatch]

        if (!hydrateModifier) {
            continue
        }

        const [nextPromptText, contextItems] = await hydrateModifier(hydratedPromptText, initialContext)
        hydratedPromptText = nextPromptText

        for (const item of contextItems) {
            contextItemsMap.set(displayPath(item.uri), item)
        }
    }

    return editorStateFromPromptString(hydratedPromptText, {
        additionalContextItemsMap: contextItemsMap,
    })
}

async function hydrateWithCurrentFile(promptText: PromptString, initialContext: PromptHydrationInitialContext): Promise<[PromptString, ContextItem[]]> {
    // Check if initial context already contains current file (Cody Web case)
    const initialContextFile = initialContext.find(item => item.type === 'file')
    const currentFileContextItem = initialContextFile ?? await getFileContext()

    // TODO (vk): Add support for error notification if prompt hydration fails
    if (currentFileContextItem === null) {
        return [promptText, []]
    }

    return [
        promptText.replaceAll(
            PROMPT_CURRENT_FILE_PLACEHOLDER,
            selectedCodePromptWithExtraFiles(currentFileContextItem, [])
        ),
        [currentFileContextItem],
    ]
}

async function hydrateWithCurrentSelection(
    promptText: PromptString,
    initialContext: PromptHydrationInitialContext
): Promise<[PromptString, ContextItem[]]> {
    // Check if initial context already contains current file with selection (Cody Web case)
    const initialContextFile = initialContext
        .find(item => item.type === 'file' && item.range)

    const currentSelection = initialContextFile ?? (await getSelectionOrFileContext())[0]

    // TODO (vk): Add support for error notification if prompt hydration fails
    if (!currentSelection) {
        return [promptText, []]
    }

    return [
        promptText.replaceAll(
            PROMPT_CURRENT_SELECTION_PLACEHOLDER,
            selectedCodePromptWithExtraFiles(currentSelection, [])
        ),
        [currentSelection],
    ]
}

async function hydrateWithCurrentDirectory(
    promptText: PromptString,
    initialContext: PromptHydrationInitialContext
): Promise<[PromptString, ContextItem[]]> {
    const initialContextDirectory = initialContext
        .find(item => item.type === 'openctx' && item.providerUri === REMOTE_DIRECTORY_PROVIDER_URI)

    if (initialContextDirectory) {
        return [
            promptText.replaceAll(
                PROMPT_CURRENT_DIRECTORY_PLACEHOLDER,
                selectedCodePromptWithExtraFiles(initialContextDirectory, [])
            ),
            [initialContextDirectory],
        ]
    }

    const initialContextFile = initialContext
        .find(item => item.type === 'file')

    const currentFileContextItem = initialContextFile ?? await getFileContext()
    const currentRepository = await getCurrentRepositoryInfo(initialContext)

    // TODO (vk): Add support for error notification if prompt hydration fails
    if (!currentFileContextItem || !currentRepository) {
        return [promptText, []]
    }

    const repoName = currentRepository.name.split('/').at(-1)
    const fullDirectoryPath = currentFileContextItem.uri.toString().split('/').slice(0, -1).join('/')
    const directoryPath = repoName
        ? fullDirectoryPath.split(`${repoName}/`).at(-1) ?? fullDirectoryPath
        : fullDirectoryPath

    const directoryItem: ContextItemOpenCtx = {
        type: 'openctx',
        provider: 'openctx',
        title: directoryPath,
        uri: URI.file(`${currentRepository.name}/${directoryPath}/`),
        providerUri: REMOTE_DIRECTORY_PROVIDER_URI,
        description: 'Current Directory',
        source: ContextItemSource.Initial,
        mention: {
            description: directoryPath,
            uri: `${currentRepository.name}/${directoryPath}/`,
            data: {
                repoID: currentRepository.id,
                repoName: currentRepository.name,
                directoryPath: `${directoryPath}/`,
            },
        },
    }

    return [
        promptText.replaceAll(
            PROMPT_CURRENT_DIRECTORY_PLACEHOLDER,
            selectedCodePromptWithExtraFiles(directoryItem, [])
        ),
        [directoryItem],
    ]
}

async function hydrateWithOpenTabs(promptText: PromptString): Promise<[PromptString, ContextItem[]]> {
    const openTabs = await getContextFileFromTabs()

    if (openTabs.length === 0) {
        return [promptText, []]
    }

    const [firstOpenTab, ...otherOpenTabs] = openTabs

    return [
        promptText.replaceAll(
            PROMPT_EDITOR_OPEN_TABS_PLACEHOLDER,
            selectedCodePromptWithExtraFiles(firstOpenTab, otherOpenTabs)
        ),
        [firstOpenTab, ...otherOpenTabs],
    ]
}

async function hydrateWithCurrentWorkspace(
    promptText: PromptString,
    initialContext: PromptHydrationInitialContext
): Promise<[PromptString, ContextItem[]]> {
    const initialContextRepository = initialContext.find(item => item.type === 'repository')

    if (initialContextRepository) {
        return [
            promptText.replaceAll(
                PROMPT_CURRENT_REPOSITORY_PLACEHOLDER,
                selectedCodePromptWithExtraFiles(initialContextRepository, [])
            ),
            [initialContextRepository],
        ]
    }

    const authStatus = currentAuthStatusAuthed()
    const workspaceFolders = await firstValueFrom(remoteReposForAllWorkspaceFolders)

    const items = []

    if (workspaceFolders === pendingOperation) {
        return [promptText, []]
    }

    if (isError(workspaceFolders)) {
        throw workspaceFolders
    }

    for (const repo of workspaceFolders) {
        if (await contextFiltersProvider.isRepoNameIgnored(repo.name)) {
            continue
        }
        if (repo.id === undefined) {
            continue
        }

        items.push({
            ...contextItemMentionFromOpenCtxItem(
                await createRepositoryMention(
                    {
                        id: repo.id,
                        name: repo.name,
                        url: repo.name,
                    },
                    REMOTE_REPOSITORY_PROVIDER_URI,
                    authStatus
                )
            ),
            title: 'Current Repository',
            description: repo.name,
            source: ContextItemSource.Initial,
            icon: 'folder',
        })
    }

    // TODO (vk): Add support for error notification if prompt hydration fails
    if (items.length === 0) {
        return [promptText, []]
    }

    const [workspace, ...otherWorkspaces] = items

    return [
        promptText.replaceAll(
            PROMPT_CURRENT_REPOSITORY_PLACEHOLDER,
            selectedCodePromptWithExtraFiles(workspace, otherWorkspaces)
        ),
        [workspace, ...otherWorkspaces],
    ]
}

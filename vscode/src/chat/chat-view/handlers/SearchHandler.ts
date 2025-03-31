import {
    type ChatMessage,
    type ChatMessageSearch,
    type ContextItem,
    type ContextItemFile,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
    errorToChatError,
    graphqlClient,
    inputTextWithoutContextChipsFromPromptEditorState,
    isValidVersion,
    ps,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { escapeRegExp } from '../../../context/openctx/remoteFileSearch'
import { getEditor } from '../../../editor/active-editor'
import { getFirstRepoNameContainingUri } from '../../../repository/repo-name-resolver'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

export class SearchHandler implements AgentHandler {
    async handle(
        { editorState, inputText, mentions, chatBuilder, signal, recorder, span }: AgentRequest,
        delegate: AgentHandlerDelegate
    ): Promise<void> {
        recorder.recordChatQuestionExecuted(mentions, { addMetadata: true, current: span })

        const inputTextWithoutContextChips = editorState
            ? inputTextWithoutContextChipsFromPromptEditorState(editorState)
            : inputText.toString()

        signal.throwIfAborted()

        chatBuilder.setLastMessageIntent('search')
        const scopes: string[] = await getSearchScopesFromMentions(mentions)

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri
        const currentFile = getEditor()?.active?.document?.uri || workspaceRoot
        const repoName = currentFile ? await getFirstRepoNameContainingUri(currentFile) : undefined

        const currentRepoBoost = repoName ? `boost:repo(${repoName})` : ''
        const myProjectsBoost = (await isValidVersion({ minimumVersion: '6.0.0' }))
            ? 'boost:relevant.repos()'
            : ''

        const query = `content:"${escapeNLSQuery(
            inputTextWithoutContextChips
        )}" ${currentRepoBoost} ${myProjectsBoost} ${scopes.length ? `(${scopes.join(' OR ')})` : ''}`

        try {
            const response = await graphqlClient.nlsSearchQuery({
                query,
                signal,
            })
            const search: ChatMessageSearch = { query, response }
            const message: ChatMessage = {
                search,
                speaker: 'assistant',
                text: ps`Search found ${search?.response?.results.results.length || 0} results`,
            }
            delegate.postMessageInProgress(message)
        } catch (err) {
            const message: ChatMessage = {
                speaker: 'assistant',
                error:
                    err instanceof Error ? errorToChatError(err) : errorToChatError(new Error(`${err}`)),
            }
            delegate.postMessageInProgress(message)
        } finally {
            delegate.postDone()
        }
    }
}

export function escapeNLSQuery(query: string): string {
    return (
        query
            // first escape backslashes
            .replaceAll('\\', '\\\\')
            // then escape quotes
            .replaceAll('"', '\\"')
    )
}

async function getSearchScopesFromMentions(mentions: ContextItem[]): Promise<string[]> {
    const validMentions = mentions.reduce(
        (groups, mention) => {
            switch (mention.type) {
                case 'repository':
                    groups.repository.push(mention)
                    break
                case 'file':
                    groups[mention.type].push(mention)
                    break
                case 'openctx':
                    if (mention.providerUri === REMOTE_REPOSITORY_PROVIDER_URI) {
                        groups.repository.push(mention)
                    } else {
                        groups.openctx.push(mention)
                    }
            }

            return groups
        },
        { repository: [], file: [], openctx: [] } as {
            repository: (ContextItemRepository | ContextItemOpenCtx)[]
            file: ContextItemFile[]
            openctx: ContextItemOpenCtx[]
        }
    )

    const scopes: string[] = []

    // Convert all repo mentions to a single search filter.
    // Example: repo:^(github\.com/sourcegraph/sourcegraph|github\.com/sourcegraph/cody)$
    if (validMentions.repository.length > 0) {
        const escapedRepoNames = validMentions.repository
            .filter(({ repoName }) => !!repoName)
            .map(({ repoName }) => escapeRegExp(repoName || ''))
            .join('|')
        scopes.push(`(repo:^(${escapedRepoNames})$)`)
    }

    // Convert all local file mentions to combination of file & repo filters.
    // Example: (repo:a file:myfile)
    await Promise.all(
        validMentions.file.map(async mention => {
            const repoName =
                (mention as ContextItemFile).remoteRepositoryName ||
                (await getFirstRepoNameContainingUri(mention.uri))
            if (!repoName) {
                return
            }

            const filePath = vscode.workspace.asRelativePath(mention.uri, false)
            // asRelativePath returns the input as is if no workspace folder is open
            // Since we need to get the relative path of the file relative to workspace
            // we'll bail if that's the case.
            if (filePath.toString() === mention.uri.toString()) {
                return
            }

            return scopes.push(`(file:^${escapeRegExp(filePath)}$ repo:^${repoName}$)`)
        })
    )

    // Convert all remote file & directory mentions to combination of file & repo filters.
    // Example: (repo:a file:mydir)
    // biome-ignore lint/complexity/noForEach: <explanation>
    validMentions.openctx.forEach(mention => {
        switch ((mention as ContextItemOpenCtx).providerUri) {
            case REMOTE_FILE_PROVIDER_URI:
                {
                    const filePath = escapeRegExp(mention.mention?.data?.filepath || '')
                    const repoName = escapeRegExp(mention.mention?.data?.reponame || '')
                    if (!filePath || !repoName) {
                        return
                    }
                    scopes.push(`(file:^${filePath}$ repo:^${repoName}$)`)
                }
                break
            case REMOTE_DIRECTORY_PROVIDER_URI: {
                const filePath = escapeRegExp(mention.mention?.data?.directoryPath || '')
                const repoName = escapeRegExp(mention.mention?.data?.repoName || '')
                if (!filePath || !repoName) {
                    return
                }

                scopes.push(`(file:^${filePath} repo:^${repoName}$)`)
            }
        }
    })

    return scopes
}

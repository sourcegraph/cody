import {
    type CodyCommand,
    type CodyCommandMode,
    type PromptsMigrationStatus,
    checkVersion,
    combineLatest,
    distinctUntilChanged,
    firstResultFromOperation,
    graphqlClient,
    isError,
    isErrorLike,
    isValidVersion,
    shareReplay,
    siteVersion,
    skipPendingOperation,
    startWith,
    switchMap,
} from '@sourcegraph/cody-shared'
import { Observable, Subject } from 'observable-fns'

import { PromptMode } from '@sourcegraph/cody-shared'
import { getCodyCommandList } from '../../commands/CommandsController'
import {
    PROMPT_CURRENT_DIRECTORY_PLACEHOLDER,
    PROMPT_CURRENT_FILE_PLACEHOLDER,
    PROMPT_CURRENT_SELECTION_PLACEHOLDER,
    PROMPT_EDITOR_OPEN_TABS_PLACEHOLDER,
} from '../../prompts/prompt-hydration'
import { remoteReposForAllWorkspaceFolders } from '../../repository/remoteRepos'
import { localStorage } from '../../services/LocalStorageProvider'

const PROMPTS_MIGRATION_KEY = 'CODY_PROMPTS_MIGRATION'
const PROMPTS_MIGRATION_STATUS = new Subject<PromptsMigrationStatus>()
const PROMPTS_MIGRATION_RESULT = PROMPTS_MIGRATION_STATUS.pipe(
    startWith({ type: 'initial_migration' } as PromptsMigrationStatus),
    distinctUntilChanged(),
    shareReplay()
)

export function getPromptsMigrationInfo(): Observable<PromptsMigrationStatus> {
    return combineLatest(
        siteVersion.pipe(skipPendingOperation()),
        remoteReposForAllWorkspaceFolders.pipe(skipPendingOperation())
    ).pipe(
        switchMap(([siteVersion, repositories]) => {
            if (isError(repositories)) {
                throw repositories
            }

            const repository = repositories[0]
            const isPromptSupportVersion =
                siteVersion &&
                checkVersion({
                    currentVersion: siteVersion.siteVersion,
                    minimumVersion: '5.9.0',
                })

            // Don't run migration if you're already run this before (ignore any other new commands
            // that had been added after first migration run
            const migrationMap = localStorage.get<Record<string, boolean>>(PROMPTS_MIGRATION_KEY) ?? {}
            const commands = getCodyCommandList().filter(command => command.type !== 'default')

            if (!isPromptSupportVersion || !repository || migrationMap[repoKey(repository?.id ?? '')]) {
                return Observable.of<PromptsMigrationStatus>({
                    type: 'migration_skip',
                })
            }

            if (commands.length === 0) {
                return Observable.of<PromptsMigrationStatus>({
                    type: 'no_migration_needed',
                })
            }

            return PROMPTS_MIGRATION_RESULT
        })
    )
}

export async function startPromptsMigration(): Promise<void> {
    // Custom commands list
    const commands = getCodyCommandList().filter(command => command.type !== 'default')
    const currentUser = await graphqlClient.isCurrentUserSideAdmin()
    const isValidInstance = await isValidVersion({ minimumVersion: '5.9.0' })

    // Skip migration if there are no commands to migrate
    if (commands.length === 0 || !isValidInstance || isErrorLike(currentUser) || currentUser === null) {
        PROMPTS_MIGRATION_STATUS.next({
            type: 'migration_skip',
        })
        return
    }

    // Start migration (scanning stage)
    PROMPTS_MIGRATION_STATUS.next({
        type: 'migrating',
        commandsMigrated: 0,
        allCommandsToMigrate: undefined,
    })

    const commandsToMigrate = []

    for (const command of commands) {
        const commandKey = command.key ?? command.slashCommand

        try {
            const prompts = await graphqlClient.queryPrompts(commandKey.replace(/\s+/g, '-'))

            // If there is no prompts associated with the command include this
            // command to migration
            if (prompts.length === 0) {
                commandsToMigrate.push(command)
            }
        } catch (error) {
            console.error('Prompt migration error [scanning stage]:', error)
        }
    }

    // Scanning complete (calculated number of migration commands)
    PROMPTS_MIGRATION_STATUS.next({
        type: 'migrating',
        commandsMigrated: 0,
        allCommandsToMigrate: commandsToMigrate.length,
    })

    for (let index = 0; index < commandsToMigrate.length; index++) {
        try {
            const command = commandsToMigrate[index]
            const commandKey = (command.key ?? command.slashCommand).replace(/\s+/g, '-')
            const promptText = generatePromptTextFromCommand(command)

            // skip commands with no prompt text
            if (!promptText) {
                continue
            }

            const newPrompt = await graphqlClient.createPrompt({
                owner: currentUser.id,
                name: commandKey,
                description: `Migrated from command ${commandKey}`,
                definitionText: promptText,
                draft: false,
                autoSubmit: false,
                mode: commandModeToPromptMode(command.mode),
                visibility: 'SECRET',
            })

            // Change prompt visibility to PUBLIC if it's admin performing migration
            // TODO: [VK] Remove it and use visibility field in prompt creation (current API limitation)
            if (currentUser.siteAdmin) {
                await graphqlClient.transferPromptOwnership({ id: newPrompt.id, visibility: 'PUBLIC' })
            }

            PROMPTS_MIGRATION_STATUS.next({
                type: 'migrating',
                commandsMigrated: index + 1,
                allCommandsToMigrate: commandsToMigrate.length,
            })
        } catch (error: any) {
            PROMPTS_MIGRATION_STATUS.next({
                type: 'migration_failed',
                errorMessage: error.toString(),
            })

            return
        }
    }

    const repositories = (await firstResultFromOperation(remoteReposForAllWorkspaceFolders)) ?? []
    const repository = repositories[0]

    if (repository) {
        const migrationMap = localStorage.get<Record<string, boolean>>(PROMPTS_MIGRATION_KEY) ?? {}
        migrationMap[repoKey(repository.id)] = true
        await localStorage.set(PROMPTS_MIGRATION_KEY, migrationMap)
    }

    PROMPTS_MIGRATION_STATUS.next({ type: 'migration_success' })
}

function commandModeToPromptMode(commandMode?: CodyCommandMode): PromptMode {
    switch (commandMode) {
        case 'ask':
            return PromptMode.CHAT
        case 'edit':
            return PromptMode.EDIT
        case 'insert':
            return PromptMode.INSERT

        default:
            return PromptMode.CHAT
    }
}

function generatePromptTextFromCommand(command: CodyCommand): string {
    let promptText = command.prompt

    // If there is no additional context use just original prompt text
    if (!command.context || command.context.none) {
        return promptText
    }

    promptText += '\nContext: \n'

    if (command.context.openTabs) {
        promptText += `Open tabs files ${PROMPT_EDITOR_OPEN_TABS_PLACEHOLDER} \n`
    }

    if (command.context.currentDir) {
        promptText += `Current directory ${PROMPT_CURRENT_DIRECTORY_PLACEHOLDER} \n`
    }

    if (command.context.currentFile) {
        promptText += `Current file ${PROMPT_CURRENT_FILE_PLACEHOLDER} \n`
    }

    if (command.context.selection) {
        promptText += `Selection ${PROMPT_CURRENT_SELECTION_PLACEHOLDER} \n`
    }

    return promptText
}

function repoKey(repositoryId: string) {
    return `prefix12-${repositoryId}`
}

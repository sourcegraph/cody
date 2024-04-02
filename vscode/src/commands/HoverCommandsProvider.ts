import {
    type AuthStatus,
    FeatureFlag,
    featureFlagProvider,
    isCodyIgnoredFile,
    logDebug,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ExecuteEditArguments } from '../edit/execute'
import { fetchDocumentSymbols } from '../edit/input/utils'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { logFirstEnrollmentEvent } from '../services/utils/enrollment-event'
import { execQueryWrapper as execQuery } from '../tree-sitter/query-sdk'
import { executeHoverChatCommand } from './execute/hover-explain'
import type { CodyCommandArgs } from './types'

/**
 * NOTE: Behind the feature flag `cody-hover-commands`.
 *
 * Provides clickable commands on hover and handles clicking on commands.
 */
export class HoverCommandsProvider implements vscode.Disposable {
    private readonly id = FeatureFlag.CodyHoverCommands
    private disposables: vscode.Disposable[] = []

    // For determining if we should show on hover or not
    private isActive = false // If the configuration is enabled

    // For the a/b test experimentation
    private isInTreatment = false // If the feature flag is enabled
    private isEnrolled = false

    // To store the current hover context for command clicks
    private current: {
        // The document where the cursor is hovering
        document?: vscode.TextDocument
        // Position of the cursor in the document
        position?: vscode.Position
        // Symbol under the cursor
        symbol?: vscode.DocumentSymbol
        // Selection range if the cursor is on a multi-line highlight
        selection?: vscode.Selection
    } = {}

    private register(): void {
        if (this.disposables.length) {
            return
        }
        logDebug('HoverCommandsProvider', 'registering')
        this.disposables.push(
            // Registers the hover provider to provide hover information when hovering over code.
            vscode.languages.registerHoverProvider('*', { provideHover: this.onHover.bind(this) }),
            //  Registers the 'cody.experiment.hover.commands' command to handle clicking hover commands.
            vscode.commands.registerCommand('cody.experiment.hover.commands', id => this.onClick(id)),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (this.isInTreatment && e.affectsConfiguration('cody')) {
                    this.isActive = isHoverCommandsEnabled()
                }
            })
        )
    }

    /**
     * Handles providing Cody commands when hovering over code.
     * Logs telemetry whenever a hover command is visible.
     */
    private async onHover(
        doc: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        if (!this.isActive || !doc?.uri || !position || isCodyIgnoredFile(doc.uri)) {
            // Skip if isEnrolled is false so that we can log the first enrollment event.
            if (this.isEnrolled) {
                this.reset()
                return undefined
            }
        }

        this.current.document = doc
        this.current.position = position

        // Get the clickable commands for the current hover
        const commands = await this.getHoverCommands(doc, position)
        if (!commands.length) {
            return undefined
        }

        // Create contents for the hover with clickable commands
        const contents = new vscode.MarkdownString(
            '$(cody-logo) ' +
                commands
                    .filter(c => c.enabled)
                    .map(c => c.title.replace('{params}', encodeURIComponent(JSON.stringify([c.id]))))
                    .join(' | ')
        )
        contents.supportThemeIcons = true
        contents.isTrusted = true

        // Log Enrollment event at the first Hover Commands for all users,
        // then dispose the provider if the user is not in the treatment group.
        if (!this.isEnrolled) {
            this.isEnrolled = logFirstEnrollmentEvent(this.id, this.isInTreatment)
            if (!this.isInTreatment) {
                this.dispose()
                return undefined
            }
        }

        // Log the visibility of the hover commands
        const args = { commands: commands.filter(c => c.enabled).join(','), languageId: doc.languageId }
        telemetryService.log('CodyVSCodeExtension:hoverCommands:visible', args, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.hoverCommands', 'visible', { privateMetadata: args })

        return new vscode.Hover(contents)
    }

    protected async getHoverCommands(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<HoverCommand[]> {
        // Copy the hoverCommands object to avoid modifying the original.
        // This way we know everything is disabled by default.
        const commandsOnHovers = { ...HoverCommands() }

        // Display Chat & Edit commands when the current position is over multi-lines highlights
        const selection = vscode.window.activeTextEditor?.selection
        this.current.selection = selection
        if (selection?.contains(position) && !selection?.isSingleLine) {
            commandsOnHovers.chat.enabled = true
            commandsOnHovers.edit.enabled = true
            return Object.values(commandsOnHovers)
        }

        // Show Socument and Explain commands on documentable nodes
        const [docNode] = execQuery({
            document,
            position,
            queryWrapper: 'getDocumentableNode',
        })

        if (!docNode.symbol?.node || !this.current?.document) {
            return []
        }

        const activeSymbol = (await fetchDocumentSymbols(this.current?.document)).findLast(s =>
            s.range.contains(position)
        )
        this.current.symbol = activeSymbol

        if (docNode.meta?.showHint) {
            commandsOnHovers.explain.enabled = true
            commandsOnHovers.doc.enabled = true
            return Object.values(commandsOnHovers)
        }

        // Display Chat & Edit commands if cursor is on one of the cached LSP symbols
        if (activeSymbol) {
            commandsOnHovers.chat.enabled = true
            commandsOnHovers.edit.enabled = true
            return Object.values(commandsOnHovers)
        }

        return []
    }

    /**
     * Handles clicking on a command from the hover. Opens the current document, selects the
     * current position, and executes the given command id.
     */
    private async onClick(id: string): Promise<void> {
        const args = { id, languageID: this.current.document?.languageId }
        telemetryService.log('CodyVSCodeExtension:hoverCommands:clicked', args, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.hoverCommands', 'clicked', { privateMetadata: args })

        if (!this.current?.document || !this.current?.position) {
            return
        }

        const symbolInfo = this.current?.symbol
        const range = symbolInfo?.range ?? this.current.selection
        const commandArgs = { source: 'hover' } as CodyCommandArgs
        commandArgs.uri = this.current.document.uri
        commandArgs.range = range

        // New Chat Commands
        if (id === 'cody.action.chat') {
            // Get the name of the symbolInfo.kind from the SymbolKind enum key
            const symbolKind = vscode.SymbolKind[symbolInfo?.kind as vscode.SymbolKind].toLowerCase()
            const symbolPrompt = symbolInfo?.name && `RE: \`${symbolInfo.name}\` ${symbolKind}`
            commandArgs.additionalInstruction = symbolPrompt
            executeHoverChatCommand(commandArgs)
            return
        }

        // Edit Commands
        if (id === 'cody.command.edit-code' || id === 'cody.command.document-code') {
            vscode.commands.executeCommand(id, commandArgs as ExecuteEditArguments)
            return
        }

        // Move the cursor to the current position so that the command can be executed at the right location
        vscode.commands.executeCommand(id, commandArgs)
    }

    public syncAuthStatus(authStatus: AuthStatus): boolean {
        if (!authStatus.isLoggedIn || !authStatus.isDotCom) {
            this.isActive = false
            this.reset()
            return false
        }

        // Check if the feature flag is enabled for the user
        featureFlagProvider
            .evaluateFeatureFlag(this.id)
            .then(hasFeatureFlag => {
                this.isInTreatment = hasFeatureFlag
                this.isActive = isHoverCommandsEnabled()
                this.register()
            })
            .catch(error => {
                logDebug('HoverCommandsProvider:failed', error)
            })

        return this.isInTreatment
    }

    public getEnablement(): boolean {
        return this.isInTreatment
    }

    private reset(): void {
        this.current = {}
    }

    public dispose(): void {
        this.isActive = false
        this.reset()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

/**
 * Checks if hover commands are enabled in the experimental configuration.
 *
 * Hover commands allow showing commands related to the symbol under the cursor in a hover.
 * It is disabled if the `hoverCommands` setting is specifically set to `false`.
 */
export function isHoverCommandsEnabled(): boolean {
    const experimentalConfigs = vscode.workspace.getConfiguration('cody.experimental')
    return experimentalConfigs.get<boolean>('hoverCommands') ?? true
}

interface HoverCommand {
    id: string
    title: string
    enabled: boolean
}

const HoverCommands: () => Record<string, HoverCommand> = () => ({
    explain: {
        id: 'cody.command.explain-code',
        title: '[Explain Code](command:cody.experiment.hover.commands?{params})',
        enabled: false,
    },
    doc: {
        id: 'cody.command.document-code',
        title: '[Document Code](command:cody.experiment.hover.commands?{params})',
        enabled: false,
    },
    chat: {
        id: 'cody.action.chat',
        title: '[New Chat](command:cody.experiment.hover.commands?{params})',
        enabled: false,
    },
    edit: {
        id: 'cody.command.edit-code',
        title: '[Edit Code](command:cody.experiment.hover.commands?{params})',
        enabled: false,
    },
})

export const hoverCommandsProvider = new HoverCommandsProvider()

import { FeatureFlag, featureFlagProvider, isCodyIgnoredFile, logDebug } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { fetchDocumentSymbols } from '../edit/input/utils'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { logFirstEnrollmentEvent } from '../services/utils/enrollment-event'
import { execQueryWrapper as execQuery } from '../tree-sitter/query-sdk'

/**
 * NOTE: Behind the feature flag `cody-hover-commands`.
 *
 * Provides clickable commands on hover and handles clicking on commands.
 */
export class HoverCommandsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private isActive = false // If we should show hover commands
    private isInTreatmentGroup = false // For the a/b test experimentation

    private currentPosition: vscode.Position | undefined
    private currentDocument: vscode.Uri | undefined
    private symbolStore: vscode.DocumentSymbol[] = []

    constructor() {
        // Check if the feature flag is enabled for the user
        featureFlagProvider
            .evaluateFeatureFlag(FeatureFlag.CodyHoverCommands)
            .then(hasFeatureFlag => {
                this.isInTreatmentGroup = hasFeatureFlag
                this.isActive = hasFeatureFlag
                this.init()
            })
            .catch(error => logDebug('HoverCommandsProvider:failed', error))
    }

    private init(): void {
        const initItems = [
            // Registers the hover provider to provide hover information when hovering over code.
            vscode.languages.registerHoverProvider('*', { provideHover: this.onHover.bind(this) }),
            //  Registers the 'cody.experiment.hover.commands' command to handle clicking hover commands.
            vscode.commands.registerCommand('cody.experiment.hover.commands', id => this.onClick(id)),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (this.isInTreatmentGroup && e.affectsConfiguration('cody')) {
                    if (!isHoverCommandsEnabled()) {
                        this.dispose()
                    }
                }
            }),
        ]
        this.disposables.push(...initItems)
    }

    /**
     * Handles providing hover information when hovering over code.
     * Logs telemetry when hover is visible.
     */
    private async onHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.Hover | undefined> {
        // Log Enrollment event for Cody Hover Commands for all users
        logFirstEnrollmentEvent(FeatureFlag.CodyHoverCommands, this.isInTreatmentGroup)
        if (!this.isActive || !document?.uri || !position || isCodyIgnoredFile(document.uri)) {
            this.reset()
            return undefined
        }

        // Store the document symbols only if the document has changed.
        // This is to avoid fetching symbols for every hover.
        if (document.uri !== this.currentDocument) {
            this.symbolStore = await fetchDocumentSymbols(document)
        }

        this.currentDocument = document.uri
        this.currentPosition = position

        // Get the clickable commands for the current hover
        const commandsOnHovers = await this.getHoverCommands(document, position)
        if (!commandsOnHovers.length) {
            return undefined
        }

        const commands: string[] = []
        for (const { id, title, enabled } of commandsOnHovers) {
            if (!enabled) {
                continue
            }
            commands.push(title.replace('{params}', encodeURIComponent(JSON.stringify([id]))))
        }

        // Create contents for the hover with clickable commands
        const contents = new vscode.MarkdownString('$(cody-logo) ' + commands.join(' | '))
        contents.supportThemeIcons = true
        contents.isTrusted = true

        // Log the visibility of the hover commands
        const args = { commands: commandsOnHovers.filter(c => c.enabled).join(',') }
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

        // Display Chat & Edit commands when the current position is over highlighted area
        const selection = vscode.window.activeTextEditor?.selection
        if (selection?.contains(position) && !selection?.isSingleLine) {
            commandsOnHovers.chat.enabled = true
            commandsOnHovers.edit.enabled = true
            return Object.values(commandsOnHovers)
        }

        // Show document and explain commands on a documentable node
        const [docNode] = execQuery({
            document,
            position,
            queryWrapper: 'getDocumentableNode',
        })
        if (docNode.symbol?.node) {
            commandsOnHovers.explain.enabled = true
            commandsOnHovers.doc.enabled = true
            return Object.values(commandsOnHovers)
        }

        // Cursor is on one of the known LSP symbols
        const activeSymbolRange = document.getWordRangeAtPosition(position)
        const activeSymbol = activeSymbolRange && document.getText(activeSymbolRange)
        if (activeSymbolRange && this.symbolStore.some(s => s.name === activeSymbol)) {
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
        const args = { id }
        telemetryService.log('CodyVSCodeExtension:hoverCommands:clicked', args, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.hoverCommands', 'clicked', { privateMetadata: args })
        if (this.currentDocument && this.currentPosition) {
            const editor = await vscode.window.showTextDocument(this.currentDocument)
            editor.selection = new vscode.Selection(this.currentPosition, this.currentPosition)
            vscode.commands.executeCommand(id, { source: 'hover' })
        }
    }

    private reset(): void {
        this.symbolStore = []
        this.currentDocument = undefined
        this.currentPosition = undefined
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
    return experimentalConfigs.get<boolean>('hoverCommands') !== false
}

interface HoverCommand {
    id: string
    title: string
    enabled: boolean
}

const HoverCommands: () => Record<string, HoverCommand> = () => ({
    explain: {
        id: 'cody.command.explain-code',
        title: '[Ask Cody to Explain](command:cody.experiment.hover.commands?{params})',
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

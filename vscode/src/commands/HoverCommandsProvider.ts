import {
    type AuthStatus,
    FeatureFlag,
    featureFlagProvider,
    isCodyIgnoredFile,
    logDebug,
} from '@sourcegraph/cody-shared'
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
    private readonly id = FeatureFlag.CodyHoverCommands
    private disposables: vscode.Disposable[] = []

    // For determining if we should show on hover or not
    private isActive = false // If the configuration is enabled

    // For the a/b test experimentation
    private isInTreatment = false // If the feature flag is enabled
    private isEnrolled = false

    // To store the current hover context for command clicks
    private currentLangID: string | undefined
    private currentPosition: vscode.Position | undefined
    private currentDocument: vscode.Uri | undefined
    private symbolStore: vscode.DocumentSymbol[] = []

    private register(): void {
        if (this.disposables.length) {
            return
        }
        const disposables = [
            // Registers the hover provider to provide hover information when hovering over code.
            vscode.languages.registerHoverProvider('*', { provideHover: this.onHover.bind(this) }),
            //  Registers the 'cody.experiment.hover.commands' command to handle clicking hover commands.
            vscode.commands.registerCommand('cody.experiment.hover.commands', id => this.onClick(id)),
            vscode.workspace.onDidChangeConfiguration(e => {
                if (this.isInTreatment && e.affectsConfiguration('cody')) {
                    this.isActive = isHoverCommandsEnabled()
                }
            }),
        ]
        this.disposables.push(...disposables)
        logDebug('HoverCommandsProvider', 'initialized')
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

        // Store the document symbols only if the document has changed.
        // This is to avoid fetching symbols for every hover.
        // NOTE (bee) This is temporary as we eventually want to update the symbols on document change,
        // which could be a performance hit. Until then, let's use the cached symbols for v1 and
        // wait for v1 data before we decide on the final implementation.
        if (doc.uri !== this.currentDocument) {
            fetchDocumentSymbols(doc).then(symbols => {
                this.symbolStore = symbols
            })
        }
        this.currentLangID = doc.languageId
        this.currentDocument = doc.uri
        this.currentPosition = position

        // Get the clickable commands for the current hover
        const hoverCommands = await this.getHoverCommands(doc, position)
        if (!hoverCommands.length) {
            return undefined
        }

        // Create contents for the hover with clickable commands
        const contents = new vscode.MarkdownString(
            '$(cody-logo) ' +
                hoverCommands
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
        const args = {
            commands: hoverCommands.filter(c => c.enabled).join(','),
            languageId: doc.languageId,
        }
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
        if (docNode.symbol?.node) {
            commandsOnHovers.explain.enabled = true
            commandsOnHovers.doc.enabled = true
            return Object.values(commandsOnHovers)
        }

        // Display Chat & Edit commands if cursor is on one of the cached LSP symbols
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
        const args = { id, languageID: this.currentLangID }
        telemetryService.log('CodyVSCodeExtension:hoverCommands:clicked', args, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.hoverCommands', 'clicked', { privateMetadata: args })
        if (this.currentDocument && this.currentPosition) {
            const editor = await vscode.window.showTextDocument(this.currentDocument)
            editor.selection = new vscode.Selection(this.currentPosition, this.currentPosition)
            vscode.commands.executeCommand(id, { source: 'hover' })
        }
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

export const hoverCommandsProvider = new HoverCommandsProvider()

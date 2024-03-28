import { FeatureFlag, featureFlagProvider, isCodyIgnoredFile, logDebug } from '@sourcegraph/cody-shared'
import { throttle } from 'lodash'
import * as vscode from 'vscode'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { logFirstEnrollmentEvent } from '../services/utils/enrollment-event'
import { execQueryWrapper as execQuery } from '../tree-sitter/query-sdk'

/**
 * Provides clickable commands on hover and handles clicking on commands.
 * NOTE: Behind the feature flag `cody-hover-commands`.
 */
export class HoverCommandsProvider implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private currentPosition: vscode.Position | undefined
    private currentDocument: vscode.Uri | undefined

    constructor() {
        featureFlagProvider
            .evaluateFeatureFlag(FeatureFlag.CodyHoverCommands)
            .then(hasFeatureFlag => {
                // Log Enrollment event for Cody Hover Commands for all users
                logFirstEnrollmentEvent(FeatureFlag.CodyHoverCommands, hasFeatureFlag)
                // Register the providers only for users with:
                // feature flag enabled & did not disable the feature config
                if (!hasFeatureFlag || !this.isEnabled) {
                    return
                }
                this.init()
            })
            .catch(error => logDebug('HoverCommandsProvider:failed', error))

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('cody')) {
                    if (!this.isEnabled) {
                        this.dispose()
                    }
                }
            })
        )
    }

    /**
     * Initializes the hover command provider by registering the necessary listeners and commands.
     */
    private init(): void {
        const selector = { scheme: 'file' }
        this.disposables.push(
            // Registers the hover provider to provide hover information when hovering over code.
            vscode.languages.registerHoverProvider(selector, { provideHover: this.onHover.bind(this) }),
            //  Registers the 'cody.experiment.hover.commands' command to handle clicking hover commands.
            vscode.commands.registerCommand('cody.experiment.hover.commands', id => this.onClick(id))
        )
    }

    public get isEnabled(): boolean {
        return isHoverCommandsEnabled()
    }

    private onHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
        // Reset on document change
        this.currentDocument = document.uri
        this.currentPosition = position
        if (!document?.uri || !position || isCodyIgnoredFile(document.uri)) {
            this.currentDocument = undefined
            this.currentPosition = undefined
            return undefined
        }

        return throttledHover(document, position)
    }

    /**
     * Handles clicking on a command from the hover. Opens the current document, selects the
     * current position, and executes the given command id.
     */
    private async onClick(id: string): Promise<void> {
        if (!this.currentDocument || !this.currentPosition) {
            return
        }
        telemetryService.log('CodyVSCodeExtension:hoverCommands:clicked', { id }, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.hoverCommands', 'clicked', { privateMetadata: { id } })

        const editor = await vscode.window.showTextDocument(this.currentDocument)
        editor.selection = new vscode.Selection(this.currentPosition, this.currentPosition)
        vscode.commands.executeCommand(id, { source: 'hover' })
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

const HoverCommands = () => ({
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
        enabled: true,
    },
    edit: {
        id: 'cody.command.edit-code',
        title: '[Edit Code](command:cody.experiment.hover.commands?{params})',
        enabled: false,
    },
})

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

const HOVER_COMMANDS_THROTTLE = 250
const TELEMETRY_THROTTLE = 30 * 1000 // 30 Seconds

const throttledHover = throttle((document: vscode.TextDocument, position: vscode.Position) => {
    // Copy the hoverCommands object to avoid modifying the original
    const commandsOnHovers = { ...HoverCommands() }

    const [docNode] = execQuery({
        document,
        position,
        queryWrapper: 'getDocumentableNode',
    })
    const symbol = docNode?.symbol?.node ?? docNode?.range?.node

    // Display Chat & Edit commands when the current position is over highlighted area
    const selection = vscode.window.activeTextEditor?.selection
    if (selection?.contains(position)) {
        commandsOnHovers.edit.enabled = !selection?.isSingleLine
    } else if (docNode && symbol) {
        // Display Explain command if this is a symbol
        commandsOnHovers.explain.enabled = true
        commandsOnHovers.chat.enabled = false
        // Display Document command if the symbol is not documented
        commandsOnHovers.doc.enabled = !document.lineAt(symbol.startPosition.row - 1)?.text.trim()
    } else if (!document.getWordRangeAtPosition(position)) {
        // Display Chat & Edit commands when the current position is empty
        commandsOnHovers.chat.enabled = true
        commandsOnHovers.edit.enabled = true
    }

    // Create contents for the hover with clickable commands
    const commands: string[] = []
    for (const { id, title, enabled } of Object.values(commandsOnHovers)) {
        if (enabled) {
            commands.push(title.replace('{params}', encodeURIComponent(JSON.stringify([id]))))
        }
    }
    const contents = new vscode.MarkdownString('$(cody-logo) ' + commands.join(' | '))
    contents.supportThemeIcons = true
    contents.isTrusted = true

    throttle(() => {
        const args = { variant: commands.join(',') }
        telemetryService.log('CodyVSCodeExtension:hoverCommands:visible', args, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.hoverCommands', 'visible', { privateMetadata: args })
    }, TELEMETRY_THROTTLE)

    return new vscode.Hover(contents)
}, HOVER_COMMANDS_THROTTLE)

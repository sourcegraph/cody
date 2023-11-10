import * as vscode from 'vscode'

import { ContextFile } from '@sourcegraph/cody-shared'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'

export class ChatCommandsFilter {
    public filter(
        text: string,
        recipeId: RecipeID,
        eventTrace?: { requestID?: string; source?: ChatEventSource },
        userContextFiles?: ContextFile[]
    ): { text: string; recipeId: RecipeID; source?: ChatEventSource } | void {
        const source = eventTrace?.source || undefined
        // Inline chat has its own filter for slash commands
        if (recipeId === 'inline-chat') {
            return { text, recipeId, source }
        }

        text = text.trim()
        if (!text?.startsWith('/')) {
            return { text, recipeId, source }
        }

        switch (true) {
            case text === '/':
                void vscode.commands.executeCommand('cody.action.commands.menu', source)
                break

            case text === '/commands-settings':
                telemetryService.log('CodyVSCodeExtension:commandConfigMenuButton:clicked', eventTrace, {
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent(`cody.sidebar.commandConfigMenuButton.${source}`, 'clicked')
                void vscode.commands.executeCommand('cody.settings.commands')
                break

            case /^\/o(pen)?\s/.test(text):
                telemetryService.log('CodyVSCodeExtension:command:openFile:executed', eventTrace, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.command.openFile', 'executed')
                // open the user's ~/.vscode/cody.json file
                // return this.editor.controllers.command?.open(text.split(' ')[1])
                break

            case /^\/r(eset)?$/.test(text):
                telemetryService.log('CodyVSCodeExtension:command:resetChat:executed', eventTrace, { hasV2Event: true })
                telemetryRecorder.recordEvent('cody.command.resetChat', 'executed')
                // void this.clearAndRestartSession()
                break

            case /^\/symf(?:\s|$)/.test(text):
                telemetryService.log('CodyVSCodeExtension:command:symf:executed', eventTrace, { hasV2Event: true })
                return { text, recipeId: 'local-indexed-keyword-search' }

            case /^\/s(earch)?\s/.test(text):
                return { text, recipeId: 'context-search' }

            case /^\/edit(\s)?/.test(text):
                void vscode.commands.executeCommand('cody.command.edit-code', { instruction: text }, source)
                break

            // TODO bee retire chat-question recipe and run all chat questions in custom-prompt recipe
            case /^\/ask(\s)?/.test(text):
                {
                    const question = text.replace('/ask', '').trimStart()
                    if (question) {
                        return { text: question, recipeId: 'chat-question', source }
                    }
                }
                break

            default: {
                // const commandRunnerID = await this.editor.controllers.command?.addCommand(
                //     text,
                //     '',
                //     eventTrace?.requestID,
                //     userContextFiles
                // )
                // // no op
                // if (!commandRunnerID) {
                //     return
                // }
                // if (commandRunnerID === 'invalid') {
                //     const assistantResponse = `__${text}__ is not a valid command`
                //     // If no command found, send error message to view
                //     return this.addCustomInteraction({ assistantResponse, text, source })
                // }
                // return { text: commandRunnerID, recipeId: 'custom-prompt', source }
            }
        }
    }
}

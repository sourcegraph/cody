import { writeFileSync } from 'fs'
import path from 'path'

import * as vscode from 'vscode'

import { CODY_EXTENSION_CHANNEL_ID, CODY_EXTENSION_ID } from '../constants'
import { parseEvaluationConfig, writeCompletionResult } from '../utils'

import { BENCHMARK_CONFIG_FILE, BENCHMARK_EXTENSION_ID, BENCHMARK_WORKSPACE } from './env'
import { executeCompletion } from './execute-completion'
import { ensureExecuteCommand, initExtension } from './helpers'

const LOG_FILE = 'output.log'

export async function run(): Promise<void> {
    await initExtension(BENCHMARK_EXTENSION_ID)
    const evalCaseConfig = parseEvaluationConfig(BENCHMARK_CONFIG_FILE)

    const result = await executeCompletion(evalCaseConfig, BENCHMARK_WORKSPACE)

    if (BENCHMARK_EXTENSION_ID === CODY_EXTENSION_ID) {
        // Dump the output of the extension to a file
        await ensureExecuteCommand(`workbench.action.output.show.${CODY_EXTENSION_CHANNEL_ID}`)
        await new Promise(resolve => setTimeout(resolve, 100))

        const channelOutput = vscode.window.visibleTextEditors.find(
            ({ document }) => document.fileName === CODY_EXTENSION_CHANNEL_ID
        )
        if (channelOutput) {
            writeFileSync(path.join(BENCHMARK_WORKSPACE, LOG_FILE), channelOutput.document.getText(), 'utf8')
        }
    }

    return writeCompletionResult(BENCHMARK_WORKSPACE, result)
}

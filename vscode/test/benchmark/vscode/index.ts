import { writeFileSync } from 'fs'
import path from 'path'

import * as vscode from 'vscode'

import { CODY_EXTENSION_CHANNEL_ID, CODY_EXTENSION_ID } from '../constants'
import { assertEnv, parseEvaluationConfig } from '../utils'

import { executeCompletion } from './execute-completion'
import { ensureExecuteCommand, initExtension } from './helpers'

export async function run(): Promise<void> {
    const benchmarkExtensionId = assertEnv('BENCHMARK_EXTENSION_ID')
    const benchmarkConfigFile = assertEnv('BENCHMARK_CONFIG_FILE')
    const benchmarkWorkspace = assertEnv('BENCHMARK_WORKSPACE')

    await initExtension(benchmarkExtensionId)
    const evalCaseConfig = parseEvaluationConfig(benchmarkConfigFile)

    await executeCompletion(evalCaseConfig, benchmarkWorkspace)

    if (benchmarkExtensionId === CODY_EXTENSION_ID) {
        // Dump the output of the extension to a file
        await ensureExecuteCommand(`workbench.action.output.show.${CODY_EXTENSION_CHANNEL_ID}`)
        await new Promise(resolve => setTimeout(resolve, 100))

        const channelOutput = vscode.window.visibleTextEditors.find(
            ({ document }) => document.fileName === CODY_EXTENSION_CHANNEL_ID
        )
        if (channelOutput) {
            writeFileSync(path.join(benchmarkWorkspace, 'output.log'), channelOutput.document.getText(), 'utf8')
        }
    }
}

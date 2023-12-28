import * as child_process from 'node:child_process'

import * as vscode from 'vscode'

import { MessageHandler } from '../../jsonrpc/jsonrpc'
import { logDebug } from '../../log'

import { downloadBfg } from './download-bfg'

export async function spawnBfg(
    context: vscode.ExtensionContext,
    reject: (reason?: any) => void
): Promise<MessageHandler> {
    const bfg = new MessageHandler()
    const codyrpc = await downloadBfg(context)
    if (!codyrpc) {
        throw new Error(
            'Failed to download BFG binary. To fix this problem, set the "cody.experimental.cody-engine.path" configuration to the path of your BFG binary'
        )
    }
    const isVerboseDebug = vscode.workspace.getConfiguration().get<boolean>('cody.debug.verbose', false)
    const child = child_process.spawn(codyrpc, {
        stdio: 'pipe',
        env: {
            VERBOSE_DEBUG: `${isVerboseDebug}`,
            RUST_BACKTRACE: isVerboseDebug ? '1' : '0',
            // See bfg issue 138
            RUST_LIB_BACKTRACE: '0',
        },
    })
    child.stderr.on('data', chunk => {
        logDebug('CodyEngine', 'stderr', chunk.toString())
    })
    child.on('disconnect', () => reject())
    child.on('close', () => reject())
    child.on('error', error => reject(error))
    child.on('exit', code => {
        bfg.exit()
        reject(code)
    })
    child.stderr.pipe(process.stderr)
    child.stdout.pipe(bfg.messageDecoder)
    bfg.messageEncoder.pipe(child.stdin)
    return bfg
}

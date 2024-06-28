import * as child_process from 'node:child_process'

import * as vscode from 'vscode'

import { StreamMessageReader, StreamMessageWriter, createMessageConnection } from 'vscode-jsonrpc/node'
import { MessageHandler } from '../../jsonrpc/jsonrpc'
import { logDebug } from '../../log'
import { getBfgPath } from './download-bfg'

export async function spawnBfg(
    context: vscode.ExtensionContext,
    reject: (reason?: any) => void
): Promise<MessageHandler> {
    const codyrpc = await getBfgPath(context)
    if (!codyrpc) {
        throw new Error(
            'Failed to download BFG binary. To fix this problem, set the "cody.experimental.cody-engine.path" configuration to the path of your BFG binary'
        )
    }
    const isVerboseDebug = vscode.workspace.getConfiguration().get<boolean>('cody.debug.verbose', false)
    const child = child_process.spawn(codyrpc, {
        stdio: 'pipe',
        env: {
            ...process.env,
            VERBOSE_DEBUG: `${isVerboseDebug}`,
            RUST_BACKTRACE: isVerboseDebug ? '1' : '0',
            // See bfg issue 138
            RUST_LIB_BACKTRACE: '0',
        },
    })
    child.stderr.on('data', chunk => {
        logDebug('CodyEngine', 'spawnBfg:stderr', { verbose: chunk.toString() })
    })
    child.on('disconnect', () => reject())
    child.on('close', () => reject())
    child.on('error', error => reject(error))
    child.on('exit', code => {
        bfg.exit()
        reject(code)
    })
    child.stderr.pipe(process.stderr)

    const conn = createMessageConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin)
    )
    const bfg = new MessageHandler(conn)
    conn.listen()
    return bfg
}

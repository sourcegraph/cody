import type { MessageHandler } from '../../jsonrpc-alias'
import type { CodyBenchOptions } from './cody-bench'

export async function evaluateChatStrategy(
    messageHandler: MessageHandler,
    options: CodyBenchOptions
): Promise<void> {
    console.log(options)
}

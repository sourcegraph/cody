import type { VSCodeWrapper } from '../utils/VSCodeApi'

export async function downloadChatHistory(vscodeAPI: Pick<VSCodeWrapper, 'postMessage'>): Promise<void> {
    vscodeAPI.postMessage({ command: 'command', id: 'cody.chat.history.export' })
}

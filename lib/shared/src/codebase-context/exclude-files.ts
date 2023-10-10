import { ContextMessage } from './messages'

export async function filterFilesToExclude(
    messages: Promise<ContextMessage[]>,
    excludedFiles?: string[]
): Promise<ContextMessage[]> {
    if (!excludedFiles) {
        return messages
    }
    // remove any messages that has a filename that matches one of the files to exclude
    // also remove the message after the one that matches the file to exclude
    const contextMessages = await messages
    const newMessages = []
    for (let i = 0; i < contextMessages.length; i++) {
        const message = contextMessages[i]
        if (message.speaker === 'human' && message.file?.fileName) {
            // find filesToExclude to see if the filename matches
            const isFileToExclude = excludedFiles.some(file => message.file?.fileName.includes(file))
            if (isFileToExclude) {
                i++
                continue
            }
        }
        newMessages.push(message)
    }
    return newMessages
}

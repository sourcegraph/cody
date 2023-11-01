import fs from 'fs/promises'
import path from 'path'

import { updateLogs } from './generate'

;(async () => {
    const separator = '\n'
    const logsFile = path.join(__dirname, 'logs.txt')
    const initialContent = 'initial log' + separator
    const initialLogsLength = initialContent.split(separator).filter(Boolean)
    await fs.writeFile(logsFile, initialContent)

    const newLogs = ['log1', 'log2']
    await updateLogs(newLogs, separator, logsFile)
    const content = await fs.readFile(logsFile, 'utf-8')
    const logsLength = content.split(separator).filter(Boolean)
    if (logsLength.length !== initialLogsLength.length + newLogs.length) {
        throw new Error('Logs length is incorrect.')
    }

    await fs.unlink(logsFile)
})()

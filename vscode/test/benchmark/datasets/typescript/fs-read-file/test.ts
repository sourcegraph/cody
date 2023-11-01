import fs from 'fs/promises'
import path from 'path'

import { getContent } from './solution'

;(async () => {
    const separator = '\n'
    const logsFile = path.join(__dirname, 'logs.txt')
    const initialContent = 'initial log' + separator
    await fs.writeFile(logsFile, initialContent)

    const content = await getContent(logsFile)
    if (content !== initialContent) {
        throw new Error('Incorrect result.')
    }

    await fs.unlink(logsFile)
})()

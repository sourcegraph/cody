import fs from 'fs/promises'
import path from 'path'

import { getContent } from './generate'

;(async () => {
    const separator = '\n'
    const logsFile = path.join(__dirname, 'logs.txt')
    const initialContent = 'initial log' + separator
    await fs.writeFile(logsFile, initialContent)

    const fd = await fs.open(logsFile)
    const content = await getContent(fd.createReadStream())
    if (content !== initialContent) {
        throw new Error('Incorrect result.')
    }

    await fs.unlink(logsFile)
})()

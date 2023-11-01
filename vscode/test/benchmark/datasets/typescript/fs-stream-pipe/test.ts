import fs from 'fs/promises'
import path from 'path'

import { streamDataToFile } from './solution'

;(async () => {
    const inputFile = path.join(__dirname, 'data.txt')
    const outputFile = path.join(__dirname, 'output.txt')
    const separator = '\n'
    const text = 'some text' + separator
    await fs.appendFile(inputFile, text.repeat(100))
    await fs.writeFile(outputFile, '')

    streamDataToFile(inputFile, outputFile, async err => {
        try {
            if (err) {
                throw err
            }

            const content = await fs.readFile(outputFile, { encoding: 'utf8' })
            const expected = text.repeat(100)
            if (content !== expected) {
                throw new Error('Incorrect result.')
            }
        } finally {
            await fs.unlink(inputFile)
            await fs.unlink(outputFile)
        }
    })
})()

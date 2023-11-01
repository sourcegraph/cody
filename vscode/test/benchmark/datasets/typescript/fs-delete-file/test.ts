import fs from 'fs/promises'
import path from 'path'

import { removeEmptyFiles } from './generate'

;(async () => {
    const dirPath = path.join(__dirname, 'test')

    await fs.mkdir(dirPath)
    await fs.writeFile(path.join(dirPath, '1.txt'), '')
    await fs.writeFile(path.join(dirPath, '2.txt'), '')
    await fs.writeFile(path.join(dirPath, 'index.js'), 'console.log("Hello, World!");')

    await removeEmptyFiles(dirPath)
    const result = await fs.readdir(dirPath)

    await fs.rm(dirPath, { recursive: true, force: true })

    if (result.length !== 1) {
        throw new Error('Incorrect result.')
    }
})()

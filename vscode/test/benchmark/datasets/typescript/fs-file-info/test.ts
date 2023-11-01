import path from 'path'

import { getFileInfo } from './generate'

;(async () => {
    const configs = [
        { path: path.join(__dirname, 'test.ts'), exists: true },
        { path: path.join(__dirname, 'test1.ts'), exists: false },
    ]

    for (const { path, exists } of configs) {
        try {
            const fileInfo = await getFileInfo(path)
            if (exists) {
                if (!fileInfo.size || !fileInfo.isFile || fileInfo.isDirectory) {
                    throw new Error('Incorrect file info.')
                }
            } else {
                throw new Error('File does not exist. Should throw an error.')
            }
        } catch (e) {
            if (exists) {
                throw new Error('File exists. Expected file info but got an error.')
            }
        }
    }
})()

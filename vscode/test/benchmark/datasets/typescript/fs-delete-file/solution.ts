import fs from 'fs/promises'
import path from 'path'

export async function removeEmptyFiles(dirPath: string): Promise<void> {
    const files = await fs.readdir(dirPath)
    const promises = files.map(async file => {
        const filePath = path.join(dirPath, file)
        const content = await fs.readFile(filePath, 'utf-8')
        if (content === '') {
            await fs.unlink(filePath)
        }
    })
    await Promise.all(promises)
}

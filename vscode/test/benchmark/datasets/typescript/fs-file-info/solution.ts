import fs from 'fs/promises'

interface FileInfo {
    size: number
    isFile: boolean
    isDirectory: boolean
}

export async function getFileInfo(path: string): Promise<FileInfo> {
    const stats = await fs.stat(path)
    return {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
    }
}

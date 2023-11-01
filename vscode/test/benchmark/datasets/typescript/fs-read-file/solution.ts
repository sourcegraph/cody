import fs from 'fs/promises'

export function getContent(path: string): Promise<string> {
    return fs.readFile(path, 'utf-8')
}

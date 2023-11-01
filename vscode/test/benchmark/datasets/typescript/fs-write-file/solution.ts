import fs from 'fs/promises'

export function updateLogs(logs: string[], separator: string, path: string): Promise<void> {
    return fs.appendFile(path, logs.join(separator))
}

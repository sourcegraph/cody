import type { Dirent, Stats } from 'node:fs'

export function readFile(): unknown {
    throw new Error('not implemented')
}

export function stat(path: string): Promise<Stats> {
    const isFile = path.includes('.') // HACK(sqs)
    return Promise.resolve({ isFile: () => isFile, isDirectory: () => !isFile } as Stats)
}

export function readdir(): Promise<Dirent[]> {
    return Promise.resolve([
        { name: 'baz.ts', isFile: () => true },
        { name: 'bar.ts', isFile: () => true },
        { name: 'foo.ts', isFile: () => true },
    ] as Dirent[])
}

export default { readFile, stat, readdir }

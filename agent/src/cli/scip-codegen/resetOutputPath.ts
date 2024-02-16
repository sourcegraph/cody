import fspromises from 'fs/promises'

export async function resetOutputPath(outputPath: string): Promise<void> {
    try {
        await fspromises.stat(outputPath)
        await fspromises.rm(outputPath, { recursive: true })
    } catch {
        // ignore
    }
    await fspromises.mkdir(outputPath, { recursive: true })
}

import fs from 'fs/promises'

export async function writeToFile(path: string, content: string): Promise<void> {
    try {
        await fs.writeFile(path, content)
        console.log('Name written to file successfully!')
    } catch (err) {
        console.error('An error occurred:', err)
    }
}

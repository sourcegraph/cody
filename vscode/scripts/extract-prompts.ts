import fs from 'fs'
import path from 'path'

const promptRegex = /prompt`.*/g

function findPromptUsages(dir: string): void {
    if (fs.statSync(dir).isDirectory()) {
        const files = fs.readdirSync(dir)

        for (const file of files) {
            const filePath = path.join(dir, file)
            findPromptUsages(filePath)
        }
    } else if (dir.endsWith('.ts')) {
        const content = fs.readFileSync(dir, 'utf8')

        let match
        while ((match = promptRegex.exec(content))) {
            console.log(`Found prompt usage: ${match[0]} in ${dir}`)
        }
    }
}

findPromptUsages('../lib/shared')

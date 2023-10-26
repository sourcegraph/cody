import fs from 'fs/promises'
import http from 'http'
import path from 'path'

import { server } from './generate'

const PORT = 3000

async function saveLog(log: { message: string; timestamp: number }): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/logs',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        }

        const req = http.request(options, res => {
            res.on('data', () => {})
            res.on('end', () => resolve(res.statusCode))
        })

        req.on('error', reject)
        req.write(JSON.stringify(log))
        req.end()
    })
}

const FILE_PATH = path.join(__dirname, 'logs.txt')

const serverInstance = server.listen(PORT, async () => {
    try {
        const status = await saveLog({ message: 'Hello, World!', timestamp: Date.now() })
        if (status !== 200) {
            throw new Error(`Expected status code 200 but received ${status}`)
        }
        const content = await fs.readFile(FILE_PATH, 'utf8')
        if (!content.includes('Hello, World!')) {
            throw new Error()
        }
    } catch {
        throw new Error('Failed to parse logs file')
    } finally {
        serverInstance.close()

        try {
            await fs.unlink(FILE_PATH)
        } catch (error) {
            console.error('Error deleting file', error)
        }
    }
})

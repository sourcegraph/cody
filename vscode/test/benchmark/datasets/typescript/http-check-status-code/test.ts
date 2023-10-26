import http from 'http'

import { createUser } from './generate'

const PORT = 3000

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/user/create') {
        if (req.headers['content-type'] !== 'application/json') {
            res.writeHead(415, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Unsupported Media Type. Expected application/json' }))
            return
        }

        let data = ''
        req.on('data', chunk => {
            data += chunk
        })

        req.on('end', () => {
            try {
                const user = JSON.parse(data)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ message: 'Data received successfully', data: user }))
            } catch (err) {
                res.writeHead(400)
                res.end(JSON.stringify({ error: 'Invalid JSON payload' }))
            }
        })

        return
    }

    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method Not Allowed' }))
})

const serverInstance = server.listen(PORT, async () => {
    try {
        const { status } = await createUser({ firstName: 'John', lastName: 'Doe' })
        if (status !== 200) {
            throw new Error(`Expected status code 200 but received ${status}`)
        }
    } finally {
        serverInstance.close()
    }
})

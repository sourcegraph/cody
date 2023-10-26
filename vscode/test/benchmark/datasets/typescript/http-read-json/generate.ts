import http from 'http'

export const server = http.createServer((req, res) => {
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
                const user =█
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

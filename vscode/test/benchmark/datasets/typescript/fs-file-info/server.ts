import http from 'http'

export const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/current-user') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ firstName: 'John', lastName: 'Doe' }))
        return
    }

    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method Not Allowed' }))
})

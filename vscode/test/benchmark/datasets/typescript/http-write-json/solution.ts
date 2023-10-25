import http from 'http'

export const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'GET') {
        res.writeHead(200)
        const data = { message: 'Hello, world!' }
        res.end(JSON.stringify(data))
    } else {
        res.setHeader('Allow', 'GET')
        res.writeHead(405)
        res.end()
    }
})

import http from 'http'

function createServer() {
    return http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'Hello, World!' }))
    })
}

const server = createServer()

export const serverInstance = server.listen(3000, async () => {})

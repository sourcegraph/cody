import fs from 'fs'
import http from 'http'
import path from 'path'

const LOGS_FILE = path.join(__dirname, 'logs.txt')

export const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/logs') {
        let data = ''
        req.on('data', chunk => {
            data += chunk
        })
        req.on('end', () => {
            █
        })
    } else {
        res.writeHead(405, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method Not Allowed' }))
    }
})

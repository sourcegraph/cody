import fs from 'fs'

export async function getContent(stream: fs.ReadStream): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = ''

        stream.on('data', (chunk: string) => {
            data += chunk
        })

        stream.on('end', () => {
            resolve(data)
        })

        stream.on('error', err => {
            reject(err)
        })
    })
}

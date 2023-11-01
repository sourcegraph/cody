import fs from 'fs'

export function streamDataToFile(
    inputFilePath: string,
    outputFilePath: string,
    callback: (err: string | null) => void
) {
    const readableStream = fs.createReadStream(inputFilePath, { encoding: 'utf8' })
    const writableStream = fs.createWriteStream(outputFilePath)
    readableStream.pipe(writableStream)
    readableStream.on('error', err => {
        callback(`Error reading from file: ${err.message}`)
    })
    writableStream.on('finish', () => {
        callback(null)
    })
    writableStream.on('error', err => {
        callback(`Error writing to file: ${err.message}`)
    })
}

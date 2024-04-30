import { exec } from 'node:child_process'

const EXTENSIONS = ['ts', 'tsx']

exec('git diff --unified=0 origin/main', (error, stdout, stderr) => {
    if (error) {
        console.error(`exec error: ${error}`)
        return
    }
    if (stderr) {
        console.error(`stderr: ${stderr}`)
        return
    }

    // Process the output
    const lines = stdout.split('\n')
    let currentFile = ''
    const fileRanges: { [key: string]: string[] } = {}

    for (const line of lines) {
        if (line.startsWith('diff --git')) {
            // Extract the filename correctly after the b/ prefix
            const parts = line.split(' ')
            currentFile = parts[2].substring(2) // Remove the 'b/' prefix
        } else if (line.startsWith('@@')) {
            // Extract the line numbers for additions
            const match = line.match(/\+([0-9]+),?([0-9]*)/)
            if (match) {
                const start = Number.parseInt(match[1], 10)
                const count = Number.parseInt(match[2] || '1', 10)
                const end = start + count - 1
                if (count > 0) {
                    // Ensure we only add ranges where lines were added
                    if (!fileRanges[currentFile]) {
                        fileRanges[currentFile] = []
                    }
                    fileRanges[currentFile].push(`${start}-${end}`)
                }
            }
        }
    }

    // Output the results
    for (const [file, ranges] of Object.entries(fileRanges)) {
        if (!EXTENSIONS.includes(file.split('.').pop() || '')) {
            continue
        }

        console.log(`${file}:${ranges.join(',')}`)
    }
})

import * as vscode from 'vscode'

/**
 * Exports the output log file to a specified location.
 * Searches for the output directory and log file within the provided logUri,
 * prompts the user to select a save location, copies the log file to the new location,
 * and optionally opens the exported log file.
 */
export async function exportOutputLog(logUri: vscode.Uri): Promise<void> {
    const logDir = vscode.Uri.joinPath(logUri, '..')
    try {
        // Search for a directory that starts with "output" inside logDir
        const files = await vscode.workspace.fs.readDirectory(logDir)
        const outputDirStat = files.find(
            file => file[0].startsWith('output') && file[1] === vscode.FileType.Directory
        )

        if (!outputDirStat) {
            return
        }

        // search for the file name that ends with 'Cody by Sourcegraph.log' inside the outputdir
        const outputDir = vscode.Uri.joinPath(logDir, outputDirStat[0])
        const outputFiles = await vscode.workspace.fs.readDirectory(outputDir)
        const logFile = outputFiles.find(file => file[0].endsWith('Cody by Sourcegraph.log'))

        if (logFile) {
            const currentLogFile = vscode.Uri.joinPath(outputDir, logFile[0])
            // Ask user for the location to save the log file
            const newLogUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.joinPath(logUri, logFile[0]),
                filters: {
                    'Log Files': ['log'],
                },
            })

            if (!newLogUri) {
                return
            }

            // copy the file to the new location
            await vscode.workspace.fs.copy(currentLogFile, newLogUri, { overwrite: true })
            vscode.window
                .showInformationMessage('Log file exported, would you like to open it?', 'Open')
                .then(answer => {
                    if (answer === 'Open') {
                        vscode.window.showTextDocument(newLogUri)
                    }
                })
        }
    } catch (error) {
        console.error(error)
    }
}

import * as vscode from 'vscode'
import { CODY_OUTPUT_CHANNEL, outputChannel } from '../../log'

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
        const outputDirName = files.find(
            file => file[0].startsWith('output') && file[1] === vscode.FileType.Directory
        )

        if (!outputDirName) {
            throw new Error('exportOutputLog: Could not find the output directory')
        }

        // search for the file name that ends with 'Cody by Sourcegraph.log' inside the outputdir
        const outputDir = vscode.Uri.joinPath(logDir, outputDirName[0])
        const outputFiles = await vscode.workspace.fs.readDirectory(outputDir)
        const logFile = outputFiles.find(file => file[0].endsWith(`${CODY_OUTPUT_CHANNEL}.log`))

        if (!logFile) {
            throw new Error('exportOutputLog: Could not find the log file')
        }

        const currentLogFile = vscode.Uri.joinPath(outputDir, logFile[0])
        // Ask user for the location to save the log file. toDateString but with number
        const timeNow = new Date().getTime()
        const newLogUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(logUri, `cody_${timeNow}.log`),
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
    } catch (error) {
        // Open the output channel instead
        openCodyOutputChannel()
        console.error(error)
    }
}

export function openCodyOutputChannel(): void {
    outputChannel.show()
}

/**
 * Enables debug mode by updating workspace configuration settings.
 * Sets 'cody.debug.verbose' to true globally.
 * Opens the Cody output channel.
 */
export function enableVerboseDebugMode(): void {
    const workspaceConfig = vscode.workspace.getConfiguration()
    void workspaceConfig.update('cody.debug.verbose', true, vscode.ConfigurationTarget.Global)
    openCodyOutputChannel()
}

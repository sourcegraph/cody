import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'

export async function dumpCodyHeapSnapshot() {
    const isNode = typeof process !== 'undefined'
    if (!isNode) {
        throw new Error('Heap dump is not supported in web')
    }

    try {
        const defaultPath = path.join(
            os.tmpdir(),
            `cody-heap-${new Date().toISOString().replace(/[:.]/g, '-')}.heapsnapshot`
        )

        const fileUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultPath),
            filters: {
                'Heap Snapshots': ['heapsnapshot'],
            },
            title: 'Save Cody Heap Snapshot',
        })

        if (!fileUri) {
            // User cancelled the save dialog
            return
        }

        // biome-ignore lint/style/useNodejsImportProtocol: node:v8 would not work for web compilation
        const v8 = require('v8')
        const filename = v8.writeHeapSnapshot(fileUri.path)
        const msg = `Cody heap dump written to: ${filename}`
        console.log(msg)
        vscode.window.showInformationMessage(msg, 'Open containing folder').then(answer => {
            if (answer === 'Open containing folder') {
                vscode.env.openExternal(vscode.Uri.file(path.parse(filename).dir))
            }
        })
    } catch (error) {
        const errorMessage = `Failed to create heap snapshot: ${error}`
        console.error(errorMessage)
        vscode.window.showErrorMessage(errorMessage)
    }
}

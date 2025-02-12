import fs from 'node:fs/promises'
import path from 'node:path'
import { codyPaths } from '@sourcegraph/cody-shared'

const uninstallMarker = path.join(codyPaths().config, 'uninstall-marker')

export const createUninstallMarker = async (): Promise<void> => {
    await fs.writeFile(uninstallMarker, '')
}

let isReinstall: boolean | undefined = undefined
// Checks if the user is reinstalling the extension by checking for the existence of a marker file
// If found, it deletes the marker file so that we only report reinstalling once
// Caches the value of isReinstall so that throughout the lifetime of the extension
// it still reports it as a re-install
export const isReinstalling = async (): Promise<boolean> => {
    if (typeof isReinstall === 'boolean') {
        return isReinstall
    }
    try {
        await fs.stat(uninstallMarker)
        await fs.unlink(uninstallMarker)
        isReinstall = true
    } catch (error) {
        isReinstall = false
    }

    return isReinstall
}

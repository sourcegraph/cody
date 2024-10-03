import fs from 'node:fs/promises'
import { codyPaths } from '@sourcegraph/cody-shared'

export const uninstallMarker = codyPaths().config + '/uninstall-marker'

export const createUninstallMarker = async (): Promise<void> => {
    await fs.writeFile(uninstallMarker, '')
}

// Checks if the user is reinstalling the extension by checking for the existence of a marker file
// If found, it deletes the marker file so that we only report reinstalling once
export const isReinstalling = async (): Promise<boolean> => {
    try {
        await fs.stat(uninstallMarker)
        await fs.unlink(uninstallMarker)
        return true
    } catch (error) {
        return false
    }
}

import path from 'path'

import { Interaction } from '../transcript/interaction'

/**
 * Gets the name of the parent directory from a directory path.
 */
export const getParentDirName = (dirPath: string): string => path.basename(path.dirname(dirPath))

/**
 * Gets the current directory path from the file path param
 */
export const getCurrentDirPath = (filePath: string): string => path.dirname(filePath)

/**
 * Returns a Promise resolving to an Interaction object representing an error response from the assistant.
 *
 * @param errorMsg - The error message text to include in the assistant response.
 * @param displayText - Optional human-readable display text for the request.
 * @returns A Promise resolving to the Interaction object.
 */
export async function interactionWithAssistantError(errorMsg: string, displayText = ''): Promise<Interaction> {
    return Promise.resolve(
        new Interaction(
            { speaker: 'human', displayText },
            { speaker: 'assistant', displayText: errorMsg, error: errorMsg },
            Promise.resolve([]),
            []
        )
    )
}

import { Interaction } from '../transcript/interaction'

/**
 * Converts the provided context string to a JSON string by escaping special
 * characters.
 *
 * @param context - The context string to convert to JSON.
 * @returns The JSON string representing the escaped context.
 */
export function toJSON(context: string): string {
    const escaped = context.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\//g, '\\/').replace('/\n//', '\n')
    return JSON.stringify(escaped)
}

/**
 * Gets the name of the parent directory from a directory path.
 *
 * @param dirPath - The full directory path
 * @returns The name of the parent directory, or empty string if none.
 */
export const getParentDirName = (dirPath: string): string => {
    const pathParts = dirPath.split('/')
    pathParts.pop()
    return pathParts.pop() || ''
}

/**
 * Gets the current directory path from the file path param
 */
export const getCurrentDirPath = (filePath: string): string => filePath?.replace(/\/[^/]+$/, '')

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

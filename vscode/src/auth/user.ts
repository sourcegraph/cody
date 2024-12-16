import {graphqlClient, isAbortError} from "@sourcegraph/cody-shared";

export async function getCurrentUserId(signal: AbortSignal): Promise<string | null | Error> {
    try {
        return await graphqlClient.getCurrentUserId(signal)
    } catch (error) {
        if (isAbortError(error)) {
            throw error
        }

        return null
    }
}

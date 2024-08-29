import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { createLimiter } from './limiter'

type ResolvedLocations = (vscode.Location | vscode.LocationLink)[]

export async function getDefinitionLocations(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<vscode.Location[]> {
    const definitions = await executeTracedCommand<ResolvedLocations>(
        'vscode.executeDefinitionProvider',
        uri,
        position
    )
    return definitions.map(locationLinkToLocation)
}

export async function getImplementationLocations(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<vscode.Location[]> {
    const definitions = await executeTracedCommand<ResolvedLocations>(
        'vscode.executeImplementationProvider',
        uri,
        position
    )
    return definitions.map(locationLinkToLocation)
}

export async function getTypeDefinitionLocations(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<vscode.Location[]> {
    const definitions = await executeTracedCommand<ResolvedLocations>(
        'vscode.executeTypeDefinitionProvider',
        uri,
        position
    )
    return definitions.map(locationLinkToLocation)
}

export async function getHover(uri: vscode.Uri, position: vscode.Position): Promise<vscode.Hover[]> {
    return executeTracedCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, position)
}

export function getTextFromLocation(location: vscode.Location): Promise<string> {
    return wrapInActiveSpan('getTextFromLocation', async () => {
        const document = await vscode.workspace.openTextDocument(location.uri)
        return document.getText(location.range)
    })
}

export function getLinesFromLocation(location: vscode.Location, lineCount: number): Promise<string> {
    return getTextFromLocation(
        new vscode.Location(
            location.uri,
            new vscode.Range(
                new vscode.Position(location.range.start.line, 0),
                new vscode.Position(location.range.start.line + lineCount, 0)
            )
        )
    )
}

function executeTracedCommand<T>(command: string, ...rest: unknown[]): Promise<T> {
    return wrapInActiveSpan(command, async () => {
        return vscode.commands.executeCommand<T>(command, ...rest)
    })
}

/**
 * Convert the given Location or LocationLink into a Location.
 */
export const locationLinkToLocation = (
    value: vscode.Location | vscode.LocationLink
): vscode.Location => {
    return isLocationLink(value) ? new vscode.Location(value.targetUri, value.targetRange) : value
}

const isLocationLink = (value: vscode.Location | vscode.LocationLink): value is vscode.LocationLink => {
    return 'targetUri' in value
}

export const lspRequestLimiter = createLimiter({
    // The concurrent requests limit is chosen very conservatively to avoid blocking the language
    // server.
    limit: 3,
    // If any language server API takes more than 2 seconds to answer, we should cancel the request
    timeout: 2000,
})

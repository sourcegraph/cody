import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

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

// TODO: experiment with workspace symbols to get symbol kind to help determine how to extract context snippet text
export async function getWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    return executeTracedCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query
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

export const isLocationLink = (
    value: vscode.Location | vscode.LocationLink
): value is vscode.LocationLink => {
    return 'targetUri' in value
}

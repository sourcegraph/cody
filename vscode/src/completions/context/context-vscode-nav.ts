import * as vscode from 'vscode'

import { debug } from '../../log'

import type { ReferenceSnippet } from './context'

interface Options {
    document: vscode.TextDocument
    position: vscode.Position
}

export async function getContextFromCodeNav(options: Options): Promise<ReferenceSnippet[]> {
    function time<T>(promise: Thenable<T>, label: string): Promise<T> {
        const start = performance.now()

        return Promise.resolve(promise).then(result => {
            console.log(`${label} duration`, performance.now() - start)
            return result
        })
    }

    const [
        hoverResults,
        // definitionResults,
        typeDefinitionResults,
        referenceResults,
        // declarationsResults,
        // implementationResults,
    ] = await Promise.all([
        time(
            vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                options.document.uri,
                options.position
            ),
            'hover'
        ),
        // time(
        //     vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        //         'vscode.executeDefinitionProvider',
        //         options.document.uri,
        //         options.position
        //     ),
        //     'definition'
        // ),
        time(
            vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
                'vscode.executeTypeDefinitionProvider',
                options.document.uri,
                options.position
            ),
            'typeDefinition'
        ),
        time(
            vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                options.document.uri,
                options.position
            ),
            'reference'
        ),
        // time(
        //     vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        //         'vscode.executeDeclarationProvider',
        //         options.document.uri,
        //         options.position
        //     ),
        //     'declaration'
        // ),
        // time(
        //     vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        //         'vscode.executeImplementationProvider',
        //         options.document.uri,
        //         options.position
        //     ),
        //     'implementation'
        // ),
    ])

    const hoverSnippets = hoverResults.flatMap(hoverToSnippets)

    const [typeDefinitionSnippets, referenceSnippets] = await Promise.all([
        Promise.all(typeDefinitionResults.flatMap(l => locationToSnippet('type-definition', l))),
        Promise.all(referenceResults.flatMap(l => locationToSnippet('references', l))),
    ])

    console.log(typeDefinitionSnippets, referenceSnippets)
    // console.log('code nav duration', performance.now() - start)

    debug(
        'CodeNavStuff',
        'hover',
        JSON.stringify(
            {
                hoverSnippets,
                typeDefinitionSnippets,
                referenceSnippets,
            },
            null,
            2
        )
    )

    return []
}

async function locationToSnippet(
    label: string,
    location: vscode.Location | vscode.LocationLink
): Promise<ReferenceSnippet> {
    const uri = 'uri' in location ? location.uri : location.targetUri
    const doc = await vscode.workspace.openTextDocument(uri)
    const range = 'range' in location ? location.range : location.targetRange
    const content = doc.lineAt(range.start.line).text
    return {
        fileName: `${label}-context.${uri.toString().split('.').pop()}`,
        content,
    }
}

function hoverToSnippets(hover: vscode.Hover): ReferenceSnippet[] {
    return (
        hover.contents
            .map((content: any) => content.value)
            // This is a starter to detect errors shown in the hover widget, like the ones added via
            // Pretty TypeScript Errors
            .filter(content => !content.startsWith('<span'))
            .map((content: string, index) => ({ content, fileName: `hover-context-${index}.md` }))
    )
}

// new ApiCommand(
//     'vscode.executeDefinitionProvider', '_executeDefinitionProvider', 'Execute all definition providers.',
//     [ApiCommandArgument.Uri, ApiCommandArgument.Position],
//     new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | vscode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
// ),
// new ApiCommand(
//     'vscode.executeTypeDefinitionProvider', '_executeTypeDefinitionProvider', 'Execute all type definition providers.',
//     [ApiCommandArgument.Uri, ApiCommandArgument.Position],
//     new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | vscode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
// ),
// new ApiCommand(
//     'vscode.executeDeclarationProvider', '_executeDeclarationProvider', 'Execute all declaration providers.',
//     [ApiCommandArgument.Uri, ApiCommandArgument.Position],
//     new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | vscode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
// ),
// new ApiCommand(
//     'vscode.executeImplementationProvider', '_executeImplementationProvider', 'Execute all implementation providers.',
//     [ApiCommandArgument.Uri, ApiCommandArgument.Position],
//     new ApiCommandResult<(languages.Location | languages.LocationLink)[], (types.Location | vscode.LocationLink)[] | undefined>('A promise that resolves to an array of Location or LocationLink instances.', mapLocationOrLocationLink)
// ),
// new ApiCommand(
//     'vscode.executeReferenceProvider', '_executeReferenceProvider', 'Execute all reference providers.',
//     [ApiCommandArgument.Uri, ApiCommandArgument.Position],
//     new ApiCommandResult<languages.Location[], types.Location[] | undefined>('A promise that resolves to an array of Location-instances.', tryMapWith(typeConverters.location.to))
// ),

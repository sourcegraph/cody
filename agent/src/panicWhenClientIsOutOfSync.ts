import isEqual from 'lodash/isEqual'
import type { AgentTextEditor } from './AgentTextEditor'
import type { ProtocolTextDocument } from './protocol-alias'
import { renderUnifiedDiff } from './renderUnifiedDiff'
import { protocolRange, vscodeRange } from './vscode-type-converters'

// Allows the client to send a "source of truth" document that reflects the
// client's current state.  Should only be used during testing (or local
// development) to ensure that the document state on the client and server match
// each other. This function exits the process on the first mis-match by
// default, unless a custom `doPanic` function is provided (only used for
// testing this function).
// The motivation to create this function was that we've spent quite a while
// debugging document synchronization bugs in the JetBrains plugin. These bugs
// can be very difficult to debug, esp. when looking at raw logs of
// line/character numbers.
export function panicWhenClientIsOutOfSync(
    mostRecentlySentClientDocument: ProtocolTextDocument,
    serverEditor: AgentTextEditor,
    params: { doPanic: (message: string) => void } = exitProcessOnError
): void {
    const serverDocument = serverEditor.document
    if (mostRecentlySentClientDocument.testing?.sourceOfTruthDocument) {
        const clientSourceOfTruthDocument = mostRecentlySentClientDocument.testing.sourceOfTruthDocument

        if (
            typeof clientSourceOfTruthDocument.content === 'string' && // Skip content assertion if the client doesn't send content
            clientSourceOfTruthDocument.content !== serverDocument.content
        ) {
            const diff = renderUnifiedDiff(
                {
                    header: `${clientSourceOfTruthDocument.uri} (client side)`,
                    text: clientSourceOfTruthDocument.content ?? '',
                },
                {
                    header: `${serverDocument.uri} (server side)`,
                    text: serverDocument.content ?? '',
                }
            )
            params.doPanic(diff)
        }

        if ((clientSourceOfTruthDocument.selection ?? undefined) !== undefined) {
            const clientCompareObject = {
                selection: clientSourceOfTruthDocument.selection,
                // Ignoring visibility for now. It was causing low-priority panics
                // when we were still debugging higher-priority content/selection
                // bugs.
            }
            const serverCompareObject = {
                selection: protocolRange(serverEditor.selection),
            }
            if (!isEqual(clientCompareObject, serverCompareObject)) {
                const diff = renderUnifiedDiff(
                    {
                        header: `${clientSourceOfTruthDocument.uri} (client side)`,
                        text: JSON.stringify(clientCompareObject, null, 2),
                    },
                    {
                        header: `${serverDocument.uri} (server side)`,
                        text: JSON.stringify(serverCompareObject, null, 2),
                    }
                )
                params.doPanic(diff)
            }
        }
    }

    if (typeof mostRecentlySentClientDocument.testing?.selectedText === 'string') {
        const serverSelectedText = serverDocument.protocolDocument.selection
            ? serverDocument.getText(vscodeRange(serverDocument.protocolDocument.selection))
            : ''
        if (mostRecentlySentClientDocument.testing.selectedText !== serverSelectedText) {
            params.doPanic(
                renderUnifiedDiff(
                    {
                        header: `${mostRecentlySentClientDocument.uri} (client side)`,
                        text: mostRecentlySentClientDocument.testing.selectedText,
                    },
                    {
                        header: `${mostRecentlySentClientDocument.uri} (server side)`,
                        text: serverSelectedText,
                    }
                )
            )
        }
    }
}

const exitProcessOnError = {
    doPanic: (message: string) => {
        process.stderr.write(
            '!PANIC! Client document content is out of sync with server document content\n'
        )
        process.stderr.write(message + '\n')
        process.exit(1)
    },
}

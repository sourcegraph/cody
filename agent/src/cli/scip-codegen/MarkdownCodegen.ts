import dedent from 'dedent'
import fspromises from 'fs/promises'
import {
    BaseCodegen,
    ProtocolMethodDirection,
    ProtocolMethodKind,
    type ProtocolSymbol,
} from './BaseCodegen'
import type { scip } from './scip'

export class MarkdownCodegen extends BaseCodegen {
    public async run(): Promise<void> {
        const text = (await fspromises.readFile(this.options.output, 'utf-8')).toString()
        const startMarker = '<!-- PROTOCOL START -->'
        const startOffset = findMarkerOffset(text, startMarker)
        const endOffset = findMarkerOffset(text, '<!-- PROTOCOL END -->')
        const docs: string[] = []
        for (const protocolSymbol of this.allProtocolSymbols()) {
            for (const method of this.symtab.structuralType(protocolSymbol.symbol)) {
                const doc = this.formatJsonrpcMethod(protocolSymbol, method)
                if (doc) {
                    docs.push(doc)
                }
            }
        }
        await fspromises.writeFile(
            this.options.output,
            [
                text.substring(0, startOffset + startMarker.length),
                ...docs,
                text.substring(endOffset),
            ].join('\n')
        )
    }

    private formatJsonrpcMethod(protocolSymbol: ProtocolSymbol, method: scip.SymbolInformation): string {
        let signature = method.documentation.find(doc => doc.startsWith('```ts')) ?? ''
        if (!signature) {
            return ''
        }
        signature = signature.replace('(property) ', '')

        let docstring = method.documentation.find(doc => !doc.startsWith('```ts')) ?? ''
        if (docstring) {
            docstring = `<p>Description: ${docstring}</p>`
        }
        const kind = ProtocolMethodKind[protocolSymbol.kind]
        const direction =
            protocolSymbol.direction === ProtocolMethodDirection.ClientToServer
                ? `${kind} sent from the client to client server.`
                : `${kind} sent from the server to the client.`
        const id = method.display_name.replace('$/', '').replace('/', '_')
        const icon = protocolSymbol.kind === ProtocolMethodKind.Request ? requestIcon : notificationIcon
        return dedent`<h2 id="${id}"><a href="#${id}" name="${id}"><code>${method.display_name}</code> (${icon})</a></h2>
               <p>${direction}</p>
               ${docstring}

               ${signature}
               `
    }
}
const requestIcon = `<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">`
const notificationIcon = `<img class="emoji" title=":arrow_right:" alt=":arrow_right:" src="https://github.githubassets.com/images/icons/emoji/unicode/27a1.png" height="20" width="20">`

export function stripPrefix(text: string, prefix: string): string {
    if (text.startsWith(prefix)) {
        return text.slice(prefix.length)
    }
    return text
}

export function stripSuffix(text: string, suffix: string): string {
    if (text.endsWith(suffix)) {
        return text.slice(0, text.length - suffix.length)
    }
    return text
}

export function findMarkerOffset(text: string, marker: string): number {
    const index = text.indexOf(marker)
    if (index < 0) {
        throw new Error('missing marker: ' + marker)
    }
    return index
}

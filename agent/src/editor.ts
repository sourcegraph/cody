import { relative } from 'path'
import url from 'url'

import {
    Editor,
    Indentation,
    LightTextDocument,
    TextDocument,
    TextEdit,
    Uri,
    ViewControllers,
    Workspace,
} from '@sourcegraph/cody-shared/src/editor'

import { Agent } from './agent'

export class AgentEditor extends Editor {
    constructor(private agent: Agent, public controllers?: ViewControllers) {
        super()
    }

    /** TODO: Support workspaces properly in agent */
    public getActiveWorkspace(): Workspace | null {
        return this.agent.workspaceRootPath ? new Workspace(this.agent.workspaceRootPath) : null
    }

    /** TODO: Support workspaces properly in agent */
    public getWorkspaceOf(uri: Uri): Workspace | null {
        return this.getActiveWorkspace()
    }

    public didReceiveFixupText(): Promise<void> {
        throw new Error('Method not implemented.')
    }

    public getActiveTextDocument(): TextDocument | null {
        if (this.agent.activeDocumentUri === null) {
            return null
        }

        return this.agent.documents.get(this.agent.activeDocumentUri) ?? null
    }

    public getTextDocument(uri: string): Promise<TextDocument | null> {
        return Promise.resolve(this.agent.documents.get(uri) ?? null)
    }

    public getLightTextDocument(uri: string): Promise<LightTextDocument | null> {
        return this.getTextDocument(uri)
    }

    public edit(uri: string, edits: TextEdit[]): Promise<void> {
        throw new Error('Method not implemented.')
    }

    public quickPick(labels: string[]): Promise<string | null> {
        throw new Error('Method not implemented.')
    }

    public warn(message: string): Promise<void> {
        throw new Error('Method not implemented.')
    }

    public prompt(prompt?: string | undefined): Promise<string | null> {
        throw new Error('Method not implemented.')
    }

    public getOpenLightTextDocuments(): LightTextDocument[] {
        return [...this.agent.documents.values()]
    }

    public getCurrentDocument(): LightTextDocument | null {
        const active = this.agent.activeDocumentUri

        if (!active) {
            return null
        }

        return {
            uri: url.pathToFileURL(active).toString(),
            languageId: 'TODO',
        }
    }

    public getDocumentTextTruncated(uri: string): Promise<string | null> {
        const doc = this.agent.documents.get(url.fileURLToPath(uri))

        if (!doc?.content) {
            return Promise.resolve(null)
        }

        return Promise.resolve(doc.content.slice(0, 100_000))
    }

    public getDocumentRelativePath(uri: string): Promise<string | null> {
        const rootPath = this.agent.workspaceRootPath

        if (!rootPath) {
            return Promise.resolve(null)
        }

        return Promise.resolve(relative(rootPath, url.parse(uri).pathname!))
    }

    /** TODO: Actually communicate this information */
    public getIndentation(): Indentation {
        return {
            kind: 'space',
            size: 4,
        }
    }
}

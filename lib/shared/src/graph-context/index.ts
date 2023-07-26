import { isErrorLike } from '../common'
import { ActiveTextEditorSelectionRange, Editor } from '../editor'
import {
    ActiveFileSelectionRange,
    PreciseContextResult,
    SourcegraphGraphQLAPIClient,
} from '../sourcegraph-api/graphql/client'

export interface GitInfo {
    repo: string
    commitID: string
}

export abstract class GraphContextFetcher {
    // TODO - move into editor interface
    public abstract getGitInfo(workspaceRoot: string): Promise<GitInfo>

    constructor(private graphqlClient: SourcegraphGraphQLAPIClient, private editor: Editor) {}

    public async getContext(): Promise<PreciseContextResult[]> {
        console.log('🚀 ~ file: index.ts:39 ~ GraphContextFetcher ~ getContext ~ this.editor:', this.editor)
        const editorContext = this.editor.getActiveTextEditor()
        if (!editorContext) {
            return []
        }
        const workspaceRoot = this.editor.getWorkspaceRootPath() || ""
        const { repo, commitID: cid } = await this.getGitInfo(workspaceRoot)
        let repository = editorContext.repoName ?? repo
        let commitID = editorContext.revision || cid || 'HEAD'
        console.log("🚀 ~ file: index.ts:34 ~ GraphContextFetcher ~ getContext ~ repository, commitID:", repository, commitID)
        const activeFile = pathRelativeToRoot(editorContext.filePath, workspaceRoot)

        const response = await this.graphqlClient.getPreciseContext(
            repository,
            commitID,
            activeFile,
            editorContext.content,
            getActiveSelectionRange(editorContext.selection)
        )
        console.log("🚀 ~ file: index.ts:50 ~ GraphContextFetcher ~ getContext ~ repository",
            commitID,
            activeFile,
            editorContext.content,
            getActiveSelectionRange(editorContext.selection),
            repository,
        )
        console.log('🚀 ~ file: index.ts:40 ~ GraphContextFetcher ~ getContext ~ response:', response)
        if (isErrorLike(response)) {
            return []
        }

        return response
    }
}

function getActiveSelectionRange(
    selection: ActiveTextEditorSelectionRange | undefined
): ActiveFileSelectionRange | null {
    if (!selection) {
        return null
    }

    return {
        startLine: selection.start.line,
        startCharacter: selection.start.character,
        endLine: selection.end.line,
        endCharacter: selection.end.character,
    }
}

function pathRelativeToRoot(path: string, workspaceRoot: string): string {
    if (!workspaceRoot) {
        return path
    }

    if (path.startsWith(workspaceRoot)) {
        // +1 for the slash so we produce a relative path
        return path.slice(workspaceRoot.length + 1)
    }

    // Outside of workspace, return absolute file path
    return path
}

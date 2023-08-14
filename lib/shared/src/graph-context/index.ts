import { isErrorLike } from '../common'
import { ActiveTextEditorSelectionRange, Editor } from '../editor'
import {
    ActiveFileSelectionRange,
    PreciseContextResult,
    SourcegraphGraphQLAPIClient,
} from '../sourcegraph-api/graphql/client'

export class GraphContextFetcher {
    constructor(
        private graphqlClient: SourcegraphGraphQLAPIClient,
        private editor: Editor
    ) {}

    public async getContext(): Promise<PreciseContextResult[]> {
        const {
            repoName: repository = '',
            revision: commitID = '',
            filePath = '',
            content = '',
            selectionRange,
        } = this.editor.getActiveTextEditor() || {}
        if (!repository) {
            return []
        }

        const response = await this.graphqlClient.getPreciseContext(
            repository,
            commitID || 'HEAD',
            pathRelativeToRoot(filePath, this.editor.getWorkspaceRootPath() || ''),
            content,
            getActiveSelectionRange(selectionRange)
        )
        if (isErrorLike(response)) {
            return []
        }

        // :)
        console.log(response.traceLogs)
        return response.context
    }
}

const getActiveSelectionRange = (selection?: ActiveTextEditorSelectionRange): ActiveFileSelectionRange | null =>
    selection
        ? {
              startLine: selection.start.line,
              startCharacter: selection.start.character,
              endLine: selection.end.line,
              endCharacter: selection.end.character,
          }
        : null

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

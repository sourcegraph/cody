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
            revision: commitID = 'HEAD',
            filePath = '',
            content = '',
            selection,
        } = this.editor.getActiveTextEditor() || {}
        if (!repository) {
            return []
        }

        const response = await this.graphqlClient.getPreciseContext(
            repository,
            commitID,
            pathRelativeToRoot(filePath, this.editor.getWorkspaceRootPath() || ''),
            content,
            getActiveSelectionRange(selection)
        )
        return isErrorLike(response) ? [] : response
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

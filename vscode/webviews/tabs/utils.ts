import { CodyIDE } from '@sourcegraph/cody-shared'
import type { WebviewType } from '../../src/chat/protocol'

interface NewChatCommandInput {
    IDE: CodyIDE
    // Type/location of the current webview.
    webviewType?: WebviewType | undefined | null
    // Whether support running multiple webviews (e.g. sidebar w/ multiple editor panels).
    multipleWebviewsEnabled?: boolean | undefined | null
}

/**
 * Returns a proper command for vscode API, different IDE and enviroments where we
 * run Cody Chat UI require different commands at the moment. This utility hides
 * complexity about exact command that would be run.
 */
export function getCreateNewChatCommand(options: NewChatCommandInput): string {
    const { IDE, webviewType, multipleWebviewsEnabled } = options

    return IDE === CodyIDE.Web
        ? 'cody.chat.new'
        : webviewType === 'sidebar' || !multipleWebviewsEnabled
          ? 'cody.chat.newPanel'
          : 'cody.chat.newEditorPanel'
}

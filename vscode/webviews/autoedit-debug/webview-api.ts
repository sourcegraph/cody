import type { VSCodeAutoeditDebugWrapper } from '../../src/autoedits/debug-panel/debug-protocol'
import { getVSCodeAPI } from '../utils/VSCodeApi'

//  https://code.visualstudio.com/api/extension-guides/webview#passing-messages-from-a-webview-to-an-extension
export const vscode = getVSCodeAPI() as unknown as VSCodeAutoeditDebugWrapper

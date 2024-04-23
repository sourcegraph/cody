import * as vscode from 'vscode'
import { transformEmojiToSvg } from './utils'

const TUTORIAL_EMOJIS = {
    Todo: '&#128073;', // 👉
}

export const TODO_DECORATION = vscode.window.createTextEditorDecorationType({
    gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Todo),
    gutterIconSize: 'contain',
})

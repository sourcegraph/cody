import * as vscode from 'vscode'
import { transformEmojiToSvg } from './utils'

const TUTORIAL_EMOJIS = {
    Todo: '&#128073;', // 👉
    Done: '&#x1F389;', // 🎉
}

export const TODO_DECORATION = vscode.window.createTextEditorDecorationType({
    gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Todo),
    gutterIconSize: 'contain',
})
export const COMPLETE_DECORATION = vscode.window.createTextEditorDecorationType({
    gutterIconPath: transformEmojiToSvg(TUTORIAL_EMOJIS.Done),
    gutterIconSize: 'contain',
})

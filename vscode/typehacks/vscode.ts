/// <reference types="vscode" />
declare module 'vscode' {
    export namespace commands {
        type CompileTimeError<T extends string> = { __errorMessage: T } & { __error: 'ERROR' }
        export type CodyCommandString = `cody.${string}` | `_cody.${string}`
        export function registerCommand(
            command: CodyCommandString,
            callback: (...args: any[]) => any,
            thisArg?: any
        ): Disposable

        /**
         * @deprecated Commands must (generally) be prefixed with `cody` or `_cody`
         */
        export function registerCommand(
            command: string,
            callback: (...args: any[]) => any,
            thisArg?: any
        ): CompileTimeError<'Commands must (generally) be prefixed with `cody` or `_cody`'>

        export function registerTextEditorCommand(
            command: CodyCommandString,
            callback: (textEditor: TextEditor, edit: TextEditorEdit, ...args: any[]) => void,
            thisArg?: any
        ): Disposable

        /**
         * @deprecated Commands must (generally) be prefixed with `cody` or `_cody`
         */
        export function registerTextEditorCommand(
            command: string,
            callback: (textEditor: TextEditor, edit: TextEditorEdit, ...args: any[]) => void,
            thisArg?: any
        ): CompileTimeError<'Commands must (generally) be prefixed with `cody` or `_cody`'>
    }
}

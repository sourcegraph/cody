declare module 'vscode' {
    export interface Uri {
        /**
         * @deprecated Only call `.fsPath` on {@link FileURI}, which you can create with `URI.file`
         * or with the {@link isFileURI} and {@link assertFileURI} helpers.
         */
        fsPath: string
    }
}

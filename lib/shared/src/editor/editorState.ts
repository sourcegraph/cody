let _editorWindowIsFocused: () => boolean

export function setEditorWindowIsFocused(editorWindowIsFocused: () => boolean): void {
    _editorWindowIsFocused = editorWindowIsFocused
}

export function editorWindowIsFocused(): boolean {
    if (!_editorWindowIsFocused) {
        throw new Error('must call setEditorWindowIsFocused first')
    }
    return _editorWindowIsFocused()
}

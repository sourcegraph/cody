package com.sourcegraph.cody.vscode

class InlineAutocompleteItem(
    var insertText: String,
    var filterText: String,
    var range: Range,
    var command: Command
)

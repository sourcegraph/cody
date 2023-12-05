package com.sourcegraph.cody.agent.protocol

import com.google.gson.JsonPrimitive
import com.google.gson.JsonSerializer
import com.sourcegraph.cody.vscode.Range

@JvmInline value class CompletionItemID(val value: String)

data class AutocompleteResult(val items: List<AutocompleteItem>)

data class AutocompleteItem(
    val id: CompletionItemID,
    var insertText: String,
    val range: Range,
)

val CompletionItemIDSerializer =
    JsonSerializer<CompletionItemID> { src, _, _ -> JsonPrimitive(src.value) }

data class CompletionItemParams(val completionID: CompletionItemID)

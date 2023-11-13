package com.sourcegraph.cody.agent.protocol

import com.google.gson.annotations.SerializedName

enum class AutocompleteTriggerKind {
  @SerializedName("Automatic") AUTOMATIC,
  @SerializedName("Invoke") INVOKE,
}

data class AutocompleteParams(
    val filePath: String,
    val position: Position,
    val triggerKind: AutocompleteTriggerKind? = AutocompleteTriggerKind.AUTOMATIC,
    val selectedCompletionInfo: SelectedCompletionInfo? = null
)

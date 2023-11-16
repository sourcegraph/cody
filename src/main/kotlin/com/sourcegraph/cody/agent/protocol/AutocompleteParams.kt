package com.sourcegraph.cody.agent.protocol

enum class AutocompleteTriggerKind(val value: String) {
  AUTOMATIC("Automatic"),
  INVOKE("Invoke"),
}

data class AutocompleteParams(
    val filePath: String,
    val position: Position,
    val triggerKind: String? = AutocompleteTriggerKind.AUTOMATIC.value,
    val selectedCompletionInfo: SelectedCompletionInfo? = null
)

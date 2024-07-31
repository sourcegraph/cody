package com.sourcegraph.cody.agent.protocol

import com.sourcegraph.cody.agent.protocol_generated.Position

enum class AutocompleteTriggerKind(val value: String) {
  AUTOMATIC("Automatic"),
  INVOKE("Invoke"),
}

data class AutocompleteParams(
    val uri: String,
    val position: Position,
    val triggerKind: String? = AutocompleteTriggerKind.AUTOMATIC.value,
    val selectedCompletionInfo: SelectedCompletionInfo? = null
)

@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

import com.google.gson.annotations.SerializedName;

data class AutocompleteParams(
  val uri: String,
  val filePath: String? = null,
  val position: Position,
  val triggerKind: TriggerKindEnum? = null, // Oneof: Automatic, Invoke
  val selectedCompletionInfo: SelectedCompletionInfo? = null,
) {

  enum class TriggerKindEnum {
    @SerializedName("Automatic") Automatic,
    @SerializedName("Invoke") Invoke,
  }
}


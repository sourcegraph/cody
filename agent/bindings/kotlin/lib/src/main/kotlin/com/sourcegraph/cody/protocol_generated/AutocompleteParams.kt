@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class AutocompleteParams(
  val uri: String? = null,
  val filePath: String? = null,
  val position: Position? = null,
  val triggerKind: TriggerKindEnum? = null, // Oneof: Automatic, Invoke
  val selectedCompletionInfo: SelectedCompletionInfo? = null,
) {

  enum class TriggerKindEnum {
    @SerializedName("Automatic") Automatic,
    @SerializedName("Invoke") Invoke,
  }
}


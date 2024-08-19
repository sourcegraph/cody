/*
 * Generated file - DO NOT EDIT MANUALLY
 * They are copied from the cody agent project using the copyProtocol gradle task.
 * This is only a temporary solution before we fully migrate to generated protocol messages.
 */
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


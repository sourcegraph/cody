@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class AutocompleteParams(
  val uri: String? = null,
  val filePath: String? = null,
  val position: Position? = null,
  val triggerKind: TriggerKindEnum? = null, // Oneof: Automatic, Invoke
  val selectedCompletionInfo: SelectedCompletionInfo? = null,
)


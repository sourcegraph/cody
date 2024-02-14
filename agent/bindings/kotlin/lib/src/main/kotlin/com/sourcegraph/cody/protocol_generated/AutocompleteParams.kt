@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class AutocompleteParams(
  var uri: String? = null,
  var filePath: String? = null,
  var position: Position? = null,
  var triggerKind: String? = null, // Oneof: Automatic, Invoke
  var selectedCompletionInfo: SelectedCompletionInfo? = null,
)


@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ContextGroup(
  var dir: Uri? = null,
  var displayName: String? = null,
  var providers: List<ContextProvider>? = null,
)


@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class SaveDialogOptionsParams(
  val defaultUri: String? = null,
  val saveLabel: String? = null,
  val filters: Map<String, List<String>>? = null,
  val title: String? = null,
)


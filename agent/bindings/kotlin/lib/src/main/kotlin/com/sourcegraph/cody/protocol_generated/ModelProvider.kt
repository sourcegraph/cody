@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ModelProvider(
  val default: Boolean? = null,
  val codyProOnly: Boolean? = null,
  val provider: String? = null,
  val title: String? = null,
  val primaryProviders: List<ModelProvider>? = null,
  val localProviders: List<ModelProvider>? = null,
)


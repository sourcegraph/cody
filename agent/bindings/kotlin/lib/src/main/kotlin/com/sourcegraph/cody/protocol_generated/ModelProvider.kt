@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ModelProvider(
  val default: Boolean,
  val codyProOnly: Boolean,
  val provider: String,
  val title: String,
  val primaryProviders: List<ModelProvider>,
  val localProviders: List<ModelProvider>,
)


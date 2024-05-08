@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ModelProvider(
  val default: Boolean,
  val initialDefault: Boolean? = null,
  val codyProOnly: Boolean,
  val provider: String,
  val title: String,
  val deprecated: Boolean,
  val primaryProviders: List<ModelProvider>,
  val localProviders: List<ModelProvider>,
)


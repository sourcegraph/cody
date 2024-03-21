@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ModelProvider(
  val default: Boolean? = null,
  val codyProOnly: Boolean? = null,
  val provider: String? = null,
  val title: String? = null,
  val contextWindow: Int? = null,
  val privateProviders: Map<String, ModelProvider>? = null,
  val dotComProviders: List<ModelProvider>? = null,
  val ollamaProvidersEnabled: Boolean? = null,
  val ollamaProviders: List<ModelProvider>? = null,
)


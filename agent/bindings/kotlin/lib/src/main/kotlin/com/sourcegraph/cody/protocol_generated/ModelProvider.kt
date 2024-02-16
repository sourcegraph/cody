@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ModelProvider(
  var default: Boolean? = null,
  var codyProOnly: Boolean? = null,
  var provider: String? = null,
  var title: String? = null,
  var privateProviders: Map<String, ModelProvider>? = null,
  var dotComProviders: List<ModelProvider>? = null,
)


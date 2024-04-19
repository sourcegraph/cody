@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ConfigParams(
  val debugEnable: Boolean,
  val experimentalGuardrails: Boolean,
  val serverEndpoint: String,
  val uiKindIsWeb: Boolean,
)


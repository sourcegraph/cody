@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

data class ConfigParams(
  val experimentalGuardrails: Boolean,
  val experimentalNoodle: Boolean,
  val serverEndpoint: String,
  val uiKindIsWeb: Boolean,
)


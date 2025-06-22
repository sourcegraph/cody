@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.agent.protocol_generated;

data class ExtensionConfiguration(
  val serverEndpoint: String? = null,
  val proxy: String? = null,
  val accessToken: String? = null,
  val customHeaders: Map<String, String>,
  val anonymousUserID: String? = null,
  val autocompleteAdvancedProvider: String? = null,
  val autocompleteAdvancedModel: String? = null,
  val debug: Boolean? = null,
  val verboseDebug: Boolean? = null,
  val telemetryClientName: String? = null,
  val codebase: String? = null,
  val customConfiguration: Map<String, Any>? = null,
  val customConfigurationJson: String? = null,
  val baseGlobalState: Map<String, Any>? = null,
)


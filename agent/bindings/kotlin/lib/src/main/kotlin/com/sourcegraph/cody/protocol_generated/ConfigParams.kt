@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ConfigParams(
  var debugEnable: Boolean? = null,
  var experimentalGuardrails: Boolean? = null,
  var serverEndpoint: String? = null,
  var os: String? = null,
  var arch: String? = null,
  var homeDir: String? = null,
  var extensionVersion: String? = null,
  var uiKindIsWeb: Boolean? = null,
)


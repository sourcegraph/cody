@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class ExtensionConfiguration(
  var serverEndpoint: String? = null,
  var proxy: String? = null,
  var accessToken: String? = null,
  var customHeaders: Map<String, String>? = null,
  var anonymousUserID: String? = null,
  var autocompleteAdvancedProvider: String? = null,
  var autocompleteAdvancedModel: String? = null,
  var debug: Boolean? = null,
  var verboseDebug: Boolean? = null,
  var codebase: String? = null,
  var eventProperties: EventProperties? = null,
  var customConfiguration: Map<String, Any>? = null,
)


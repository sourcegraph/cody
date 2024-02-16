@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class Event(
  var event: String? = null,
  var userCookieID: String? = null,
  var url: String? = null,
  var source: String? = null,
  var argument: String? = null,
  var publicArgument: String? = null,
  var client: String? = null,
  var connectedSiteID: String? = null,
  var hashedLicenseKey: String? = null,
)


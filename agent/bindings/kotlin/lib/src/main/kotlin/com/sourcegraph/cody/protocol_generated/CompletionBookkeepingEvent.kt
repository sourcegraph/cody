@file:Suppress("FunctionName", "ClassName")
package com.sourcegraph.cody.protocol_generated

data class CompletionBookkeepingEvent(
  var id: CompletionLogID? = null,
  var startedAt: Int? = null,
  var networkRequestStartedAt: Int? = null,
  var startLoggedAt: Int? = null,
  var loadedAt: Int? = null,
  var suggestedAt: Int? = null,
  var suggestionLoggedAt: Int? = null,
  var suggestionAnalyticsLoggedAt: Int? = null,
  var acceptedAt: Int? = null,
  var items: List<CompletionItemInfo>? = null,
  var loggedPartialAcceptedLength: Int? = null,
)


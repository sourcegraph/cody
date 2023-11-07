package com.sourcegraph.cody.agent.protocol

data class CompletionEvent(
    var params: Params? = null,
    var startedAt: Double = 0.0,
    var networkRequestStartedAt: Double = 0.0,
    var startLoggedAt: Double = 0.0,
    var loadedAt: Double = 0.0,
    var suggestedAt: Double = 0.0,
    var suggestionLoggedAt: Double = 0.0,
    var acceptedAt: Double = 0.0,
) {
  data class Params(
      var type: String? = null,
      var multiline: Boolean = false,
      var multilineMode: String? = null,
      var providerIdentifier: String? = null,
      var languageId: String? = null,
      var contextSummary: ContextSummary? = null,
      var source: String? = null,
      var id: String? = null,
      var lineCount: Int? = null,
      var charCount: Int? = null
  )

  data class ContextSummary(
      var embeddings: Double? = null,
      var local: Double? = null,
      var duration: Double = 0.0,
  )
}

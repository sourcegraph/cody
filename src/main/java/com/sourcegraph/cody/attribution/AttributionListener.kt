package com.sourcegraph.cody.attribution

import com.intellij.openapi.application.ApplicationManager
import com.sourcegraph.cody.agent.protocol.AttributionSearchResponse

/**
 * [AttributionListener] responds to attribution search state changes.
 *
 * The interface does not convey any contract about execution thread. The caller and callee should
 * make sure of proper execution.
 */
interface AttributionListener {
  /** Notifies the listener that attribution search has started. */
  fun onAttributionSearchStart()

  /** Notifies the listener of the result of attribution search. */
  fun updateAttribution(attribution: AttributionSearchResponse)

  /**
   * Wraps given [AttributionListener] so that all notifications are delivered asynchronously on UI
   * thread.
   */
  class UiThreadDecorator(private val delegate: AttributionListener) : AttributionListener {
    override fun onAttributionSearchStart() {
      ApplicationManager.getApplication().invokeLater { delegate.onAttributionSearchStart() }
    }

    override fun updateAttribution(attribution: AttributionSearchResponse) {
      ApplicationManager.getApplication().invokeLater { delegate.updateAttribution(attribution) }
    }
  }
}

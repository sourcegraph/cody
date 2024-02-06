package com.sourcegraph.cody.ui

import com.intellij.openapi.project.Project
import com.intellij.util.concurrency.annotations.RequiresEdt
import com.sourcegraph.cody.agent.CurrentConfigFeatures
import com.sourcegraph.cody.agent.protocol.AttributionSearchResponse
import com.sourcegraph.cody.attribution.AttributionListener
import com.sourcegraph.common.CodyBundle
import com.sourcegraph.common.CodyBundle.fmt

class AttributionButtonController(val button: ConditionalVisibilityButton) : AttributionListener {

  private val extraUpdates: MutableList<Runnable> = ArrayList()

  companion object {
    fun setup(project: Project): AttributionButtonController {
      val button =
          ConditionalVisibilityButton(CodyBundle.getString("chat.attribution.searching.label"))
      button.isEnabled = false // non-clickable
      val currentConfigFeatures: CurrentConfigFeatures =
          project.getService(CurrentConfigFeatures::class.java)
      // Only display the button if attribution is enabled.
      button.visibilityAllowed = currentConfigFeatures.get().attribution
      return AttributionButtonController(button)
    }
  }

  @RequiresEdt
  override fun onAttributionSearchStart() {
    button.toolTipText = CodyBundle.getString("chat.attribution.searching.tooltip")
  }

  @RequiresEdt
  override fun updateAttribution(attribution: AttributionSearchResponse) {
    if (attribution.error != null) {
      button.text = CodyBundle.getString("chat.attribution.error.label")
      button.toolTipText =
          CodyBundle.getString("chat.attribution.error.tooltip").fmt(attribution.error)
    } else if (attribution.repoNames.isEmpty()) {
      button.text = CodyBundle.getString("chat.attribution.success.label")
      button.toolTipText = CodyBundle.getString("chat.attribution.success.tooltip")
    } else {
      val count = "${attribution.repoNames.size}" + if (attribution.limitHit) "+" else ""
      val repoNames =
          attribution.repoNames.joinToString(
              prefix = "<ul><li>", separator = "</li><li>", postfix = "</li></ul>")
      button.text = CodyBundle.getString("chat.attribution.failure.label")
      button.toolTipText =
          CodyBundle.getString("chat.attribution.failure.tooltip").fmt(count, repoNames)
    }
    button.updatePreferredSize()
    for (action in extraUpdates) {
      action.run()
    }
  }

  /** Run extra actions on button update, like resizing components. */
  fun onUpdate(action: Runnable) {
    extraUpdates += action
  }
}

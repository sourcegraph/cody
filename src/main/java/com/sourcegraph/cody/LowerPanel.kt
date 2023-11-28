package com.sourcegraph.cody

import com.intellij.ui.ColorUtil
import com.intellij.util.ui.UIUtil
import com.sourcegraph.cody.context.EmbeddingStatusView
import java.awt.BorderLayout
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.JPanel

class LowerPanel(
    stopGeneratingButtonPanel: JPanel,
    promptPanel: PromptPanel,
    embeddingStatusView: EmbeddingStatusView
) : JPanel(BorderLayout()) {
  init {
    val borderColor = ColorUtil.brighter(UIUtil.getPanelBackground(), 3)
    val topBorder = BorderFactory.createMatteBorder(1, 0, 0, 0, borderColor)
    embeddingStatusView.border = topBorder
    border = embeddingStatusView.border
    layout = BoxLayout(this, BoxLayout.Y_AXIS)
    add(stopGeneratingButtonPanel)
    add(promptPanel)
    add(embeddingStatusView)
  }
}

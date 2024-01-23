package com.sourcegraph.cody

import com.intellij.openapi.ui.VerticalFlowLayout
import com.sourcegraph.cody.context.ui.EnhancedContextPanel
import java.awt.BorderLayout
import javax.swing.JPanel

class LowerPanel(
    stopGeneratingButtonPanel: JPanel,
    promptPanel: PromptPanel,
    contextView: EnhancedContextPanel
) : JPanel(BorderLayout()) {
  init {
    border = contextView.border
    layout = VerticalFlowLayout()
    add(stopGeneratingButtonPanel)
    add(promptPanel)
    add(contextView)
  }
}

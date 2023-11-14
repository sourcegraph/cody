package com.sourcegraph.cody

import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.border.EmptyBorder

class ControlsPanel(
    promptPanel: PromptPanel,
    sendButton: JButton,
) : JPanel() {

  init {
    layout = BorderLayout()
    border = EmptyBorder(JBUI.insets(0, 14, 14, 14))

    add(promptPanel, BorderLayout.NORTH)
    add(sendButton, BorderLayout.EAST)
  }
}

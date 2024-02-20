package com.sourcegraph.cody.ui

import com.intellij.ui.CellRendererPanel
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.chat.ui.LLMDropdown
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.BorderFactory
import javax.swing.DefaultListCellRenderer
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel

class LLMComboBoxRenderer(private val llmDropdown: LLMDropdown) : DefaultListCellRenderer() {

  var isCurrentUserFree: Boolean = false

  override fun getListCellRendererComponent(
      list: JList<*>?,
      llmComboBoxItem: Any?,
      index: Int,
      isSelected: Boolean,
      cellHasFocus: Boolean
  ): Component {
    val component =
        super.getListCellRendererComponent(list, llmComboBoxItem, index, isSelected, cellHasFocus)
    if (llmComboBoxItem !is LLMComboBoxItem) {
      return this
    }

    val panel = CellRendererPanel(BorderLayout())
    val iconLabel = JLabel(llmComboBoxItem.icon)
    panel.add(iconLabel, BorderLayout.WEST)

    val textBadgePanel = JPanel(BorderLayout())
    textBadgePanel.add(JLabel(llmComboBoxItem.name), BorderLayout.CENTER)
    textBadgePanel.border = BorderFactory.createEmptyBorder(0, 5, 0, 0)
    if (llmComboBoxItem.codyProOnly && isCurrentUserFree) {
      textBadgePanel.add(JLabel(Icons.LLM.ProSticker), BorderLayout.EAST)
    }

    if (llmDropdown.isEnabled) {
      textBadgePanel.background = component.background
      textBadgePanel.foreground = component.foreground
    }

    panel.add(textBadgePanel, BorderLayout.CENTER)
    return panel
  }
}

package com.sourcegraph.cody.ui

import com.intellij.ui.CellRendererPanel
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.Icons
import com.sourcegraph.cody.agent.protocol_extensions.displayName
import com.sourcegraph.cody.agent.protocol_extensions.getIcon
import com.sourcegraph.cody.agent.protocol_extensions.isCodyProOnly
import com.sourcegraph.cody.agent.protocol_generated.Model
import com.sourcegraph.cody.chat.ui.LlmDropdown
import com.sourcegraph.cody.edit.EditCommandPrompt
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.BorderFactory
import javax.swing.DefaultListCellRenderer
import javax.swing.JLabel
import javax.swing.JList
import javax.swing.JPanel

class LlmComboBoxRenderer(private val llmDropdown: LlmDropdown) : DefaultListCellRenderer() {

  override fun getListCellRendererComponent(
      list: JList<*>?,
      model: Any?,
      index: Int,
      isSelected: Boolean,
      cellHasFocus: Boolean
  ): Component {
    val component = super.getListCellRendererComponent(list, model, index, isSelected, cellHasFocus)
    if (model !is Model) {
      return this
    }
    val panel = CellRendererPanel(BorderLayout())
    val iconLabel = JLabel(model.getIcon())
    panel.add(iconLabel, BorderLayout.WEST)

    val textBadgePanel = JPanel(BorderLayout())
    val displayNameLabel = JLabel(model.displayName())
    textBadgePanel.add(displayNameLabel, BorderLayout.CENTER)
    textBadgePanel.border = BorderFactory.createEmptyBorder(0, 5, 0, 0)
    if (model.isCodyProOnly() && llmDropdown.isCurrentUserFree()) {
      textBadgePanel.add(JLabel(Icons.LLM.ProSticker), BorderLayout.EAST)
    }
    val isInline = llmDropdown.parentDialog != null
    if (isInline) {
      background = EditCommandPrompt.textFieldBackground()
      iconLabel.border = JBUI.Borders.empty()
    }
    if (llmDropdown.isEnabled) {
      textBadgePanel.background = if (isInline) background else component.background
      textBadgePanel.foreground = if (isInline) background else component.foreground
    }
    listOf(displayNameLabel, textBadgePanel, panel).forEach { it.isEnabled = llmDropdown.isEnabled }

    panel.add(textBadgePanel, BorderLayout.CENTER)
    return panel
  }
}

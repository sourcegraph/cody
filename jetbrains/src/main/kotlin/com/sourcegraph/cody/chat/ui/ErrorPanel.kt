package com.sourcegraph.cody.chat.ui

import com.intellij.ui.SimpleTextAttributes
import com.intellij.util.ui.JBUI
import com.sourcegraph.Icons
import com.sourcegraph.common.CodyBundle
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTextPane
import javax.swing.text.SimpleAttributeSet
import javax.swing.text.StyleConstants

class ErrorPanel : JPanel(GridBagLayout()) {
  private val description =
      JTextPane().apply {
        text = CodyBundle.getString("ErrorPanel.content")
        foreground = SimpleTextAttributes.GRAY_ATTRIBUTES.fgColor
        val center = SimpleAttributeSet()
        StyleConstants.setAlignment(center, StyleConstants.ALIGN_CENTER)
        styledDocument.setParagraphAttributes(0, styledDocument.length, center, false)
      }

  private val label =
      JLabel(CodyBundle.getString("ErrorPanel.label")).apply { icon = Icons.CodyLogoSlash }

  init {
    val constraints =
        GridBagConstraints().apply {
          fill = GridBagConstraints.HORIZONTAL
          gridx = 0
          insets = JBUI.insets(20)
        }

    add(label, constraints)
    add(description, constraints)
  }
}

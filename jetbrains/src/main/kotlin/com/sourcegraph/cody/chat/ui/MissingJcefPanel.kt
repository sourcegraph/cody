package com.sourcegraph.cody.chat.ui

import com.intellij.openapi.projectRoots.impl.jdkDownloader.RuntimeChooserUtil
import com.intellij.ui.SimpleTextAttributes
import com.intellij.util.ui.JBUI
import com.sourcegraph.cody.initialization.VerifyJavaBootRuntimeVersion
import com.sourcegraph.common.CodyBundle
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.JTextPane
import javax.swing.text.SimpleAttributeSet
import javax.swing.text.StyleConstants

class MissingJcefPanel : JPanel(GridBagLayout()) {
  private val jcefDescription =
      JTextPane().apply {
        text = CodyBundle.getString("MissingJcefPanel.content")
        foreground = SimpleTextAttributes.GRAY_ATTRIBUTES.fgColor
        val center = SimpleAttributeSet()
        StyleConstants.setAlignment(center, StyleConstants.ALIGN_CENTER)
        styledDocument.setParagraphAttributes(0, styledDocument.length, center, false)
      }

  // Primary action: auto-switch to a JCEF runtime
  private val autoSwitchButton =
      JButton(CodyBundle.getString("switchToJcefRuntime.button")).apply {
        addActionListener { VerifyJavaBootRuntimeVersion.chooseJcefRuntimeAutomatically() }
      }

  // Secondary action: manual runtime selection
  private val manualChoiceButton =
      JButton(CodyBundle.getString("chooseRuntimeWithJcef.button")).apply {
        addActionListener { RuntimeChooserUtil.showRuntimeChooserPopup() }
      }

  init {
    val constraints =
        GridBagConstraints().apply {
          fill = GridBagConstraints.HORIZONTAL
          gridx = 0
          insets = JBUI.insets(20)
        }

    add(jcefDescription, constraints)
    add(autoSwitchButton, constraints)
    add(manualChoiceButton, constraints)
  }
}

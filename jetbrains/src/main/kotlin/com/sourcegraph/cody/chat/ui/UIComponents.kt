package com.sourcegraph.cody.chat.ui

import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import java.awt.Component
import java.awt.Dimension
import javax.swing.Icon
import javax.swing.JButton
import javax.swing.plaf.ButtonUI

object UIComponents {

  @JvmStatic
  fun createMainButton(text: String): JButton {
    val button = JButton(text)
    button.maximumSize = Dimension(Short.MAX_VALUE.toInt(), button.getPreferredSize().height)
    button.setAlignmentX(Component.CENTER_ALIGNMENT)
    val buttonUI = DarculaButtonUI.createUI(button) as ButtonUI
    button.setUI(buttonUI)
    return button
  }

  @JvmStatic
  fun createMainButton(text: String, icon: Icon): JButton {
    val button = createMainButton(text)
    button.putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
    button.icon = icon
    return button
  }
}

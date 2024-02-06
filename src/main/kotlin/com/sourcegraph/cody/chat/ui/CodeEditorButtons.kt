package com.sourcegraph.cody.chat.ui

import com.sourcegraph.cody.chat.CodeEditorFactory
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.event.MouseMotionAdapter
import javax.swing.JButton
import javax.swing.JLayeredPane

class CodeEditorButtons(val buttons: Array<JButton>) {
  init {
    for (button in buttons) {
      button.addMouseMotionListener(
          object : MouseMotionAdapter() {
            override fun mouseMoved(e: MouseEvent) {
              setVisible(true)
            }
          })
      button.addMouseListener(
          object : MouseAdapter() {
            override fun mouseExited(e: MouseEvent) {
              setVisible(false)
            }
          })
    }
  }

  fun addButtons(layeredEditorPane: JLayeredPane, editorWidth: Int) {
    updateBounds(editorWidth)
    for (jButton in buttons) {
      layeredEditorPane.add(jButton, JLayeredPane.PALETTE_LAYER, 0)
    }
  }

  fun updateBounds(editorWidth: Int) {
    var shift = 0
    for (jButton in buttons) {
      val jButtonPreferredSize = jButton.preferredSize
      jButton.setBounds(
          editorWidth - jButtonPreferredSize.width - shift,
          0,
          jButtonPreferredSize.width,
          jButtonPreferredSize.height)
      if (jButtonPreferredSize.width > 0) { // Do not add space for collapsed button.
        shift += jButtonPreferredSize.width + CodeEditorFactory.spaceBetweenButtons
      }
    }
  }

  fun setVisible(visible: Boolean) {
    for (button in buttons) {
      button.isVisible = visible
    }
  }
}

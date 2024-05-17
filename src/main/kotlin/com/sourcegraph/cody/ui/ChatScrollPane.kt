package com.sourcegraph.cody.ui

import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBViewport
import java.awt.Point
import java.awt.Rectangle
import javax.swing.BorderFactory
import javax.swing.JPanel
import kotlin.math.max

class ChatScrollPane(private val messagesPanel: JPanel) :
    JBScrollPane(messagesPanel, VERTICAL_SCROLLBAR_AS_NEEDED, HORIZONTAL_SCROLLBAR_NEVER) {

  internal var touchingBottom = false

  init {
    border = BorderFactory.createEmptyBorder()
    verticalScrollBar.addAdjustmentListener { change ->
      val distance = change.value - verticalScrollBar.maximum + verticalScrollBar.visibleAmount
      touchingBottom = distance == 0
    }
    setViewport(
        object : JBViewport() {

          override fun scrollRectToVisible(bounds: Rectangle?) {}

          override fun setViewPosition(point: Point) {
            if (touchingBottom) {
              val maxHeight = max(0, messagesPanel.height - height)
              super.setViewPosition(Point(0, maxHeight))
            } else {
              super.setViewPosition(point)
            }
          }
        })
    setViewportView(messagesPanel)
  }
}

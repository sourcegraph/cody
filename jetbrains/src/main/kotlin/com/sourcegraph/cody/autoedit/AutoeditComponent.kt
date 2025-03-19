package com.sourcegraph.cody.autoedit

import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.Advertiser
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Container
import java.awt.Dimension
import java.awt.LayoutManager
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.ScrollPaneConstants

class AutoeditComponent(
    contentComponent: Component,
    private val advertiser: Advertiser,
) : JPanel(BorderLayout()) {

  private val myScrollPane: JScrollPane
  private val myBottomPanel = JPanel(AutoEditBottomLayout())

  init {
    myBottomPanel.add(advertiser.adComponent)
    myBottomPanel.background = JBUI.CurrentTheme.CompletionPopup.Advertiser.background()
    myBottomPanel.border = JBUI.CurrentTheme.CompletionPopup.Advertiser.border()
    add(myBottomPanel, BorderLayout.SOUTH)

    myScrollPane = ScrollPaneFactory.createScrollPane(contentComponent, true)
    myScrollPane.horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED
    myScrollPane.verticalScrollBar.putClientProperty(JBScrollPane.IGNORE_SCROLLBAR_IN_INSETS, true)
    add(myScrollPane, BorderLayout.CENTER)
  }

  private inner class AutoEditBottomLayout : LayoutManager {
    override fun addLayoutComponent(name: String, comp: Component) {}

    override fun removeLayoutComponent(comp: Component) {}

    override fun preferredLayoutSize(parent: Container): Dimension {
      val insets = parent.insets
      val adSize = advertiser.adComponent.preferredSize

      return Dimension(
          adSize.width + insets.left + insets.right, adSize.height + insets.top + insets.bottom)
    }

    override fun minimumLayoutSize(parent: Container): Dimension {
      val insets = parent.insets
      val adSize = advertiser.adComponent.minimumSize

      return Dimension(
          adSize.width + insets.left + insets.right, adSize.height + insets.top + insets.bottom)
    }

    override fun layoutContainer(parent: Container) {
      val insets = parent.insets
      val size = parent.size
      val innerHeight = size.height - insets.top - insets.bottom

      val adSize = advertiser.adComponent.preferredSize
      val x = size.width - insets.right
      val y = (innerHeight - adSize.height) / 2
      advertiser.adComponent.setBounds(insets.left, y + insets.top, x - insets.left, adSize.height)
    }
  }
}

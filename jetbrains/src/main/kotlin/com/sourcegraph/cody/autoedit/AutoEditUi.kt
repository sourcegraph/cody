package com.sourcegraph.cody.autoedit

import com.intellij.codeInsight.lookup.impl.LookupCellRenderer
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.LogicalPosition
import com.intellij.openapi.editor.event.VisibleAreaEvent
import com.intellij.ui.ComponentUtil
import com.intellij.ui.JBColor
import com.intellij.ui.ScreenUtil
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.Advertiser
import com.intellij.util.ui.JBUI
import com.sourcegraph.config.ThemeUtil
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Container
import java.awt.Dimension
import java.awt.LayoutManager
import java.awt.Point
import java.awt.Rectangle
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.ScrollPaneConstants
import javax.swing.SwingUtilities

class AutoEditUi(
    private val autoEdit: AutoEdit,
    advertiser: Advertiser,
) {
  private val myAdvertiser = advertiser
  private val modalityState: ModalityState
  private val myScrollPane: JScrollPane
  private val myBottomPanel = JPanel(AutoEditBottomLayout())

  val wrapperPanel = AutoEditWrapperPanel()
  val rules = "Hello world"

  val htmlPane =
      AutoEditHtmlPane().also {
        it.text =
            "<!DOCTYPE html>\n" +
                "<html lang=\"en\">\n" +
                "<head>\n" +
                "  <meta charset=\"UTF-8\">\n" +
                "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                "</head>\n" +
                "<body>\n" +
                //                "<pre>${text()}</pre>\n" +
                "  <img src=\"${image()}\">\n" +
                "</body>\n" +
                "</html>"
      }

  fun text(): String {
    return autoEdit.autocompleteEditResult.prediction
  }

  fun image(): String {
    val image = autoEdit.autocompleteEditResult.render.aside.image
    return if (ThemeUtil.isDarkTheme()) {
      image!!.dark
    } else {
      image!!.light
    }
  }

  init {
    myBottomPanel.add(myAdvertiser.adComponent)
    myBottomPanel.background = JBUI.CurrentTheme.CompletionPopup.Advertiser.background()
    myBottomPanel.border = JBUI.CurrentTheme.CompletionPopup.Advertiser.border()

    wrapperPanel.mainPanel.add(myBottomPanel, BorderLayout.SOUTH)

    myScrollPane = ScrollPaneFactory.createScrollPane(htmlPane, true)
    myScrollPane.horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED
    myScrollPane.verticalScrollBar.putClientProperty(JBScrollPane.IGNORE_SCROLLBAR_IN_INSETS, true)
    wrapperPanel.mainPanel.add(myScrollPane, BorderLayout.CENTER)

    autoEdit.editor.scrollingModel.addVisibleAreaListener(
        { e: VisibleAreaEvent ->
          wrapperPanel.mainPanel.setLocation(
              wrapperPanel.mainPanel.x,
              wrapperPanel.mainPanel.y - (e.newRectangle.y - e.oldRectangle.y))
        },
        autoEdit)

    modalityState = ModalityState.stateForComponent(autoEdit.editor.component)
  }

  // in layered pane coordinate system.
  fun calculatePosition(): Rectangle {
    val dim = wrapperPanel.preferredSize
    val editor = autoEdit.editor

    val position = autoEdit.autocompleteEditResult.render.aside.image!!.position
    val pos = LogicalPosition(position.line.toInt(), position.column.toInt())
    var location = editor.logicalPositionToXY(pos)
    // extra check for other borders
    //    val window = ComponentUtil.getWindow(wrapperPanel)
    //    if (window != null) {
    //      val point = SwingUtilities.convertPoint(wrapperPanel, 0, 0,
    // autoEdit.editor.contentComponent)
    //      location.x -= point.x
    //    }

    val editorComponent = editor.contentComponent
    //    SwingUtilities.convertPointToScreen(location, editorComponent)
    //    val screenRectangle = ScreenUtil.getScreenRectangle(editorComponent)
    //
    //    if (!screenRectangle.contains(location)) {
    //      location = ScreenUtil.findNearestPointOnBorder(screenRectangle, location)
    //    }

    val candidate = Rectangle(location, dim)
    ScreenUtil.cropRectangleToFitTheScreen(candidate)

    val rootPane = editor.component.rootPane
    if (rootPane != null) {
      SwingUtilities.convertPointFromScreen(location, rootPane.layeredPane)
    } else {
      LOG.error(
          "editor.disposed=" + editor.isDisposed + "; editorShowing=" + editorComponent.isShowing)
    }

    //    val result = Rectangle(location.x, location.y, dim.width, candidate.height)
    val result = Rectangle(0, 0, 300, 200)
    return result
  }

  inner class AutoEditWrapperPanel : JPanel() {
    val mainPanel: JPanel = JPanel(BorderLayout())

    init {
      isOpaque = false
      mainPanel.background = LookupCellRenderer.BACKGROUND_COLOR

      size = autoEdit.editor.contentComponent.visibleRect.size
      val window = ComponentUtil.getWindow(autoEdit.editor.contentComponent)
      val loc = SwingUtilities.convertPoint(autoEdit.editor.contentComponent, 0, 0, window)

      val verticalScrollOffset = autoEdit.editor.scrollingModel.verticalScrollOffset
      location = Point(loc.x, loc.y + verticalScrollOffset)
      border = JBUI.Borders.customLine(JBColor.CYAN, 3)

      add(mainPanel)
    }
  }

  private inner class AutoEditBottomLayout : LayoutManager {
    override fun addLayoutComponent(name: String, comp: Component) {}

    override fun removeLayoutComponent(comp: Component) {}

    override fun preferredLayoutSize(parent: Container): Dimension {
      val insets = parent.insets
      val adSize = myAdvertiser.adComponent.preferredSize

      return Dimension(
          adSize.width + insets.left + insets.right, adSize.height + insets.top + insets.bottom)
    }

    override fun minimumLayoutSize(parent: Container): Dimension {
      val insets = parent.insets
      val adSize = myAdvertiser.adComponent.minimumSize

      return Dimension(
          adSize.width + insets.left + insets.right, adSize.height + insets.top + insets.bottom)
    }

    override fun layoutContainer(parent: Container) {
      val insets = parent.insets
      val size = parent.size
      val innerHeight = size.height - insets.top - insets.bottom

      val adSize = myAdvertiser.adComponent.preferredSize
      val x = size.width - insets.right
      val y = (innerHeight - adSize.height) / 2
      myAdvertiser.adComponent.setBounds(
          insets.left, y + insets.top, x - insets.left, adSize.height)
    }
  }

  companion object {
    private val LOG = Logger.getInstance(AutoEditUi::class.java)
  }
}

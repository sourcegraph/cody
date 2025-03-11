package com.sourcegraph.cody.autoedit

import com.intellij.codeInsight.lookup.impl.LookupCellRenderer
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.event.VisibleAreaEvent
import com.intellij.openapi.editor.event.VisibleAreaListener
import com.intellij.openapi.util.Disposer
import com.intellij.ui.ComponentUtil
import com.intellij.ui.ExperimentalUI
import com.intellij.ui.JBColor
import com.intellij.ui.ScreenUtil
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.Advertiser
import com.intellij.util.ui.AsyncProcessIcon
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Container
import java.awt.Dimension
import java.awt.LayoutManager
import java.awt.Point
import java.awt.Rectangle
import javax.swing.JEditorPane
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
  private val processIcon = AsyncProcessIcon("Completion progress")
  private val myBottomPanel = JPanel(AutoEditBottomLayout())

  val wrapperPanel = AutoEditWrapperPanel()

  val htmlPane =
      JEditorPane(
          "text/html",
          "<!DOCTYPE html>\n" +
              "<html lang=\"en\">\n" +
              "<head>\n" +
              "  <meta charset=\"UTF-8\">\n" +
              "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
              "</head>\n" +
              "<body>\n" +
              "  <img src=\"data:image/png;base64,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\">\n" +
              "</body>\n" +
              "</html>")

  init {
    processIcon.isVisible = true

    myBottomPanel.add(myAdvertiser.adComponent)
    myBottomPanel.add(processIcon)
    myBottomPanel.background = JBUI.CurrentTheme.CompletionPopup.Advertiser.background()
    myBottomPanel.border = JBUI.CurrentTheme.CompletionPopup.Advertiser.border()

    wrapperPanel.mainPanel.add(myBottomPanel, BorderLayout.SOUTH)

    myScrollPane = ScrollPaneFactory.createScrollPane(htmlPane, true)
    myScrollPane.horizontalScrollBarPolicy = ScrollPaneConstants.HORIZONTAL_SCROLLBAR_AS_NEEDED
    myScrollPane.verticalScrollBar.putClientProperty(JBScrollPane.IGNORE_SCROLLBAR_IN_INSETS, true)
    myScrollPane.size = Dimension(JBUI.scale(200), JBUI.scale(100))
    myBottomPanel.size = Dimension(JBUI.scale(50), JBUI.scale(50))
    wrapperPanel.mainPanel.size = Dimension(JBUI.scale(300), JBUI.scale(200))
    if (!ExperimentalUI.isNewUI()) {
      val bodyInsets = JBUI.insets(4)
      myScrollPane.border = JBUI.Borders.empty(bodyInsets.top, 0, bodyInsets.bottom, 0)
    }

    wrapperPanel.mainPanel.add(myScrollPane, BorderLayout.CENTER)

    autoEdit.editor.scrollingModel.addVisibleAreaListener(
        object : VisibleAreaListener {
          override fun visibleAreaChanged(e: VisibleAreaEvent) {
            // todo: start over here
            wrapperPanel.mainPanel.setLocation(
                400, wrapperPanel.mainPanel.y - (e.newRectangle.y - e.oldRectangle.y))
          }
        },
        autoEdit)

    modalityState = ModalityState.stateForComponent(autoEdit.editor.component)

    Disposer.register(autoEdit) { processIcon.dispose() }
  }

  // in layered pane coordinate system.
  fun calculatePosition(): Rectangle {
    val autoEditComponent = wrapperPanel
    val dim = autoEditComponent.preferredSize
    val lookupStart = autoEdit.editor.caretModel.offset
    val editor = autoEdit.editor
    if (lookupStart < 0 || lookupStart > editor.document.textLength) {
      LOG.error(lookupStart.toString() + "; offset=" + editor.caretModel.offset + "; element=")
    }

    val pos = editor.offsetToLogicalPosition(lookupStart)
    var location = editor.logicalPositionToXY(pos)
    // extra check for other borders
    val window = ComponentUtil.getWindow(autoEditComponent)
    if (window != null) {
      val point = SwingUtilities.convertPoint(autoEditComponent, 0, 0, window)
      location.x -= point.x
    }

    val editorComponent = editor.contentComponent
    SwingUtilities.convertPointToScreen(location, editorComponent)
    val screenRectangle = ScreenUtil.getScreenRectangle(editorComponent)

    if (!screenRectangle.contains(location)) {
      location = ScreenUtil.findNearestPointOnBorder(screenRectangle, location)
    }

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
    val result = Rectangle(location.x, location.y, 300, 200)
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
      border = JBUI.Borders.customLine(JBColor.ORANGE, 3)

      add(mainPanel)
      mainPanel.location = Point(0, 0)
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

      var x = size.width - insets.right
      var y: Int

      if (processIcon.isVisible) {
        val myProcessIconSize = processIcon.preferredSize
        x -= myProcessIconSize.width
        y = (innerHeight - myProcessIconSize.height) / 2
        processIcon.setBounds(x, y + insets.top, myProcessIconSize.width, myProcessIconSize.height)
      }

      val adSize = myAdvertiser.adComponent.preferredSize
      y = (innerHeight - adSize.height) / 2
      myAdvertiser.adComponent.setBounds(
          insets.left, y + insets.top, x - insets.left, adSize.height)
    }
  }

  companion object {
    private val LOG = Logger.getInstance(AutoEditUi::class.java)
  }
}

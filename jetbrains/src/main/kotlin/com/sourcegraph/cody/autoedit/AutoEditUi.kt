package com.sourcegraph.cody.autoedit

import com.intellij.codeInsight.lookup.impl.LookupCellRenderer
import com.intellij.ide.ui.LafManager
import com.intellij.ide.ui.LafManagerListener
import com.intellij.ide.ui.UISettingsListener
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
import com.intellij.util.ui.UIUtil
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
  private val processIcon = AsyncProcessIcon("Completion progress")
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
                "  <img src=\"${image()}\">\n" +
                "</body>\n" +
                "</html>"
      }

    fun image(): String {
        val image = autoEdit.autocompleteEditResult.render.aside.image
        return if (UIUtil.isUnderDarcula()) {
            image!!.dark
        } else {
            image!!.light
        }
    }

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

package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.VisualPosition
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.Balloon
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Disposer
import com.intellij.ui.RelativeFont
import com.intellij.ui.awt.RelativePoint
import com.intellij.util.ui.Advertiser
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.PositionTracker
import com.intellij.util.ui.StartupUiUtil.labelFont
import com.intellij.util.ui.UIUtil
import com.sourcegraph.Icons
import com.sourcegraph.cody.agent.protocol_generated.AutoeditImageDiff
import com.sourcegraph.config.ThemeUtil
import java.awt.Font
import javax.swing.JComponent

class AutoEdit(
    val project: Project,
    val editor: Editor,
    private val autoEditImageDiff: AutoeditImageDiff
) : Disposable {

  private val balloon: Balloon
  private val autoEditComponent: JComponent
  private val advertiser =
      NewUILookupAdvertiser().also {
        it.addAdvertisement("Auto Edit from Cody", Icons.SourcegraphLogo)
      }

  init {

    val img = if (ThemeUtil.isDarkTheme()) autoEditImageDiff.dark else autoEditImageDiff.light
    autoEditComponent =
        AutoEditHtmlPane().also {
          it.text =
              "<!DOCTYPE html>\n" +
                  "<html lang=\"en\">\n" +
                  "<head>\n" +
                  "  <meta charset=\"UTF-8\">\n" +
                  "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n" +
                  "</head>\n" +
                  "<body>\n" +
                  "  <img src=\"$img\">\n" +
                  "</body>\n" +
                  "</html>"
        }

    val autoEditComponent = AutoEditComponent(autoEditComponent, advertiser)
    balloon =
        JBPopupFactory.getInstance()
            .createBalloonBuilder(autoEditComponent)
            .setCornerToPointerDistance(0)
            .setAnimationCycle(0)
            .setFillColor(UIUtil.getPanelBackground())
            .setBorderColor(UIUtil.getPanelBackground().darker())
            .setBorderInsets(JBUI.emptyInsets())
            .setCornerRadius(0)
            .setLayer(Balloon.Layer.top)
            .createBalloon()

    Disposer.register(this, balloon)
  }

  fun showAutoEdit(): Boolean {
    ApplicationManager.getApplication().assertIsDispatchThread()
    val position =
        VisualPosition(
            autoEditImageDiff.position.line.toInt(), autoEditImageDiff.position.column.toInt())

    balloon.show(
        object : PositionTracker<Balloon>(editor.contentComponent) {
          override fun recalculateLocation(balloon: Balloon): RelativePoint {
            return RelativePoint(editor.contentComponent, editor.visualPositionToXY(position))
          }
        },
        Balloon.Position.atRight)

    if (!autoEditComponent.isVisible || !autoEditComponent.isShowing) {
      hideAutoEdit()
      return false
    }

    return true
  }

  fun hideAutoEdit() {
    ApplicationManager.getApplication().assertIsDispatchThread()
    Disposer.dispose(this)
  }

  override fun dispose() {
    balloon.hideImmediately()
  }

  private class NewUILookupAdvertiser : Advertiser() {
    init {
      setBorder(JBUI.Borders.empty())
      setForeground(JBUI.CurrentTheme.CompletionPopup.Advertiser.foreground())
      setBackground(JBUI.CurrentTheme.CompletionPopup.Advertiser.background())
    }

    override fun adFont(): Font {
      val font = labelFont
      val relativeFont =
          RelativeFont.NORMAL.scale(JBUI.CurrentTheme.CompletionPopup.Advertiser.fontSizeOffset())
      return relativeFont.derive(font)
    }
  }
}

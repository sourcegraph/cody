package com.sourcegraph.cody.autoedit

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
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
import com.sourcegraph.cody.agent.protocol_generated.AutocompleteEditResult
import com.sourcegraph.config.ThemeUtil
import java.awt.Font

class AutoEdit(
    val project: Project,
    val editor: Editor,
    private val autocompleteEditResult: AutocompleteEditResult
) : Disposable {

  private val advertiser =
      NewUILookupAdvertiser().also {
        it.addAdvertisement("Auto Edit from Cody", Icons.SourcegraphLogo)
      }

  fun showAutoEdit(): Boolean {
    ApplicationManager.getApplication().assertIsDispatchThread()

    val image = autocompleteEditResult.render.aside.image
    if (image != null) {

      val img = if (ThemeUtil.isDarkTheme()) image.dark else image.light
      val component =
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

      val position = VisualPosition(image.position.line.toInt(), image.position.column.toInt())

      val autoEditComponent = AutoEditComponent(component, advertiser)

      val balloon =
          JBPopupFactory.getInstance()
              .createBalloonBuilder(autoEditComponent)
              .setCornerToPointerDistance(0)
              .setFillColor(UIUtil.getPanelBackground())
              .setBorderColor(UIUtil.getPanelBackground().darker())
              .setBorderInsets(JBUI.emptyInsets())
              .setCornerRadius(0)
              .setLayer(Balloon.Layer.top)
              .createBalloon()

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

    } else {
      TODO("Not yet implemented")
    }

    return true
  }

  fun hideAutoEdit() {
    ApplicationManager.getApplication().assertIsDispatchThread()
    doHide()
  }

  private fun doHide() {
    try {
      Disposer.dispose(this)
    } catch (e: Throwable) {
      LOG.error(e)
    }
  }

  override fun dispose() {}

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

  companion object {
    private val LOG = Logger.getInstance(AutoEdit::class.java)
  }
}

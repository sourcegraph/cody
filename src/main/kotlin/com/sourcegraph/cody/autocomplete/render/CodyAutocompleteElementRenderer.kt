package com.sourcegraph.cody.autocomplete.render

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorCustomElementRenderer
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.colors.impl.FontPreferencesImpl
import com.intellij.openapi.editor.impl.ComplementaryFontsRegistry
import com.intellij.openapi.editor.impl.FontInfo
import com.intellij.openapi.editor.markup.TextAttributes
import com.sourcegraph.cody.agent.protocol.AutocompleteItem
import com.sourcegraph.config.ConfigUtil.getCustomAutocompleteColor
import com.sourcegraph.config.ConfigUtil.isCustomAutocompleteColorEnabled
import java.awt.Font
import java.util.function.Supplier
import kotlin.math.ceil

abstract class CodyAutocompleteElementRenderer(
    val text: String,
    val completionItems: List<AutocompleteItem>,
    protected val editor: Editor,
    val type: AutocompleteRendererType
) : EditorCustomElementRenderer {
  protected val themeAttributes: TextAttributes

  init {
    val textAttributesFallback = Supplier {
      AutocompleteRenderUtil.getTextAttributesForEditor(editor)
    }
    themeAttributes =
        if (isCustomAutocompleteColorEnabled())
            getCustomAutocompleteColor()?.let {
              AutocompleteRenderUtil.getCustomTextAttributes(editor, it)
            } ?: textAttributesFallback.get()
        else textAttributesFallback.get()
  }

  override fun calcWidthInPixels(inlay: Inlay<*>): Int =
      fontInfoForText(text).fontMetrics().stringWidth(text)

  protected fun fontInfoForText(text: String): FontInfo {
    val preferences = FontPreferencesImpl()
    editor.colorsScheme.fontPreferences.copyTo(preferences)
    return ComplementaryFontsRegistry.getFontAbleToDisplay(
        text,
        0,
        text.length,
        Font.ITALIC,
        preferences,
        FontInfo.getFontRenderContext(editor.contentComponent))
  }

  fun fontYOffset(fontInfo: FontInfo): Double {
    val fontBaseline =
        fontInfo.font
            .createGlyphVector(fontInfo.fontRenderContext, "Hello world!")
            .visualBounds
            .height
    val linePadding = (editor.lineHeight - fontBaseline) / 2
    return ceil(fontBaseline + linePadding)
  }
}

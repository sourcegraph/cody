package com.sourcegraph.cody.autocomplete.render

import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.ui.JBColor
import com.sourcegraph.cody.autocomplete.render.InlayModelUtil.getAllInlaysForEditor

object AutocompleteRenderUtil {
  @JvmStatic
  fun getTextAttributesForEditor(editor: Editor): TextAttributes =
      try {
        editor.colorsScheme.getAttributes(
            DefaultLanguageHighlighterColors.INLAY_TEXT_WITHOUT_BACKGROUND)
      } catch (ignored: Exception) {
        editor.colorsScheme.getAttributes(DefaultLanguageHighlighterColors.INLINE_PARAMETER_HINT)
      }

  @JvmStatic
  fun getCustomTextAttributes(editor: Editor, fontColor: Int): TextAttributes {
    val color = JBColor(fontColor, fontColor) // set light & dark mode colors explicitly
    val attrs = getTextAttributesForEditor(editor).clone()
    attrs.foregroundColor = color
    return attrs
  }

  @JvmStatic
  fun rerenderAllAutocompleteInlays(editor: Editor) {
    getAllInlaysForEditor(editor)
        .filter { it.renderer is CodyAutocompleteElementRenderer }
        .forEach { inlayAutocomplete: Inlay<*> ->
          val renderer = inlayAutocomplete.renderer as CodyAutocompleteElementRenderer
          if (renderer is CodyAutocompleteSingleLineRenderer) {
            editor.inlayModel.addInlineElement(
                inlayAutocomplete.offset,
                CodyAutocompleteSingleLineRenderer(
                    renderer.text, renderer.completionItems, editor, renderer.type))
            inlayAutocomplete.dispose()
          } else if (renderer is CodyAutocompleteBlockElementRenderer) {
            editor.inlayModel.addInlineElement(
                inlayAutocomplete.offset,
                CodyAutocompleteBlockElementRenderer(
                    renderer.text, renderer.completionItems, editor))
            inlayAutocomplete.dispose()
          }
        }
  }
}

package com.sourcegraph.cody.autocomplete.render

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.InlayModel

object InlayModelUtil {
  @JvmStatic
  fun getAllInlays(inlayModel: InlayModel, startOffset: Int, endOffset: Int): List<Inlay<*>> {
    // can't use inlineModel.getInlineElementAt(caret.getVisualPosition()) here, as it
    // requires a write EDT thread;
    // we work around it by just looking at a range (potentially containing a single point)
    return listOf(
            inlayModel.getInlineElementsInRange(
                startOffset, endOffset, CodyAutocompleteElementRenderer::class.java),
            inlayModel.getBlockElementsInRange(
                startOffset, endOffset, CodyAutocompleteElementRenderer::class.java),
            inlayModel.getAfterLineEndElementsInRange(
                startOffset, endOffset, CodyAutocompleteElementRenderer::class.java))
        .flatten()
  }

  @JvmStatic
  fun getAllInlaysForEditor(editor: Editor): List<Inlay<*>> {
    val inlayModel =
        try {
          editor.inlayModel
        } catch (e: UnsupportedOperationException) {
          // Not all editors, for example ImaginaryEditor used in Intention Previews, support
          // inlays.
          return emptyList()
        }
    return getAllInlays(inlayModel, 0, editor.document.textLength)
  }
}

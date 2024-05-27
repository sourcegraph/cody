package com.sourcegraph.cody.autocomplete.render

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.Inlay
import com.intellij.openapi.editor.markup.TextAttributes
import com.sourcegraph.cody.agent.protocol.AutocompleteItem
import java.awt.Graphics
import java.awt.Rectangle

class CodyAutocompleteSingleLineRenderer(
    text: String,
    items: List<AutocompleteItem>,
    editor: Editor,
    type: AutocompleteRendererType
) : CodyAutocompleteElementRenderer(text, items, editor, type) {
  override fun paint(
      inlay: Inlay<*>,
      g: Graphics,
      targetRegion: Rectangle,
      textAttributes: TextAttributes
  ) {
    val fontInfo = fontInfoForText(text)
    g.font = fontInfo.font
    g.color = themeAttributes.foregroundColor
    val x = targetRegion.x
    val y = targetRegion.y + fontYOffset(fontInfo).toInt()
    g.drawString(text, x, y)
  }
}

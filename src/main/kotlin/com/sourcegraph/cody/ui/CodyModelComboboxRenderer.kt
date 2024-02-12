package com.sourcegraph.cody.ui

import java.awt.Component
import javax.swing.DefaultListCellRenderer
import javax.swing.JList

class CodyModelComboboxRenderer : DefaultListCellRenderer() {
  override fun getListCellRendererComponent(
      list: JList<*>?,
      value: Any?,
      index: Int,
      isSelected: Boolean,
      cellHasFocus: Boolean
  ): Component {
    super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)
    val item: CodyModelComboboxItem = value as CodyModelComboboxItem
    setText(item.name)
    setIcon(item.icon)

    return this
  }
}

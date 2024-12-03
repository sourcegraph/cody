package com.sourcegraph.cody.editor

import com.intellij.codeInsight.lookup.Lookup
import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupListener
import com.intellij.codeInsight.lookup.LookupManagerListener
import com.intellij.codeInsight.lookup.impl.LookupImpl
import com.intellij.openapi.diagnostic.Logger
import com.sourcegraph.cody.autocomplete.CodyAutocompleteManager.Companion.instance
import com.sourcegraph.cody.config.CodyApplicationSettings
import com.sourcegraph.cody.vscode.InlineCompletionTriggerKind

class CodyLookupListener : LookupManagerListener {
  private val logger = Logger.getInstance(CodyLookupListener::class.java)

  override fun activeLookupChanged(oldLookup: Lookup?, newLookup: Lookup?) {
    if (newLookup != null && CodyApplicationSettings.instance.isLookupAutocompleteEnabled) {
      val newEditor = newLookup.editor
      if (newLookup is LookupImpl) {
        newLookup.addLookupListener(
            object : LookupListener {
              override fun uiRefreshed() {
                val selectedValue = newLookup.list.getSelectedValue()
                if (selectedValue is LookupElement) {
                  var lookupString = selectedValue.lookupString
                  if (lookupString.startsWith(".")) {
                    lookupString = lookupString.substring(1)
                  }
                  val offset = newEditor.caretModel.offset
                  logger.debug("Triggering autocompletion for lookup element: $lookupString")
                  instance.triggerAutocomplete(
                      newEditor, offset, InlineCompletionTriggerKind.AUTOMATIC, lookupString)
                }
                super.uiRefreshed()
              }
            })
      }
    }
  }
}

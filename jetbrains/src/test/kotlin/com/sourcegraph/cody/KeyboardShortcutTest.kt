package com.sourcegraph.cody

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.util.SystemInfoRt
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import javax.swing.KeyStroke
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class KeyboardShortcutTest : BasePlatformTestCase() {

  // TODO: Need UI tests for testing Send Code Instructions hotkey.
  // There is no action id; it is a handled by a key listener in the EditCommandPrompt dialog.
  companion object {
    // These shortcuts in this declaration should match the table here:
    // https://linear.app/sourcegraph/document/keyboard-shortcuts-for-cody-on-jetbrains-2f8747a22530
    // The key shortcuts are bound in plugin.xml unless otherwise specified below.
    private val keysToActionIds =
        mapOf(
            "cody.acceptAutocompleteAction" to arrayOf("TAB", "TAB"), // Windows, macOS
            "cody.command.Explain" to arrayOf("ctrl alt 1", "ctrl alt 1"),
            "cody.command.Smell" to arrayOf("ctrl alt 2", "ctrl alt 2"),

            // This command also handles cody.inlineEditRetryAction:
            "cody.editCodeAction" to arrayOf("alt K", "ctrl alt ENTER"),
            "cody.documentCodeAction" to arrayOf("alt H", "ctrl alt H"),
            "cody.testCodeAction" to arrayOf("alt G", "ctrl alt G"),
            "cody.fixup.codelens.diff" to arrayOf("alt D", "ctrl alt K"),
            "cody.fixup.codelens.accept" to arrayOf("alt A", "ctrl alt A"),
            "cody.newChat" to arrayOf("ctrl alt 0", "ctrl alt 0"),
            "cody.openChat" to arrayOf("ctrl alt 9", "ctrl alt 9"),
            "cody.triggerAutocomplete" to arrayOf("control alt P", "control alt P"),
            "sourcegraph.openFindPopup" to arrayOf("alt S", "alt S"),
        )
  }

  @Test
  fun testShortcuts() {
    for ((actionId, expectedKeys) in keysToActionIds) {
      val (windowsKey, macKey) = expectedKeys

      val action = ActionManager.getInstance().getAction(actionId)
      checkNotNull(action) { "No action found for actionId: $actionId" }

      val actualKeyStrokes =
          action.shortcutSet.shortcuts
              .mapNotNull { shortcut ->
                when (shortcut) {
                  is KeyboardShortcut -> shortcut.firstKeyStroke
                  else -> null
                }
              }
              .toTypedArray()

      val key = if (SystemInfoRt.isMac) macKey else windowsKey
      val expectedKey = KeyStroke.getKeyStroke(key)

      assertTrue(
          "Incorrect keybinding for $actionId: expected $expectedKey, got ${actualKeyStrokes.contentToString()}",
          actualKeyStrokes.contains(expectedKey))
    }
  }
}

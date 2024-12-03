package com.sourcegraph.cody.autocomplete.render

import com.intellij.openapi.editor.impl.ImaginaryEditor
import com.intellij.testFramework.fixtures.BasePlatformTestCase

class InlayModelUtilTest : BasePlatformTestCase() {
  fun `test getAllInlaysForEditor`() {
    myFixture.configureByText("test.txt", "test")
    val imaginaryEditor = ImaginaryEditor(myFixture.project, myFixture.editor.document)
    val inlays = InlayModelUtil.getAllInlaysForEditor(imaginaryEditor)
    assertEquals(0, inlays.size)
  }
}

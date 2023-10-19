package com.sourcegraph.cody.autocomplete;

import com.sourcegraph.cody.vscode.TextDocument;
import java.net.URI;
import junit.framework.TestCase;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

public class UnstableCodegenLanguageUtilTest extends TestCase {

  private TextDocument textDocument(@Nullable String intelliJLanguageId, @NotNull String fileName) {
    return new TestTextDocument(URI.create("file://" + fileName), fileName, "", intelliJLanguageId);
  }

  public void testExtensionUsedIfIntelliJLanguageIdUndefined() {
    // given
    var input = textDocument(null, "foo.js");

    // when
    String output = UnstableCodegenLanguageUtil.getModelLanguageId(input);

    // then
    assertEquals("javascript", output);
  }

  public void testIntellijLanguageIdTakesPriorityIfExtensionUknown() {
    // given
    var input = textDocument("JAVA", "foo.unknown");

    // when
    String output = UnstableCodegenLanguageUtil.getModelLanguageId(input);

    // then
    assertEquals("java", output);
  }

  public void testIntellijLanguageIdTakesPriorityIfSupported() {
    // given
    var input = textDocument("JAVA", "foo.js");

    // when
    String output = UnstableCodegenLanguageUtil.getModelLanguageId(input);

    // then
    assertEquals("java", output);
  }

  public void testExtensionLanguageIdTakesPriorityIfIntelliJUnsupported() {
    // given
    var input = textDocument("something", "foo.js");

    // when
    String output = UnstableCodegenLanguageUtil.getModelLanguageId(input);

    // then
    assertEquals("javascript", output);
  }

  public void testUnsupportedExtensionUsedIfThereAreNoAlternatives() {
    // given
    var input = textDocument(null, "foo.unknown");

    // when
    String output = UnstableCodegenLanguageUtil.getModelLanguageId(input);

    // then
    assertEquals("unknown", output);
  }

  public void testFallbackReturnedWhenExtensionAndLanguageIdCantBeDetermined() {
    // given
    var input = textDocument(null, "foo");

    // when
    String output = UnstableCodegenLanguageUtil.getModelLanguageId(input);

    // then
    assertEquals("no-known-extension-detected", output);
  }
}

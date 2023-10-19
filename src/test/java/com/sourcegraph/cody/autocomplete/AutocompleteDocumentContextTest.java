package com.sourcegraph.cody.autocomplete;

import junit.framework.TestCase;

public class AutocompleteDocumentContextTest extends TestCase {
  public void testSkipCompletionIfLineSuffixContainsWordChars() {
    AutocompleteDocumentContext context1 = new AutocompleteDocumentContext("", "foo");
    assertFalse(context1.isCompletionTriggerValid());
    AutocompleteDocumentContext context2 = new AutocompleteDocumentContext("bar", "foo");
    assertFalse(context2.isCompletionTriggerValid());
    AutocompleteDocumentContext context3 = new AutocompleteDocumentContext("bar", " = 123; }");
    assertFalse(context3.isCompletionTriggerValid());
  }

  public void testSkipCompletionIfLinePrefixContainsText() {
    AutocompleteDocumentContext context1 = new AutocompleteDocumentContext("foo", "");
    assertFalse(context1.isCompletionTriggerValid());
    AutocompleteDocumentContext context2 = new AutocompleteDocumentContext("foo", ");");
    assertFalse(context2.isCompletionTriggerValid());
  }

  public void testSkipCompletionIfLinePrefixContainsTextPrecededByWhitespace() {
    AutocompleteDocumentContext context1 = new AutocompleteDocumentContext("  foo", "");
    assertFalse(context1.isCompletionTriggerValid());
    AutocompleteDocumentContext context2 = new AutocompleteDocumentContext("\t\tfoo", ");");
    assertFalse(context2.isCompletionTriggerValid());
  }

  public void testShouldTriggerCompletionIfLineSuffixIsSpecialCharsOnly() {
    AutocompleteDocumentContext context = new AutocompleteDocumentContext("if(", ") {");
    assertTrue(context.isCompletionTriggerValid());
  }
}

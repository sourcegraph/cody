package com.sourcegraph.cody.autocomplete;

import difflib.Patch;
import junit.framework.TestCase;

public class AutocompleteDiffTest extends TestCase {

  public void testMinimalDiff() {
    Patch<String> patch = CodyAutocompleteManager.diff("println()", "println(arrays());");
    // NOTE(olafurpg): ideally, we should get the delta size to 1. Myer's diff seems to emit
    // unnecessary deltas that we might be able to merge to reduce the number of displayed inlay
    // hints.
    assertEquals(2, patch.getDeltas().size());
  }
}

package com.sourcegraph.cody.vscode;

import com.sourcegraph.cody.agent.protocol.Range;

public class SelectedAutocompleteSuggestionInfo {
  public final Range range;
  public final String text;

  public SelectedAutocompleteSuggestionInfo(Range range, String text) {
    this.range = range;
    this.text = text;
  }
}

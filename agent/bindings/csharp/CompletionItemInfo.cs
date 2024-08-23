using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CompletionItemInfo
  {
    [JsonProperty(PropertyName = "parseErrorCount")]
    public int ParseErrorCount { get; set; }
    [JsonProperty(PropertyName = "lineTruncatedCount")]
    public int LineTruncatedCount { get; set; }
    [JsonProperty(PropertyName = "truncatedWith")]
    public string TruncatedWith { get; set; } // Oneof: tree-sitter, indentation
    [JsonProperty(PropertyName = "nodeTypes")]
    public NodeTypesParams NodeTypes { get; set; }
    [JsonProperty(PropertyName = "nodeTypesWithCompletion")]
    public NodeTypesWithCompletionParams NodeTypesWithCompletion { get; set; }
    [JsonProperty(PropertyName = "lineCount")]
    public int LineCount { get; set; }
    [JsonProperty(PropertyName = "charCount")]
    public int CharCount { get; set; }
    [JsonProperty(PropertyName = "insertText")]
    public string InsertText { get; set; }
    [JsonProperty(PropertyName = "stopReason")]
    public string StopReason { get; set; }
  }
}

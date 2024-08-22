using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CompletionItemInfo
  {

    [JsonPropertyName("parseErrorCount")]
    public int ParseErrorCount { get; set; }

    [JsonPropertyName("lineTruncatedCount")]
    public int LineTruncatedCount { get; set; }

    [JsonPropertyName("truncatedWith")]
    public TruncatedWithEnum TruncatedWith { get; set; } // Oneof: tree-sitter, indentation

    [JsonPropertyName("nodeTypes")]
    public NodeTypesParams NodeTypes { get; set; }

    [JsonPropertyName("nodeTypesWithCompletion")]
    public NodeTypesWithCompletionParams NodeTypesWithCompletion { get; set; }

    [JsonPropertyName("lineCount")]
    public int LineCount { get; set; }

    [JsonPropertyName("charCount")]
    public int CharCount { get; set; }

    [JsonPropertyName("insertText")]
    public string InsertText { get; set; }

    [JsonPropertyName("stopReason")]
    public string StopReason { get; set; }

    public enum TruncatedWithEnum
    {
      [JsonPropertyName("tree-sitter")]
      Tree-sitter,
      [JsonPropertyName("indentation")]
      Indentation,
    }
  }
}

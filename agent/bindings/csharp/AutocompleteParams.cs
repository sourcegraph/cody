using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AutocompleteParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("filePath")]
    public string FilePath { get; set; }

    [JsonPropertyName("position")]
    public Position Position { get; set; }

    [JsonPropertyName("triggerKind")]
    public TriggerKindEnum TriggerKind { get; set; } // Oneof: Automatic, Invoke

    [JsonPropertyName("selectedCompletionInfo")]
    public SelectedCompletionInfo SelectedCompletionInfo { get; set; }

    public enum TriggerKindEnum
    {
      [JsonPropertyName("Automatic")]
      Automatic,
      [JsonPropertyName("Invoke")]
      Invoke,
    }
  }
}

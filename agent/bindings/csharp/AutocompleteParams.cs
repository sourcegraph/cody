using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class AutocompleteParams
  {
    [JsonProperty(PropertyName = "uri")]
    public string Uri { get; set; }
    [JsonProperty(PropertyName = "filePath")]
    public string FilePath { get; set; }
    [JsonProperty(PropertyName = "position")]
    public Position Position { get; set; }
    [JsonProperty(PropertyName = "triggerKind")]
    public TriggerKindEnum TriggerKind { get; set; } // Oneof: Automatic, Invoke
    [JsonProperty(PropertyName = "selectedCompletionInfo")]
    public SelectedCompletionInfo SelectedCompletionInfo { get; set; }

    public enum TriggerKindEnum
    {
      [EnumMember(Value = "Automatic")]
      Automatic,
      [EnumMember(Value = "Invoke")]
      Invoke,
    }
  }
}

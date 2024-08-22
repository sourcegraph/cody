using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum CodeActionTriggerKind
  {
    [JsonPropertyName("Invoke")]
    Invoke,
    [JsonPropertyName("Automatic")]
    Automatic,
  }
}

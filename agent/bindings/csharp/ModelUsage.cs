using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum ModelUsage
  {
    [JsonPropertyName("chat")]
    Chat,
    [JsonPropertyName("edit")]
    Edit,
    [JsonPropertyName("autocomplete")]
    Autocomplete,
  }
}

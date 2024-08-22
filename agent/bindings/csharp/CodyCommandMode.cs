using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum CodyCommandMode
  {
    [JsonPropertyName("ask")]
    Ask,
    [JsonPropertyName("edit")]
    Edit,
    [JsonPropertyName("insert")]
    Insert,
  }
}

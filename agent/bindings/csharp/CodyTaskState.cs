using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum CodyTaskState
  {
    [JsonPropertyName("Idle")]
    Idle,
    [JsonPropertyName("Working")]
    Working,
    [JsonPropertyName("Inserting")]
    Inserting,
    [JsonPropertyName("Applying")]
    Applying,
    [JsonPropertyName("Applied")]
    Applied,
    [JsonPropertyName("Finished")]
    Finished,
    [JsonPropertyName("Error")]
    Error,
    [JsonPropertyName("Pending")]
    Pending,
  }
}

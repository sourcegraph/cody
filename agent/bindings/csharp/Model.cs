using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Model
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("usage")]
    public ModelUsage[] Usage { get; set; }

    [JsonPropertyName("contextWindow")]
    public ModelContextWindow ContextWindow { get; set; }

    [JsonPropertyName("clientSideConfig")]
    public ClientSideConfig ClientSideConfig { get; set; }

    [JsonPropertyName("provider")]
    public string Provider { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("tags")]
    public ModelTag[] Tags { get; set; }

    [JsonPropertyName("modelRef")]
    public ModelRef ModelRef { get; set; }
  }
}

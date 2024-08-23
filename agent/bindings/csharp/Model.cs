using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Model
  {
    [JsonProperty(PropertyName = "id")]
    public string Id { get; set; }
    [JsonProperty(PropertyName = "usage")]
    public ModelUsage[] Usage { get; set; }
    [JsonProperty(PropertyName = "contextWindow")]
    public ModelContextWindow ContextWindow { get; set; }
    [JsonProperty(PropertyName = "clientSideConfig")]
    public ClientSideConfig ClientSideConfig { get; set; }
    [JsonProperty(PropertyName = "provider")]
    public string Provider { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "tags")]
    public ModelTag[] Tags { get; set; }
    [JsonProperty(PropertyName = "modelRef")]
    public ModelRef ModelRef { get; set; }
  }
}

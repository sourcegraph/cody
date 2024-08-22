using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{

  public enum ModelTag
  {
    [JsonPropertyName("power")]
    Power,
    [JsonPropertyName("speed")]
    Speed,
    [JsonPropertyName("balanced")]
    Balanced,
    [JsonPropertyName("recommended")]
    Recommended,
    [JsonPropertyName("deprecated")]
    Deprecated,
    [JsonPropertyName("experimental")]
    Experimental,
    [JsonPropertyName("pro")]
    Pro,
    [JsonPropertyName("free")]
    Free,
    [JsonPropertyName("enterprise")]
    Enterprise,
    [JsonPropertyName("gateway")]
    Gateway,
    [JsonPropertyName("byok")]
    Byok,
    [JsonPropertyName("local")]
    Local,
    [JsonPropertyName("ollama")]
    Ollama,
    [JsonPropertyName("dev")]
    Dev,
  }
}

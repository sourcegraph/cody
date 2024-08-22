using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ModelContextWindow
  {

    [JsonPropertyName("input")]
    public int Input { get; set; }

    [JsonPropertyName("output")]
    public int Output { get; set; }

    [JsonPropertyName("context")]
    public ContextParams Context { get; set; }
  }
}

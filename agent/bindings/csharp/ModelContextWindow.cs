using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ModelContextWindow
  {
    [JsonProperty(PropertyName = "input")]
    public int Input { get; set; }
    [JsonProperty(PropertyName = "output")]
    public int Output { get; set; }
    [JsonProperty(PropertyName = "context")]
    public ContextParams Context { get; set; }
  }
}

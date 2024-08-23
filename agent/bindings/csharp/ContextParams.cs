using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ContextParams
  {
    [JsonProperty(PropertyName = "user")]
    public int User { get; set; }
  }
}

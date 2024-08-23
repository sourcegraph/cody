using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewDisposeParams
  {
    [JsonProperty(PropertyName = "handle")]
    public string Handle { get; set; }
  }
}

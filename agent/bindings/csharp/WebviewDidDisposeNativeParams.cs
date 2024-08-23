using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewDidDisposeNativeParams
  {
    [JsonProperty(PropertyName = "handle")]
    public string Handle { get; set; }
  }
}

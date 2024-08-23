using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewSetIconPathParams
  {
    [JsonProperty(PropertyName = "handle")]
    public string Handle { get; set; }
    [JsonProperty(PropertyName = "iconPathUri")]
    public string IconPathUri { get; set; }
  }
}

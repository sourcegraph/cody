using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewSetHtmlParams
  {
    [JsonProperty(PropertyName = "handle")]
    public string Handle { get; set; }
    [JsonProperty(PropertyName = "html")]
    public string Html { get; set; }
  }
}

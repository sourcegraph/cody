using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewSetHtmlParams
  {

    [JsonPropertyName("handle")]
    public string Handle { get; set; }

    [JsonPropertyName("html")]
    public string Html { get; set; }
  }
}

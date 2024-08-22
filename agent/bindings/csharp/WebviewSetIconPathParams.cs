using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewSetIconPathParams
  {

    [JsonPropertyName("handle")]
    public string Handle { get; set; }

    [JsonPropertyName("iconPathUri")]
    public string IconPathUri { get; set; }
  }
}

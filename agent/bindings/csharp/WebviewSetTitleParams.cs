using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewSetTitleParams
  {

    [JsonPropertyName("handle")]
    public string Handle { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }
  }
}

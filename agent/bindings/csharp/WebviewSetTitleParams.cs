using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewSetTitleParams
  {
    [JsonProperty(PropertyName = "handle")]
    public string Handle { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
  }
}

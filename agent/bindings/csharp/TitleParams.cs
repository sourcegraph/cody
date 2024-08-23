using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TitleParams
  {
    [JsonProperty(PropertyName = "text")]
    public string Text { get; set; }
    [JsonProperty(PropertyName = "icons")]
    public IconsParams[] Icons { get; set; }
  }
}

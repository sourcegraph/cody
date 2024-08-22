using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class TitleParams
  {

    [JsonPropertyName("text")]
    public string Text { get; set; }

    [JsonPropertyName("icons")]
    public IconsParams[] Icons { get; set; }
  }
}

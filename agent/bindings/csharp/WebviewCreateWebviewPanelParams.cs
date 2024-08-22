using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewCreateWebviewPanelParams
  {

    [JsonPropertyName("handle")]
    public string Handle { get; set; }

    [JsonPropertyName("viewType")]
    public string ViewType { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; }

    [JsonPropertyName("showOptions")]
    public ShowOptionsParams ShowOptions { get; set; }

    [JsonPropertyName("options")]
    public WebviewCreateWebviewPanelOptions Options { get; set; }
  }
}

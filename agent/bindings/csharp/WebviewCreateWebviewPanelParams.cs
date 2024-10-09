using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewCreateWebviewPanelParams
  {
    [JsonProperty(PropertyName = "handle")]
    public string Handle { get; set; }
    [JsonProperty(PropertyName = "viewType")]
    public string ViewType { get; set; }
    [JsonProperty(PropertyName = "title")]
    public string Title { get; set; }
    [JsonProperty(PropertyName = "showOptions")]
    public ShowOptionsParams ShowOptions { get; set; }
    [JsonProperty(PropertyName = "options")]
    public WebviewCreateWebviewPanelOptions Options { get; set; }
  }
}

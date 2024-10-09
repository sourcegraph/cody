using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewResolveWebviewViewParams
  {
    [JsonProperty(PropertyName = "viewId")]
    public string ViewId { get; set; }
    [JsonProperty(PropertyName = "webviewHandle")]
    public string WebviewHandle { get; set; }
  }
}

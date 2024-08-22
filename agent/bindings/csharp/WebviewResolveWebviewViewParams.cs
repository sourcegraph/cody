using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewResolveWebviewViewParams
  {

    [JsonPropertyName("viewId")]
    public string ViewId { get; set; }

    [JsonPropertyName("webviewHandle")]
    public string WebviewHandle { get; set; }
  }
}

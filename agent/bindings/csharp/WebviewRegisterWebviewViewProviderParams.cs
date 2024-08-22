using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewRegisterWebviewViewProviderParams
  {

    [JsonPropertyName("viewId")]
    public string ViewId { get; set; }

    [JsonPropertyName("retainContextWhenHidden")]
    public bool RetainContextWhenHidden { get; set; }
  }
}

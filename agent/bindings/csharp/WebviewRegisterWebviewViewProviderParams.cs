using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewRegisterWebviewViewProviderParams
  {
    [JsonProperty(PropertyName = "viewId")]
    public string ViewId { get; set; }
    [JsonProperty(PropertyName = "retainContextWhenHidden")]
    public bool RetainContextWhenHidden { get; set; }
  }
}

using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewRevealParams
  {
    [JsonProperty(PropertyName = "handle")]
    public string Handle { get; set; }
    [JsonProperty(PropertyName = "viewColumn")]
    public int ViewColumn { get; set; }
    [JsonProperty(PropertyName = "preserveFocus")]
    public bool PreserveFocus { get; set; }
  }
}

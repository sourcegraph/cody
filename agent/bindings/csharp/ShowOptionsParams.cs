using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ShowOptionsParams
  {
    [JsonProperty(PropertyName = "preserveFocus")]
    public bool PreserveFocus { get; set; }
    [JsonProperty(PropertyName = "viewColumn")]
    public int ViewColumn { get; set; }
  }
}

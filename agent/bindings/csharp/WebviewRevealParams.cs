using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class WebviewRevealParams
  {

    [JsonPropertyName("handle")]
    public string Handle { get; set; }

    [JsonPropertyName("viewColumn")]
    public int ViewColumn { get; set; }

    [JsonPropertyName("preserveFocus")]
    public bool PreserveFocus { get; set; }
  }
}

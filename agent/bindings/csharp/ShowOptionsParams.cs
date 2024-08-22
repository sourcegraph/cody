using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ShowOptionsParams
  {

    [JsonPropertyName("preserveFocus")]
    public bool PreserveFocus { get; set; }

    [JsonPropertyName("viewColumn")]
    public int ViewColumn { get; set; }
  }
}

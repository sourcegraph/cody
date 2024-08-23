using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class OptionsParams
  {
    [JsonProperty(PropertyName = "undoStopBefore")]
    public bool UndoStopBefore { get; set; }
    [JsonProperty(PropertyName = "undoStopAfter")]
    public bool UndoStopAfter { get; set; }
  }
}

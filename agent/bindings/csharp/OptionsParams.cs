using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class OptionsParams
  {

    [JsonPropertyName("undoStopBefore")]
    public bool UndoStopBefore { get; set; }

    [JsonPropertyName("undoStopAfter")]
    public bool UndoStopAfter { get; set; }
  }
}

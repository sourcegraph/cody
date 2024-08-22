using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodeActionsProvideParams
  {

    [JsonPropertyName("location")]
    public ProtocolLocation Location { get; set; }

    [JsonPropertyName("triggerKind")]
    public CodeActionTriggerKind TriggerKind { get; set; } // Oneof: Invoke, Automatic
  }
}

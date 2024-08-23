using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodeActionsProvideParams
  {
    [JsonProperty(PropertyName = "location")]
    public ProtocolLocation Location { get; set; }
    [JsonProperty(PropertyName = "triggerKind")]
    public CodeActionTriggerKind TriggerKind { get; set; } // Oneof: Invoke, Automatic
  }
}

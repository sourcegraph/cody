using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodeActionsProvideResult
  {
    [JsonProperty(PropertyName = "codeActions")]
    public ProtocolCodeAction[] CodeActions { get; set; }
  }
}

using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class CodeActionsProvideResult
  {

    [JsonPropertyName("codeActions")]
    public ProtocolCodeAction[] CodeActions { get; set; }
  }
}

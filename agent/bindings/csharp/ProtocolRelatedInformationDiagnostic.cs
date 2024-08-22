using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolRelatedInformationDiagnostic
  {

    [JsonPropertyName("location")]
    public ProtocolLocation Location { get; set; }

    [JsonPropertyName("message")]
    public string Message { get; set; }
  }
}

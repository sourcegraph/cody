using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class ProtocolRelatedInformationDiagnostic
  {
    [JsonProperty(PropertyName = "location")]
    public ProtocolLocation Location { get; set; }
    [JsonProperty(PropertyName = "message")]
    public string Message { get; set; }
  }
}

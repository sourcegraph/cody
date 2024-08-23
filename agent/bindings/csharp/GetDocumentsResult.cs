using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GetDocumentsResult
  {
    [JsonProperty(PropertyName = "documents")]
    public ProtocolTextDocument[] Documents { get; set; }
  }
}

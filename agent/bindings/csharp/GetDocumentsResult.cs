using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GetDocumentsResult
  {

    [JsonPropertyName("documents")]
    public ProtocolTextDocument[] Documents { get; set; }
  }
}

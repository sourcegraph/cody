using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class DisplayCodeLensParams
  {

    [JsonPropertyName("uri")]
    public string Uri { get; set; }

    [JsonPropertyName("codeLenses")]
    public ProtocolCodeLens[] CodeLenses { get; set; }
  }
}

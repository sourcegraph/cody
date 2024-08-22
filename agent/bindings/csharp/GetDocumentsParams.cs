using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GetDocumentsParams
  {

    [JsonPropertyName("uris")]
    public string[] Uris { get; set; }
  }
}

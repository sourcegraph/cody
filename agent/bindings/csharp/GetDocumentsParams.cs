using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class GetDocumentsParams
  {
    [JsonProperty(PropertyName = "uris")]
    public string[] Uris { get; set; }
  }
}

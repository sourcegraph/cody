using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class SelectedReposParams
  {

    [JsonPropertyName("id")]
    public string Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; }
  }
}

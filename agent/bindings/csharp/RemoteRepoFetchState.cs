using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoFetchState
  {

    [JsonPropertyName("state")]
    public StateEnum State { get; set; } // Oneof: paused, fetching, errored, complete

    [JsonPropertyName("error")]
    public CodyError Error { get; set; }

    public enum StateEnum
    {
      [JsonPropertyName("paused")]
      Paused,
      [JsonPropertyName("fetching")]
      Fetching,
      [JsonPropertyName("errored")]
      Errored,
      [JsonPropertyName("complete")]
      Complete,
    }
  }
}

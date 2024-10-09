using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class RemoteRepoFetchState
  {
    [JsonProperty(PropertyName = "state")]
    public StateEnum State { get; set; } // Oneof: paused, fetching, errored, complete
    [JsonProperty(PropertyName = "error")]
    public CodyError Error { get; set; }

    public enum StateEnum
    {
      [EnumMember(Value = "paused")]
      Paused,
      [EnumMember(Value = "fetching")]
      Fetching,
      [EnumMember(Value = "errored")]
      Errored,
      [EnumMember(Value = "complete")]
      Complete,
    }
  }
}

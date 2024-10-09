using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Event
  {
    [JsonProperty(PropertyName = "event")]
    public string Event { get; set; }
    [JsonProperty(PropertyName = "userCookieID")]
    public string UserCookieID { get; set; }
    [JsonProperty(PropertyName = "url")]
    public string Url { get; set; }
    [JsonProperty(PropertyName = "source")]
    public string Source { get; set; }
    [JsonProperty(PropertyName = "argument")]
    public string Argument { get; set; }
    [JsonProperty(PropertyName = "publicArgument")]
    public string PublicArgument { get; set; }
    [JsonProperty(PropertyName = "client")]
    public string Client { get; set; }
    [JsonProperty(PropertyName = "connectedSiteID")]
    public string ConnectedSiteID { get; set; }
    [JsonProperty(PropertyName = "hashedLicenseKey")]
    public string HashedLicenseKey { get; set; }
  }
}

using System.Text.Json.Serialization;

namespace Cody.Core.Agent.Protocol
{
  public class Event
  {

    [JsonPropertyName("event")]
    public string Event { get; set; }

    [JsonPropertyName("userCookieID")]
    public string UserCookieID { get; set; }

    [JsonPropertyName("url")]
    public string Url { get; set; }

    [JsonPropertyName("source")]
    public string Source { get; set; }

    [JsonPropertyName("argument")]
    public string Argument { get; set; }

    [JsonPropertyName("publicArgument")]
    public string PublicArgument { get; set; }

    [JsonPropertyName("client")]
    public string Client { get; set; }

    [JsonPropertyName("connectedSiteID")]
    public string ConnectedSiteID { get; set; }

    [JsonPropertyName("hashedLicenseKey")]
    public string HashedLicenseKey { get; set; }
  }
}

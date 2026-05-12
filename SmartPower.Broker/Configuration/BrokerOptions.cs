namespace SmartPower.Broker.Configuration;

public class BrokerOptions
{
    public const string SectionName = "Broker";
    public string IpAddress { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 1883;
}
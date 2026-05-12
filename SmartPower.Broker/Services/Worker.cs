using Microsoft.Extensions.Options;
using MQTTnet;
using MQTTnet.Server;
using SmartPower.Broker.Configuration;

namespace SmartPower.Broker.Services;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly BrokerOptions _options;
    private MqttServer _mqttServer;

    public Worker(ILogger<Worker> logger, IOptions<BrokerOptions> options)
    {
        _logger = logger;
        _options = options.Value;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var mqttFactory = new MqttFactory();

        var mqttServerOptions = mqttFactory.CreateServerOptionsBuilder()
            .WithDefaultEndpoint()
            .WithDefaultEndpointBoundIPAddress(System.Net.IPAddress.Parse(_options.IpAddress))
            .WithDefaultEndpointPort(_options.Port)
            .Build();

        _mqttServer = mqttFactory.CreateMqttServer(mqttServerOptions);

        _mqttServer.ClientConnectedAsync += e =>
        {
            _logger.LogInformation($"Klient po³¹czony: {e.ClientId}");
            return Task.CompletedTask;
        };

        _mqttServer.ClientDisconnectedAsync += e =>
        {
            _logger.LogWarning($"Klient roz³¹czony: {e.ClientId}");
            return Task.CompletedTask;
        };

        try
        {
            await _mqttServer.StartAsync();
            _logger.LogInformation("Lokalny Broker MQTT zosta³ uruchomiony na porcie 1883.");

            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation("Zatrzymywanie lokalnego brokera MQTT...");
        }
        catch (Exception ex)
        {
            _logger.LogCritical($"B³¹d uruchamiania brokera: {ex.Message}");
        }
        finally
        {
            await _mqttServer.StopAsync();
        }
    }
}
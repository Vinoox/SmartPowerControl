using MQTTnet;
using MQTTnet.Server;

namespace SmartPower.Broker;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private MqttServer _mqttServer;

    public Worker(ILogger<Worker> logger)
    {
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var mqttFactory = new MqttFactory();

        // Konfiguracja serwera
        var mqttServerOptions = mqttFactory.CreateServerOptionsBuilder()
            .WithDefaultEndpoint() // Domyœlnie port 1883
            .WithDefaultEndpointBoundIPAddress(System.Net.IPAddress.Parse("127.0.0.1"))
            .Build();

        _mqttServer = mqttFactory.CreateMqttServer(mqttServerOptions);

        // Zdarzenia logowania klientów
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
            // Ten wyj¹tek jest ca³kowicie normalny przy wy³¹czaniu programu (Ctrl+C)
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
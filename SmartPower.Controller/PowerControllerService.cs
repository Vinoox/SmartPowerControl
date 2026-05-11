using System.Diagnostics;
using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;

namespace SmartPower.Controller;

public class PowerControllerService : BackgroundService
{
    private readonly ILogger<PowerControllerService> _logger;
    private readonly PowerSystemState _state; // Dodany współdzielony stan
    private IMqttClient _mqttClient;

    private const string GHelperPath = @"C:\GHelper\GHelper.exe";

    // Wstrzykujemy FanSystemState przez konstruktor
    public PowerControllerService(ILogger<PowerControllerService> logger, PowerSystemState state)
    {
        _logger = logger;
        _state = state;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var factory = new MqttFactory();
        _mqttClient = factory.CreateMqttClient();

        var options = new MqttClientOptionsBuilder()
            .WithClientId("Brain_Controller")
            .WithTcpServer("127.0.0.1", 1883)
            .Build();

        _mqttClient.ApplicationMessageReceivedAsync += e =>
        {
            try
            {
                var payload = System.Text.Encoding.UTF8.GetString(e.ApplicationMessage.Payload);
                using var doc = JsonDocument.Parse(payload);

                // Zapisujemy aktualną temperaturę do współdzielonego stanu!
                _state.CurrentTemperature = doc.RootElement.GetProperty("temperature").GetDouble();

                EvaluateStateMachine(_state.CurrentTemperature);
            }
            catch (Exception ex)
            {
                _logger.LogError($"Błąd parsowania: {ex.Message}");
            }
            return Task.CompletedTask;
        };

        while (!stoppingToken.IsCancellationRequested)
        {
            if (!_mqttClient.IsConnected)
            {
                try
                {
                    await _mqttClient.ConnectAsync(options, stoppingToken);
                    var subOptions = factory.CreateSubscribeOptionsBuilder()
                        .WithTopicFilter(f => f.WithTopic("telemetry/cpu/temp"))
                        .Build();
                    await _mqttClient.SubscribeAsync(subOptions, stoppingToken);
                }
                catch { /* Ignorujemy błędy połączenia w pętli */ }
            }
            await Task.Delay(5000, stoppingToken);
        }
    }

    private void EvaluateStateMachine(double currentTemp)
    {
        int desiredMode = _state.CurrentMode;

        if (_state.CurrentMode == 1) // Aktualnie TURBO (Wysoka moc)
        {
            if (currentTemp >= _state.ThresholdSilent) desiredMode = 2; // Gwałtowny skok -> od razu Silent
            else if (currentTemp >= _state.ThresholdTurbo) desiredMode = 0; // Nagrzewa się -> Balanced
        }
        else if (_state.CurrentMode == 0 || _state.CurrentMode == -1) // Aktualnie BALANCED (Średnia moc)
        {
            if (currentTemp >= _state.ThresholdSilent) desiredMode = 2; // Za gorąco -> Silent (dławienie)
            else if (currentTemp <= _state.ThresholdTurbo - _state.Hysteresis) desiredMode = 1; // Wystygł -> wracamy na Turbo
        }
        else if (_state.CurrentMode == 2) // Aktualnie SILENT (Dławienie awaryjne)
        {
            if (currentTemp <= _state.ThresholdTurbo - _state.Hysteresis) desiredMode = 1; // Mocno wystygł -> od razu Turbo
            else if (currentTemp <= _state.ThresholdSilent - _state.Hysteresis) desiredMode = 0; // Trochę wystygł -> Balanced
        }

        if (desiredMode != _state.CurrentMode)
        {
            _logger.LogWarning($"[AKCJA - THROTTLING] Zmiana trybu na: {desiredMode}");
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = GHelperPath,
                    Arguments = $"/mode {desiredMode}",
                    UseShellExecute = false,
                    CreateNoWindow = true
                });
            }
            catch { }

            _state.CurrentMode = desiredMode;
        }
    }
}
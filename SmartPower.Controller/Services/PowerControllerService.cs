using System.Globalization;
using MQTTnet;
using MQTTnet.Client;
using Microsoft.Extensions.Options;
using SmartPower.Controller.Configuration;
using SmartPower.Controller.Domain;
using SmartPower.Controller.Infrastructure;

namespace SmartPower.Controller.Services;

public class PowerControllerService : BackgroundService
{
    private readonly ILogger<PowerControllerService> _logger;
    private readonly PowerSystemState _state;
    private readonly MqttOptions _mqttOptions;
    private readonly IPowerModeExecutor _powerExecutor;
    private IMqttClient _mqttClient;

    public PowerControllerService(
        ILogger<PowerControllerService> logger,
        PowerSystemState state,
        IOptions<MqttOptions> mqttOptions,
        IPowerModeExecutor powerExecutor)
    {
        _logger = logger;
        _state = state;
        _mqttOptions = mqttOptions.Value;
        _powerExecutor = powerExecutor;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var factory = new MqttFactory();
        _mqttClient = factory.CreateMqttClient();

        var options = new MqttClientOptionsBuilder()
                    .WithClientId("Brain_Controller")
                    .WithTcpServer(_mqttOptions.BrokerIp, _mqttOptions.Port)
                    .Build();

        _mqttClient.ApplicationMessageReceivedAsync += e =>
        {
            try
            {
                var topic = e.ApplicationMessage.Topic;
                var payload = System.Text.Encoding.UTF8.GetString(e.ApplicationMessage.PayloadSegment);

                if (float.TryParse(payload, NumberStyles.Float, CultureInfo.InvariantCulture, out float parsedValue))
                {
                    if (topic == _mqttOptions.TopicTemperature)
                    {
                        _state.CurrentTemperature = parsedValue;
                        EvaluateStateMachine(_state.CurrentTemperature);
                    }
                    else if (topic == _mqttOptions.TopicPower)
                    {
                        _state.CurrentCpuPower = parsedValue;
                    }
                }
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
                        .WithTopicFilter(f => f.WithTopic(_mqttOptions.TopicTemperature))
                        .WithTopicFilter(f => f.WithTopic(_mqttOptions.TopicPower))
                        .Build();

                    await _mqttClient.SubscribeAsync(subOptions, stoppingToken);
                    _logger.LogInformation("Zasubskrybowano topiki telemetryczne.");
                }
                catch { }
            }
            await Task.Delay(5000, stoppingToken);
        }
    }

    private void EvaluateStateMachine(float currentTemp)
    {
        PowerMode desiredMode = _state.CurrentMode;

        if (_state.CurrentMode == PowerMode.Turbo)
        {
            if (currentTemp >= _state.ThresholdSilent) desiredMode = PowerMode.Silent;
            else if (currentTemp >= _state.ThresholdTurbo) desiredMode = PowerMode.Balanced;
        }
        else if (_state.CurrentMode == PowerMode.Balanced || _state.CurrentMode == PowerMode.Unknown)
        {
            if (currentTemp >= _state.ThresholdSilent) desiredMode = PowerMode.Silent;
            else if (currentTemp <= _state.ThresholdTurbo - _state.Hysteresis) desiredMode = PowerMode.Turbo;
        }
        else if (_state.CurrentMode == PowerMode.Silent)
        {
            if (currentTemp <= _state.ThresholdTurbo - _state.Hysteresis) desiredMode = PowerMode.Turbo;
            else if (currentTemp <= _state.ThresholdSilent - _state.Hysteresis) desiredMode = PowerMode.Balanced;
        }

        if (desiredMode != _state.CurrentMode)
        {
            _logger.LogWarning($"[AKCJA - THROTTLING] Zmiana trybu na: {desiredMode}");
            _powerExecutor.SetMode(desiredMode);
            _state.CurrentMode = desiredMode;
        }
    }
}
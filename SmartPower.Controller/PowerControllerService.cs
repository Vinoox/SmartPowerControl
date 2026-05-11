using System.Runtime.InteropServices;
using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;

namespace SmartPower.Controller;

public class PowerControllerService : BackgroundService
{
    private readonly ILogger<PowerControllerService> _logger;
    private readonly PowerSystemState _state;
    private IMqttClient _mqttClient;

    [DllImport("user32.dll", SetLastError = true)]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

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
                catch { }
            }
            await Task.Delay(5000, stoppingToken);
        }
    }

    private void EvaluateStateMachine(double currentTemp)
    {
        int desiredMode = _state.CurrentMode;

        if (_state.CurrentMode == 1) // Aktualnie TURBO
        {
            if (currentTemp >= _state.ThresholdSilent) desiredMode = 2;
            else if (currentTemp >= _state.ThresholdTurbo) desiredMode = 0;
        }
        else if (_state.CurrentMode == 0 || _state.CurrentMode == -1) // Aktualnie BALANCED
        {
            if (currentTemp >= _state.ThresholdSilent) desiredMode = 2;
            else if (currentTemp <= _state.ThresholdTurbo - _state.Hysteresis) desiredMode = 1;
        }
        else if (_state.CurrentMode == 2) // Aktualnie SILENT
        {
            if (currentTemp <= _state.ThresholdTurbo - _state.Hysteresis) desiredMode = 1;
            else if (currentTemp <= _state.ThresholdSilent - _state.Hysteresis) desiredMode = 0;
        }

        if (desiredMode != _state.CurrentMode)
        {
            _logger.LogWarning($"[AKCJA - THROTTLING] Zmiana trybu na: {desiredMode}");

            // Wywołanie naszej nowej metody zamiast Process.Start()
            ExecuteGHelperHotkey(desiredMode);

            _state.CurrentMode = desiredMode;
        }
    }

    // Metoda symulująca ukryte skróty klawiszowe
    private void ExecuteGHelperHotkey(int modeId)
    {
        const byte VK_CONTROL = 0x11;
        const byte VK_SHIFT = 0x10;
        const byte VK_MENU = 0x12; // Alt
        const byte VK_F16 = 0x7F;  // Tryb Silent
        const byte VK_F17 = 0x80;  // Tryb Balanced
        const byte VK_F18 = 0x81;  // Tryb Turbo
        const uint KEYEVENTF_KEYUP = 0x0002;

        byte targetKey = modeId switch
        {
            2 => VK_F16,
            0 => VK_F17,
            1 => VK_F18,
            _ => 0
        };

        if (targetKey == 0) return;

        try
        {
            // 1. Wciskamy wirtualnie Ctrl + Shift + Alt
            keybd_event(VK_CONTROL, 0, 0, 0);
            keybd_event(VK_SHIFT, 0, 0, 0);
            keybd_event(VK_MENU, 0, 0, 0);

            // 2. Wciskamy wirtualnie odpowiedni klawisz F16, F17 lub F18
            keybd_event(targetKey, 0, 0, 0);

            // 3. Puszczamy klawisz F
            keybd_event(targetKey, 0, KEYEVENTF_KEYUP, 0);

            // 4. Puszczamy klawisze Ctrl + Shift + Alt
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);
        }
        catch (Exception ex)
        {
            _logger.LogError($"[BŁĄD] Wystąpił problem z systemową symulacją klawiatury: {ex.Message}");
        }
    }
}
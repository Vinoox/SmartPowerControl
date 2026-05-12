using System.Runtime.InteropServices;
using SmartPower.Controller.Domain;

namespace SmartPower.Controller.Infrastructure;

public class HotkeyExecutor : IPowerModeExecutor
{
    private readonly ILogger<HotkeyExecutor> _logger;

    [DllImport("user32.dll", SetLastError = true)]
    static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    public HotkeyExecutor(ILogger<HotkeyExecutor> logger)
    {
        _logger = logger;
    }

    public void SetMode(PowerMode mode)
    {
        const byte VK_CONTROL = 0x11;
        const byte VK_SHIFT = 0x10;
        const byte VK_MENU = 0x12;
        const byte VK_F16 = 0x7F;
        const byte VK_F17 = 0x80;
        const byte VK_F18 = 0x81;
        const uint KEYEVENTF_KEYUP = 0x0002;

        byte targetKey = mode switch
        {
            PowerMode.Silent => VK_F16,
            PowerMode.Balanced => VK_F17,
            PowerMode.Turbo => VK_F18,
            _ => 0
        };

        if (targetKey == 0) return;

        try
        {
            keybd_event(VK_CONTROL, 0, 0, 0);
            keybd_event(VK_SHIFT, 0, 0, 0);
            keybd_event(VK_MENU, 0, 0, 0);
            keybd_event(targetKey, 0, 0, 0);
            keybd_event(targetKey, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);

            _logger.LogInformation($"[HARDWARE] Wysłano sygnał zmiany trybu na: {mode}");
        }
        catch (Exception ex)
        {
            _logger.LogError($"[BŁĄD] Systemowa symulacja klawiatury: {ex.Message}");
        }
    }
}
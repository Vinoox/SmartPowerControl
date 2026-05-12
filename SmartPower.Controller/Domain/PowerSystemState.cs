using SmartPower.Controller.Domain;

public class PowerSystemState
{
    public float CurrentTemperature { get; set; }
    public float CurrentCpuPower { get; set; } // Dodane pole mocy
    public PowerMode CurrentMode { get; set; } = PowerMode.Unknown; // Enum zamiast int
    public float ThresholdTurbo { get; set; } = 60.0f;
    public float ThresholdSilent { get; set; } = 80.0f;
    public float Hysteresis { get; set; } = 3.0f;
}
namespace SmartPower.Controller;

public class PowerSystemState
{
    public double CurrentTemperature { get; set; }
    public PowerMode CurrentMode { get; set; } = PowerMode.Unknown;
    public double ThresholdTurbo { get; set; } = 60.0;
    public double ThresholdSilent { get; set; } = 80.0;
    public double Hysteresis { get; set; } = 3.0;
}
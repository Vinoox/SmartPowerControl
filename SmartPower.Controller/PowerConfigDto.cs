namespace SmartPower.Controller;

public class PowerConfigDto
{
    public float ThresholdTurbo { get; set; }
    public float ThresholdSilent { get; set; }
    public float Hysteresis { get; set; }
}